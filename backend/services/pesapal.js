/**
 * Pesapal v3 Service — FlowFast
 */
const https = require('https');

const PESAPAL_BASE = process.env.PESAPAL_ENV === 'live'
  ? 'https://pay.pesapal.com/v3'
  : 'https://cybqa.pesapal.com/pesapalv3';

let _tokenCache = null;

async function pesapalRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(PESAPAL_BASE + path);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getToken() {
  if (_tokenCache && new Date(_tokenCache.expiryDate) > new Date(Date.now() + 60000)) {
    return _tokenCache.token;
  }
  const res = await pesapalRequest('POST', '/api/Auth/RequestToken', {
    consumer_key: process.env.PESAPAL_CONSUMER_KEY,
    consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
  });
  if (!res.token) throw new Error('Pesapal auth failed: ' + JSON.stringify(res));
  _tokenCache = { token: res.token, expiryDate: res.expiryDate };
  return res.token;
}

async function registerIpn() {
  const token = await getToken();
  const ipnUrl = process.env.BACKEND_URL + '/api/payments/ipn';

  const existing = await pesapalRequest('GET', '/api/URLSetup/GetIpnList', null, token);
  if (Array.isArray(existing)) {
    const found = existing.find((i) => i.url === ipnUrl);
    if (found) return found.ipn_id;
  }

  const res = await pesapalRequest('POST', '/api/URLSetup/RegisterIPN', {
    url: ipnUrl,
    ipn_notification_type: 'GET'
  }, token);
  if (!res.ipn_id) throw new Error('IPN registration failed: ' + JSON.stringify(res));
  return res.ipn_id;
}

async function submitOrder({ orderId, amount, currency, description, email, firstName, lastName, phone, callbackUrl }) {
  const token = await getToken();
  const ipnId = await registerIpn();

  const res = await pesapalRequest('POST', '/api/Transactions/SubmitOrderRequest', {
    id: orderId,
    currency: currency || 'UGX',
    amount,
    description,
    callback_url: callbackUrl,
    notification_id: ipnId,
    billing_address: { email_address: email, phone_number: phone || '', first_name: firstName || '', last_name: lastName || '' }
  }, token);

  if (!res.order_tracking_id) throw new Error('Order submission failed: ' + JSON.stringify(res));
  return res;
}

async function getTransactionStatus(orderTrackingId) {
  const token = await getToken();
  return pesapalRequest('GET', '/api/Transactions/GetTransactionStatus?orderTrackingId=' + orderTrackingId, null, token);
}

module.exports = { getToken, submitOrder, getTransactionStatus };