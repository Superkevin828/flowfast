/* ── callback.js — payment callback page logic ──────────────────────── */
const TOKEN_KEY = 'flowfast-token';
function getToken() { return localStorage.getItem(TOKEN_KEY); }

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api' + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function checkPayment() {
  const params = new URLSearchParams(window.location.search);
  const orderTrackingId = params.get('OrderTrackingId') || params.get('orderTrackingId');
  const orderId = params.get('OrderMerchantReference') || params.get('orderId');

  if (!orderTrackingId) {
    showResult(false, 'Missing payment reference. Please contact support.');
    return;
  }

  for (let i = 0; i < 5; i++) {
    try {
      const data = await api('/payments/confirm?orderTrackingId=' + orderTrackingId + '&orderId=' + (orderId || ''));
      if (data.confirmed) {
        showResult(true, 'Payment confirmed! Your ' + (data.plan || '') + ' plan is now active.', data.expiresAt);
        return;
      }
      if (data.status === 'Failed') {
        showResult(false, 'Payment was not successful. Please try again.');
        return;
      }
    } catch (err) {
      console.error('Confirm error:', err.message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  showResult(null, 'Payment is being processed. Check your subscription status in a few minutes.');
}

function showResult(success, message, expiresAt) {
  const card    = document.getElementById('card');
  const spinner = document.getElementById('spinner');
  spinner.style.display = 'none';

  let icon, color, title;
  if (success === true)  { icon = '✅'; color = '#22c55e';       title = 'Payment Successful'; }
  else if (success === false) { icon = '❌'; color = '#ef4444'; title = 'Payment Failed'; }
  else                   { icon = '⏳'; color = 'var(--muted)';  title = 'Payment Pending'; }

  card.innerHTML =
    '<div class="icon">' + icon + '</div>' +
    '<h2 style="color:' + color + '">' + title + '</h2>' +
    '<p>' + message + '</p>' +
    (expiresAt ? '<p style="font-size:0.85rem;color:var(--muted)">Valid until: ' + new Date(expiresAt).toLocaleDateString() + '</p>' : '') +
    '<div style="display:flex;gap:1rem;justify-content:center;margin-top:1.5rem;">' +
    '<a href="/pricing" class="btn">Back to Plans</a>' +
    '<a href="/dashboard" class="btn primary">Go to Dashboard</a>' +
    '</div>';
}

checkPayment();