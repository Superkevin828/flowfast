const express = require('express');
const { upload, listChats, createChat, sendMessage, uploadInChat, getStats, updateChatModel, renameChat, deleteChat } = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Static routes FIRST — before /:id params
router.get('/stats', authMiddleware, getStats);
router.get('/', authMiddleware, listChats);
router.post('/', authMiddleware, createChat);

// Param routes AFTER
router.post('/:id/messages', authMiddleware, sendMessage);
router.patch('/:id/model', authMiddleware, updateChatModel);
router.patch('/:id', authMiddleware, renameChat);
router.delete('/:id', authMiddleware, deleteChat);
router.post('/:id/upload', authMiddleware, upload.single('file'), uploadInChat);

module.exports = router;