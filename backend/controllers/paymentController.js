const pesapal = require('../services/pesapal');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

const PLANS = {
  starter: { name: 'Starter', amount: 29000, currency: 'UGX', months: 1, description: 'FlowFast Starter - 1 Month' },
  pro:     { name: 'Pro',     amount: 89000, currency: 'UGX', months: 1, description: 'FlowFast Pro - 1 Month' }
};

async function getPlans(req, res) {
  res.json({ plans: PLANS });
}

async function initiate(req, res) {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const orderId = `FF-${Date.now()}-${req.user.id.toString().slice(-6)}`;
    const planDetails = PLANS[plan];
    const callbackUrl = `${process.env.FRONTEND_URL || process.env.BACKEND_URL}/payment/callback?orderId=${orderId}`;

    const result = await pesapal.submitOrder({
      orderId,
      amount: planDetails.amount,
      currency: planDetails.currency,
      description: planDetails.description,
      email: user.email,
      firstName: user.name.split(' ')[0],
      lastName: user.name.split(' ').slice(1).join(' ') || 'User',
      callbackUrl
    });

    // Save pending subscription
    await Subscription.create({
      userId: req.user.id,
      plan,
      status: 'pending',
      orderId,
      orderTrackingId: result.order_tracking_id,
      amount: planDetails.amount,
      currency: planDetails.currency
    });

    return res.json({
      redirectUrl: result.redirect_url,
      orderTrackingId: result.order_tracking_id,
      orderId
    });
  } catch (err) {
    console.error('[Payment] initiate error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function ipnCallback(req, res) {
  try {
    const { orderTrackingId, orderMerchantReference, orderNotificationType } = req.query;
    if (!orderTrackingId) return res.status(400).send('Missing orderTrackingId');

    const status = await pesapal.getTransactionStatus(orderTrackingId);
    const sub = await Subscription.findOne({ orderTrackingId });

    if (sub && status.payment_status_description === 'Completed') {
      const months = PLANS[sub.plan]?.months || 1;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + months);

      sub.status = 'active';
      sub.pesapalRef = status.confirmation_code;
      sub.expiresAt = expiresAt;
      await sub.save();
      console.log(`[Payment] Subscription activated for user ${sub.userId}, plan ${sub.plan}`);
    }

    // Pesapal requires a 200 response
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[Payment] IPN error:', err.message);
    return res.status(200).send('OK'); // Always 200 to Pesapal
  }
}

async function confirmCallback(req, res) {
  try {
    const { orderTrackingId, orderId } = req.query;
    if (!orderTrackingId) return res.status(400).json({ error: 'Missing orderTrackingId' });

    const status = await pesapal.getTransactionStatus(orderTrackingId);
    const sub = await Subscription.findOne({ orderTrackingId });

    return res.json({
      status: status.payment_status_description,
      plan: sub?.plan,
      expiresAt: sub?.expiresAt,
      confirmed: status.payment_status_description === 'Completed'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function mySubscription(req, res) {
  const sub = await Subscription.findOne({ userId: req.user.id, status: 'active' }).sort({ createdAt: -1 });
  return res.json({ subscription: sub || { plan: 'free', status: 'active' } });
}

module.exports = { getPlans, initiate, ipnCallback, confirmCallback, mySubscription };