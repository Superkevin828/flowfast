const mongoose = require('mongoose');

const fileItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    contentType: { type: String },
    size: { type: Number },
    filePath: { type: String },
    extractedText: { type: String, default: '' },
    structuredData: { type: Object, default: {} },
    status: { type: String, default: 'processed' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FileItem', fileItemSchema);
