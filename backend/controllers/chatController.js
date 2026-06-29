const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ChatSession = require('../models/ChatSession');
const FileItem = require('../models/FileItem');
const Subscription = require('../models/Subscription');
const aiService = require('../ai');

const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.png','.jpg','.jpeg','.csv','.xlsx','.xls','.json','.xml','.txt','.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('Unsupported file type'));
  }
});

async function getUserPlan(userId) {
  try {
    const sub = await Subscription.findOne({ userId, status: 'active' }).sort({ createdAt: -1 });
    return sub?.plan || 'free';
  } catch { return 'free'; }
}

async function readText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (['.json'].includes(ext)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }
  if (['.csv', '.txt', '.xml'].includes(ext)) return fs.readFileSync(filePath, 'utf8');
  return '';
}

async function listChats(req, res) {
  const chats = await ChatSession.find({ userId: req.user.id }).sort({ updatedAt: -1 });
  return res.json({ chats });
}

async function createChat(req, res) {
  const { title = 'New conversation', selectedModel = 'gemini' } = req.body;
  const externalId = `chat_${Date.now()}`;
  const chat = await ChatSession.create({ userId: req.user.id, title, externalId, lastMessage: '', selectedModel });
  return res.status(201).json({ chat });
}

/* Upload a file directly from chat and get an AI answer about it */
async function uploadInChat(req, res) {
  try {
    const { id } = req.params;
    const { message = '' } = req.body;

    const chat = await ChatSession.findOne({ _id: id, userId: req.user.id });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const plan = await getUserPlan(req.user.id);
    const rawText = await readText(req.file.path, req.file.originalname);

    // Save file record
    const extraction = await aiService.extractDocumentData({
      fileName: req.file.originalname,
      rawText,
      filePath: req.file.path,
      contentType: req.file.mimetype
    }, plan);

    const fileRecord = await FileItem.create({
      userId: req.user.id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      filePath: req.file.path,
      extractedText: rawText,
      structuredData: extraction.cleaned,
      status: 'processed'
    });

    // Now answer with this file in context
    const allFiles = await FileItem.find({ userId: req.user.id });
    const priorMessages = (chat.messages || []).slice(-10).map(m => ({ role: m.role, content: m.content }));

    const userPrompt = message.trim()
      ? message.trim()
      : `I just uploaded ${req.file.originalname}. Please summarize what's in it and tell me the key information.`;

    const reply = await aiService.answerQuery(userPrompt, allFiles, plan, priorMessages, chat.selectedModel);

    chat.messages = chat.messages || [];
    chat.messages.push({ role: 'user', content: `📎 Attached: ${req.file.originalname}${message.trim() ? '\n' + message.trim() : ''}` });
    chat.messages.push({ role: 'assistant', content: reply.answer });
    chat.lastMessage = req.file.originalname;
    chat.updatedAt = new Date();
    await chat.save();

    return res.json({ chat, reply, plan, file: fileRecord });
  } catch (err) {
    console.error('[uploadInChat]', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
}

async function sendMessage(req, res) {
  const { message } = req.body;
  const { id } = req.params;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const chat = await ChatSession.findOne({ _id: id, userId: req.user.id });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  const [files, plan] = await Promise.all([
    FileItem.find({ userId: req.user.id }),
    getUserPlan(req.user.id)
  ]);

  const priorMessages = (chat.messages || []).slice(-10).map(m => ({ role: m.role, content: m.content }));
  const reply = await aiService.answerQuery(message, files, plan, priorMessages, chat.selectedModel);

  chat.messages = chat.messages || [];
  chat.messages.push({ role: 'user', content: message });
  chat.messages.push({ role: 'assistant', content: reply.answer });
  chat.lastMessage = message;
  chat.updatedAt = new Date();
  await chat.save();

  return res.json({ chat, reply, plan });
}

async function updateChatModel(req, res) {
  const { id } = req.params;
  const { selectedModel } = req.body;
  if (!['claude', 'gemini'].includes(selectedModel)) return res.status(400).json({ error: 'Invalid model' });
  const chat = await ChatSession.findOneAndUpdate({ _id: id, userId: req.user.id }, { selectedModel }, { new: true });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  return res.json({ chat });
}

/* Stats for analyst dashboard */
async function getStats(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [allFiles, weekFiles, allChats, plan] = await Promise.all([
      FileItem.countDocuments({ userId }),
      FileItem.countDocuments({ userId, createdAt: { $gte: weekAgo } }),
      ChatSession.countDocuments({ userId }),
      getUserPlan(userId)
    ]);

    // Rough token estimate: ~500 tokens per message pair
    const mongoose = require('mongoose');
    const totalMessages = await ChatSession.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $project: { msgCount: { $size: { $ifNull: ['$messages', []] } } } },
      { $group: { _id: null, total: { $sum: '$msgCount' } } }
    ]);
    const msgCount = totalMessages[0]?.total || 0;
    const estimatedTokens = msgCount * 250;

    // Token limits by plan
    const limits = { free: 10000, starter: 100000, pro: 1000000 };
    const limit = limits[plan] || 10000;

    return res.json({
      plan,
      totalDocs: allFiles,
      docsThisWeek: weekFiles,
      totalChats: allChats,
      estimatedTokens,
      tokenLimit: limit,
      tokenPct: Math.min(100, Math.round((estimatedTokens / limit) * 100))
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { upload, listChats, createChat, sendMessage, uploadInChat, getStats, updateChatModel, renameChat, deleteChat };
// Rename a chat
async function renameChat(req, res) {
  const { id } = req.params;
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  const chat = await ChatSession.findOneAndUpdate(
    { _id: id, userId: req.user.id },
    { title: title.trim() },
    { new: true }
  );
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  return res.json({ chat });
}

// Delete a chat
async function deleteChat(req, res) {
  const { id } = req.params;
  const chat = await ChatSession.findOneAndDelete({ _id: id, userId: req.user.id });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  return res.json({ ok: true });
}