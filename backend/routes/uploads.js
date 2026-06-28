const express = require('express');
const { upload, uploadFile, listFiles } = require('../controllers/fileController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, upload.single('file'), uploadFile);
router.get('/', authMiddleware, listFiles);

module.exports = router;
