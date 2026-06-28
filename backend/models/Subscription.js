const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, enum: ['free', 'starter', 'pro'], default: 'free' },
  status: { type: String, enum: ['active', 'pending', 'expired', 'cancelled'], default: 'active' },
  orderId: { type: String },
  orderTrackingId: { type: String },
  amount: { type: Number },
  currency: { type: String, default: 'UGX' },
  expiresAt: { type: Date },
  pesapalRef: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);