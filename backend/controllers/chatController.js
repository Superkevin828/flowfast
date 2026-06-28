const ChatSession = require('../models/ChatSession');
const FileItem = require('../models/FileItem');
const aiService = require('../ai');

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

  const files = await FileItem.find({ userId: req.user.id });
  const reply = await aiService.answerQuery(message, files);
  chat.lastMessage = message;
  chat.updatedAt = new Date();
  await chat.save();
  return res.json({ chat, reply });
}

module.exports = { listChats, createChat, sendMessage };
