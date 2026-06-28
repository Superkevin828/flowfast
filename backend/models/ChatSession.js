const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'New conversation' },
    externalId: { type: String, required: true },
    lastMessage: { type: String, default: '' },
    metadata: { type: Object, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatSession', chatSessionSchema);
