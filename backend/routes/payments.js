const express = require('express');
const { getPlans, initiate, ipnCallback, confirmCallback, mySubscription } = require('../controllers/paymentController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/plans', getPlans);
router.post('/initiate', authMiddleware, initiate);
router.get('/ipn', ipnCallback);           // Pesapal server-to-server IPN
router.get('/confirm', authMiddleware, confirmCallback); // Frontend polls after redirect
router.get('/subscription', authMiddleware, mySubscription);

module.exports = router;