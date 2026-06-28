const express = require('express');
const { listChats, createChat, sendMessage } = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, listChats);
router.post('/', authMiddleware, createChat);
router.post('/:id/messages', authMiddleware, sendMessage);

module.exports = router;
