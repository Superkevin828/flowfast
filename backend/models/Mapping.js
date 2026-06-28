const mongoose = require('mongoose');

const mappingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceField: { type: String, required: true },
    targetField: { type: String, required: true },
    description: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Mapping', mappingSchema);
