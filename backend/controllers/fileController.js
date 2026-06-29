const fs = require('fs');
const path = require('path');
const multer = require('multer');
const FileItem = require('../models/FileItem');
const aiService = require('../ai');

const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.csv', '.xlsx', '.xls', '.json', '.xml', '.txt', '.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      return cb(null, true);
    }
    cb(new Error('Unsupported file type'));
  }
});

async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const rawText = await readText(req.file.path, req.file.originalname);
    const extraction = await aiService.extractDocumentData({
      fileName: req.file.originalname,
      rawText,
      contentType: req.file.mimetype
    });

    const payload = {
      userId: req.user.id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      filePath: req.file.path,
      chatSession: req.body.chatId || null,
      extractedText: rawText,
      structuredData: extraction.cleaned,
      status: 'processed'
    };

    const fileRecord = await FileItem.create(payload);
    return res.status(201).json({ file: fileRecord, extraction });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'File processing failed' });
  }
}

async function listFiles(req, res) {
  const files = await FileItem.find({ userId: req.user.id }).sort({ createdAt: -1 });
  return res.json({ files });
}

async function readText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.json') {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  if (ext === '.csv' || ext === '.txt' || ext === '.xml') {
    return fs.readFileSync(filePath, 'utf8');
  }

  return `Uploaded ${originalName}. OCR and advanced parsers can be plugged in later.`;
}

module.exports = { upload, uploadFile, listFiles };
