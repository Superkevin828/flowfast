const ChatSession = require('../models/ChatSession');
const FileItem = require('../models/FileItem');
const Subscription = require('../models/Subscription');
const aiService = require('../ai');

/* Resolve the user's current plan — returns 'free' | 'starter' | 'pro' */
async function getUserPlan(userId) {
  try {
    const sub = await Subscription.findOne({ userId, status: 'active' }).sort({ createdAt: -1 });
    return sub?.plan || 'free';
  } catch {
    return 'free';
  }
}

async function listChats(req, res) {
  const chats = await ChatSession.find({ userId: req.user.id }).sort({ updatedAt: -1 });
  return res.json({ chats });
}

async function createChat(req, res) {
  const { title = 'New conversation' } = req.body;
  const externalId = `chat_${Date.now()}`;
  const chat = await ChatSession.create({ userId: req.user.id, title, externalId, lastMessage: '' });
  return res.status(201).json({ chat });
}

async function sendMessage(req, res) {
  const { message } = req.body;
  const { id } = req.params;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const chat = await ChatSession.findOne({ _id: id, userId: req.user.id });
  if (!chat) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  const [files, plan] = await Promise.all([
    FileItem.find({ userId: req.user.id }),
    getUserPlan(req.user.id)
  ]);

  const reply = await aiService.answerQuery(message, files, plan);

  // Persist message to chat history
  chat.messages = chat.messages || [];
  chat.messages.push({ role: 'user', content: message });
  chat.messages.push({ role: 'assistant', content: reply.answer });
  chat.lastMessage = message;
  chat.updatedAt = new Date();
  await chat.save();

  return res.json({ chat, reply, plan });
}

module.exports = { listChats, createChat, sendMessage };