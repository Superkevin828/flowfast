
/* ═══════════════════════════════════════════════════════════════════════
   FlowFast — scripts.js
   Single script file for all pages. Replaces app.js + all page JS files.
   Load order in every HTML: <script src="/scripts.js"></script> only.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Shared constants & utilities ─────────────────────────────────────── */
const THEME_KEY = 'flowfast-theme';
const TOKEN_KEY = 'flowfast-token';
window.TOKEN_KEY = TOKEN_KEY;

function getToken() { return localStorage.getItem(TOKEN_KEY); }
window.getToken = getToken;

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  setTheme(next);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = next === 'light' ? '☀︎' : '☾';
}

async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api' + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
window.apiFetch = apiFetch;

// Apply saved theme immediately to avoid flash
(function () {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

/* ── Page detection ───────────────────────────────────────────────────── */
function onPage(id) { return !!document.getElementById(id); }

/* ════════════════════════════════════════════════════════════════════════
   SHARED INIT (runs on every page)
   ════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Theme toggle
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    themeBtn.textContent = cur === 'light' ? '☀︎' : '☾';
    themeBtn.addEventListener('click', toggleTheme);
  }

  // Logout button
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/';
  });

  // Route to the right page init
  if (onPage('loginForm'))       initIndexPage();
  else if (onPage('chatList'))   initChatPage();
  else if (onPage('dropZone'))   initDashboardPage();
  else if (onPage('btnStarter')) initPricingPage();
  else if (onPage('card'))       initCallbackPage();
});

/* ════════════════════════════════════════════════════════════════════════
   INDEX PAGE (landing + auth)
   ════════════════════════════════════════════════════════════════════════ */
function initIndexPage() {
  // Auth tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.auth-form-inner').forEach(f => f.classList.add('hidden'));
      document.getElementById(tab.dataset.target + 'Form').classList.remove('hidden');
    });
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('loginError');
    errEl.classList.remove('show');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Signing in…';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      localStorage.setItem(TOKEN_KEY, data.token);
      window.location.href = '/dashboard';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    const errEl = document.getElementById('registerError');
    errEl.classList.remove('show');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Creating account…';
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('regName').value,
          email: document.getElementById('regEmail').value,
          password: document.getElementById('regPassword').value
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      localStorage.setItem(TOKEN_KEY, data.token);
      window.location.href = '/dashboard';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Create account →';
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════
   CHAT PAGE
   ════════════════════════════════════════════════════════════════════════ */
let activeChatId = null;
let userPlan = 'free';
let pendingFile = null;

function initChatPage() {
  if (!getToken()) { window.location.href = '/'; return; }

  // Model selector
  document.getElementById('modelSelect').addEventListener('change', async (e) => {
    if (!activeChatId) return;
    try {
      await apiFetch(`/chats/${activeChatId}/model`, { method: 'PATCH', body: JSON.stringify({ selectedModel: e.target.value }) });
      showToast('Model updated');
    } catch (err) { showToast('Error updating model: ' + err.message, 'error'); }
  });

  // Sidebar nav link hover (replaces onmouseover/onmouseout)
  document.querySelectorAll('.sidebar-nav-link').forEach(link => {
    link.addEventListener('mouseover', () => {
      link.style.color = 'var(--text)';
      link.style.background = 'var(--surface)';
    });
    link.addEventListener('mouseout', () => {
      link.style.color = 'var(--muted)';
      link.style.background = 'transparent';
    });
  });

  // Prompt chip buttons
  document.querySelectorAll('[data-prompt]').forEach(btn => {
    btn.addEventListener('click', () => insertPrompt(btn.dataset.prompt));
  });

  // File attach
  const chatFileInput = document.getElementById('chatFileInput');
  const attachBtn = document.getElementById('attachBtn');

  attachBtn.addEventListener('click', () => chatFileInput.click());

  chatFileInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    pendingFile = file;
    document.getElementById('attachChipName').textContent = file.name;
    document.getElementById('attachChipWrap').style.display = 'block';
    attachBtn.classList.add('has-file');
    this.value = '';
  });

  document.getElementById('attachClearBtn').addEventListener('click', clearAttach);

  // Send
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('chatInput').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 160) + 'px';
  });

  // New chat
  document.getElementById('newChatBtn').addEventListener('click', async () => {
    const btn = document.getElementById('newChatBtn');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const { chat } = await apiFetch('/chats', { method: 'POST', body: JSON.stringify({ title: 'New conversation' }) });
      selectChat(chat);
      const { chats } = await apiFetch('/chats');
      renderChatList(chats || []);
    } catch {}
    btn.disabled = false; btn.textContent = '+ New chat';
  });

  loadChats();
}

function clearAttach() {
  pendingFile = null;
  document.getElementById('attachChipWrap').style.display = 'none';
  const attachBtn = document.getElementById('attachBtn');
  if (attachBtn) attachBtn.classList.remove('has-file');
}

function insertPrompt(text) {
  const input = document.getElementById('chatInput');
  if (input) { input.value = text; input.focus(); }
}

function showPlanBanner(plan) {
  userPlan = plan;
  const banner = document.getElementById('planBanner');
  if (!banner) return;
  if (plan === 'free') {
    banner.innerHTML =
      '⚡ You\'re on the <strong>Free plan</strong> — using Gemini AI. ' +
      '<a href="/pricing" style="color:var(--accent);font-weight:600;">Upgrade to Pro</a> for Claude AI answers.';
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>');
}

function appendMessage(role, content, mode, fileName) {
  const area = document.getElementById('messages');
  document.getElementById('emptyState')?.remove();
  let label, avatarClass;
  if (role === 'assistant') {
    label = (mode === 'claude') ? 'Claude' : 'AI';
    avatarClass = (mode === 'claude') ? 'avatar-claude' : 'avatar-free';
  } else {
    label = 'You'; avatarClass = 'avatar-user';
  }
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  let bubbleContent = '';
  if (fileName && role === 'user') {
    bubbleContent += `<div class="msg-file-chip">📎 ${escapeHtml(fileName)}</div><br>`;
  }
  bubbleContent += escapeHtml(content);
  div.innerHTML =
    `<div class="msg-avatar ${avatarClass}">${label}</div>` +
    `<div class="msg-bubble">${bubbleContent}</div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

function appendTyping() {
  const area = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.id = 'typingIndicator';
  div.innerHTML =
    `<div class="msg-avatar ${userPlan === 'free' ? 'avatar-free' : 'avatar-claude'}">${userPlan === 'free' ? 'AI' : 'Claude'}</div>` +
    `<div class="msg-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

async function sendMessage() {
  console.log('sendMessage called, activeChatId:', activeChatId);
  if (!activeChatId) {
    console.warn('No active chat selected');
    return;
  }
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message && !pendingFile) return;
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;
  const fileToSend = pendingFile;
  clearAttach();
  if (fileToSend) {
    appendMessage('user', message || `Tell me about ${fileToSend.name}`, 'user', fileToSend.name);
  } else {
    appendMessage('user', message);
  }
  appendTyping();
  try {
    let data;
    if (fileToSend) {
      const fd = new FormData();
      fd.append('file', fileToSend);
      if (message) fd.append('message', message);
      const res = await fetch(`/api/chats/${activeChatId}/upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + getToken() },
        body: fd
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
    } else {
      data = await apiFetch('/chats/' + activeChatId + '/messages', {
        method: 'POST',
        body: JSON.stringify({ message })
      });
    }
    if (data.plan) showPlanBanner(data.plan);
    document.getElementById('typingIndicator')?.remove();
    appendMessage('assistant', data.reply?.answer || 'No response.', data.reply?.mode);
  } catch (err) {
    document.getElementById('typingIndicator')?.remove();
    appendMessage('assistant', '⚠️ ' + err.message, 'free');
  } finally {
    document.getElementById('sendBtn').disabled = false;
    input.focus();
  }
}

async function loadChats() {
  try {
    const [{ chats }, subData] = await Promise.all([
      apiFetch('/chats'),
      apiFetch('/payments/subscription').catch(() => ({ subscription: { plan: 'free' } }))
    ]);
    showPlanBanner(subData.subscription?.plan || 'free');
    renderChatList(chats || []);
    if (chats?.length) selectChat(chats[0]);
  } catch { window.location.href = '/'; }
}

function renderChatList(chats) {
  const el = document.getElementById('chatList');
  if (!chats.length) {
    el.innerHTML = '<div class="text-xs muted" style="padding:0.5rem;">No chats yet</div>';
    return;
  }
  el.innerHTML = chats.map(c =>
    `<button class="chat-item ${c._id === activeChatId ? 'active' : ''}" data-id="${c._id}">${c.title || 'Conversation'}</button>`
  ).join('');
  el.querySelectorAll('.chat-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { chats } = await apiFetch('/chats');
      const chat = chats.find(c => c._id === btn.dataset.id);
      if (chat) selectChat(chat);
    });
  });
}

function selectChat(chat) {
  clearAttach();
  activeChatId = chat._id;
  document.getElementById('modelSelect').value = chat.selectedModel || 'gemini';
  document.getElementById('chatTitle').textContent = chat.title || 'Conversation';
  document.getElementById('chatMeta').textContent =
    chat.lastMessage ? 'Last: ' + chat.lastMessage : 'Attach documents or ask anything';
  const area = document.getElementById('messages');
  area.innerHTML = '';
  if (chat.messages?.length) {
    chat.messages.forEach(m => {
      if (m.role === 'user' && m.content.startsWith('📎 Attached:')) {
        const lines = m.content.split('\n');
        const fname = lines[0].replace('📎 Attached: ', '');
        const rest = lines.slice(1).join('\n');
        appendMessage('user', rest || `Tell me about ${fname}`, 'user', fname);
      } else {
        appendMessage(m.role, m.content, m.role === 'assistant' ? (userPlan === 'free' ? 'free' : 'claude') : undefined);
      }
    });
  } else {
    area.innerHTML =
      '<div class="empty-state">' +
      '<div class="es-icon">💬</div>' +
      '<h3>New conversation</h3>' +
      '<p>Ask me anything or attach a document with the 📎 button.</p>' +
      '</div>';
  }
  document.querySelectorAll('.chat-item').forEach(b =>
    b.classList.toggle('active', b.dataset.id === activeChatId)
  );
}

/* ════════════════════════════════════════════════════════════════════════
   DASHBOARD / ANALYST PAGE
   ════════════════════════════════════════════════════════════════════════ */
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const m = { pdf:'📄', png:'🖼️', jpg:'🖼️', jpeg:'🖼️', csv:'📊', xlsx:'📊', xls:'📊', json:'📋', xml:'📋', txt:'📝', zip:'🗜️' };
  return m[ext] || '📎';
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function renderStats(stats) {
  const planLabels = { free: 'Free', starter: 'Starter', pro: 'Pro' };
  const planSubtext = { free: 'Basic Gemini AI', starter: 'Claude AI + 100K tokens/mo', pro: 'Claude AI + 1M tokens/mo' };
  const badge = document.getElementById('planBadge');
  if (badge) {
    badge.textContent = planLabels[stats.plan] || stats.plan;
    badge.className = `plan-badge-lg ${stats.plan}`;
  }
  const planSub = document.getElementById('planSubtext');
  if (planSub) planSub.textContent = planSubtext[stats.plan] || '';
  setText('statTotalDocs', stats.totalDocs);
  setText('statDocsWeek', `+${stats.docsThisWeek} this week`);
  setText('statChats', stats.totalChats);
  setText('statTokens', formatNum(stats.estimatedTokens));
  setText('statTokenLimit', formatNum(stats.tokenLimit) + ' limit');
  const bar = document.getElementById('tokenBar');
  if (bar) {
    bar.style.width = stats.tokenPct + '%';
    if (stats.tokenPct >= 80) bar.classList.add('warn');
  }
  if (stats.plan === 'free') {
    const cta = document.getElementById('upgradeCta');
    if (cta) { cta.classList.remove('hidden'); cta.classList.add('visible-flex'); }
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderFiles(files) {
  const el = document.getElementById('filesList');
  if (!el) return;
  const countEl = document.getElementById('fileCount');
  if (countEl) countEl.textContent = files.length + ' file' + (files.length !== 1 ? 's' : '');
  if (!files.length) {
    el.innerHTML = '<div class="empty-state" style="padding:2rem;"><div class="es-icon">📂</div><h3>No documents yet</h3><p>Upload your first file above or attach one in AI Chat.</p></div>';
    return;
  }
  el.innerHTML = '<div class="file-list">' + files.map(f => {
    const docType = f.structuredData?.documentType || 'Document';
    const summary = f.structuredData?.customerName || f.structuredData?.total
      ? [f.structuredData?.customerName, f.structuredData?.total ? 'Total: ' + f.structuredData.total : null].filter(Boolean).join(' · ')
      : 'Processed';
    const date = f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '';
    return `<div class="file-item">
      <div class="file-icon">${fileIcon(f.originalName)}</div>
      <div class="file-info">
        <div class="name">${f.originalName}</div>
        <div class="meta">${docType} · ${summary} · ${formatSize(f.size)}${date ? ' · ' + date : ''}</div>
      </div>
      <div class="file-actions">
        <span class="badge ${f.status === 'processed' ? 'green' : 'yellow'}">${f.status || 'done'}</span>
        <a href="/chat" class="btn text-sm" style="margin-left:0.4rem;font-size:0.75rem;">Ask AI →</a>
      </div>
    </div>`;
  }).join('') + '</div>';
}

function renderMappings(mappings) {
  const el = document.getElementById('mappingList');
  if (!el) return;
  if (!mappings.length) { el.innerHTML = '<p class="muted text-sm">No mappings saved yet.</p>'; return; }
  el.innerHTML = '<div class="file-list">' + mappings.map(m => `
    <div class="file-item">
      <div class="file-icon">🗺️</div>
      <div class="file-info">
        <div class="name"><code>${m.sourceField}</code> → <code>${m.targetField}</code></div>
        <div class="meta">${m.description || 'Field mapping'}</div>
      </div>
    </div>`).join('') + '</div>';
}

async function initDashboardPage() {
  if (!getToken()) { window.location.href = '/'; return; }

  try {
    const profile = await apiFetch('/auth/me');
    setText('sidebarUser', profile.user?.name || profile.user?.email || '—');
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/';
    return;
  }

  try {
    const { subscription } = await apiFetch('/payments/subscription');
    const plan = subscription?.plan || 'free';
    const badge = document.createElement('span');
    badge.className = 'badge ' + (plan === 'pro' ? 'blue' : plan === 'starter' ? 'green' : 'muted');
    badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
    document.getElementById('sidebarPlan')?.appendChild(badge);
  } catch {}

  const [statsRes, filesRes, mappingsRes] = await Promise.allSettled([
    apiFetch('/chats/stats'),
    apiFetch('/uploads'),
    apiFetch('/mappings')
  ]);
  if (statsRes.status === 'fulfilled') renderStats(statsRes.value);
  if (filesRes.status === 'fulfilled') renderFiles(filesRes.value.files || []);
  if (mappingsRes.status === 'fulfilled') renderMappings(mappingsRes.value.mappings || []);

  // Drop zone
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleUpload(fileInput.files[0]); });

  // Mappings
  document.getElementById('toggleMappingForm')?.addEventListener('click', () => {
    document.getElementById('mappingFormWrap').classList.toggle('hidden');
  });
  document.getElementById('saveMappingBtn')?.addEventListener('click', async () => {
    const src = document.getElementById('srcField').value.trim();
    const tgt = document.getElementById('tgtField').value.trim();
    if (!src || !tgt) { showToast('Source and target fields are required.', 'error'); return; }
    try {
      await apiFetch('/mappings', { method: 'POST', body: JSON.stringify({
        sourceField: src, targetField: tgt,
        description: document.getElementById('mapDesc').value
      })});
      document.getElementById('srcField').value = '';
      document.getElementById('tgtField').value = '';
      document.getElementById('mapDesc').value = '';
      document.getElementById('mappingFormWrap').classList.add('hidden');
      showToast('Mapping saved!');
      const { mappings } = await apiFetch('/mappings');
      renderMappings(mappings || []);
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function handleUpload(file) {
  const prog = document.getElementById('uploadProgress');
  const fill = document.getElementById('progressFill');
  const label = document.getElementById('progressLabel');
  prog.classList.add('show');
  fill.style.width = '0%';
  label.textContent = 'Uploading ' + file.name + '…';
  let pct = 0;
  const interval = setInterval(() => { pct = Math.min(pct + 8, 85); fill.style.width = pct + '%'; }, 200);
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/uploads', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd });
    const data = await res.json().catch(() => ({}));
    clearInterval(interval);
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    fill.style.width = '100%';
    label.textContent = '✓ ' + file.name + ' processed';
    showToast('Document processed!', 'success');
    setTimeout(() => { prog.classList.remove('show'); fill.style.width = '0%'; }, 2500);
    const [filesData, statsData] = await Promise.all([apiFetch('/uploads'), apiFetch('/chats/stats')]);
    renderFiles(filesData.files || []);
    if (statsData) renderStats(statsData);
    document.getElementById('fileInput').value = '';
  } catch (err) {
    clearInterval(interval);
    fill.style.width = '0%'; prog.classList.remove('show');
    showToast(err.message, 'error');
  }
}

/* ════════════════════════════════════════════════════════════════════════
   PRICING PAGE
   ════════════════════════════════════════════════════════════════════════ */
function initPricingPage() {
  apiFetch('/payments/subscription')
    .then(({ subscription }) => {
      const plan = subscription?.plan;
      if (plan && plan !== 'free') {
        const row = document.getElementById('currentPlanRow');
        const badge = document.getElementById('currentPlanBadge');
        if (row && badge) {
          badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
          row.style.display = 'block';
        }
      }
    })
    .catch(() => {});

  document.getElementById('btnStarter')?.addEventListener('click', () => subscribe('starter'));
  document.getElementById('btnPro')?.addEventListener('click', () => subscribe('pro'));
}

async function subscribe(plan) {
  if (!getToken()) { window.location.href = '/'; return; }
  const btnId = plan === 'starter' ? 'btnStarter' : 'btnPro';
  const btn = document.getElementById(btnId);
  const msg = document.getElementById('statusMsg');
  btn.disabled = true;
  btn.textContent = 'Processing…';
  if (msg) msg.textContent = '';
  try {
    const data = await apiFetch('/payments/initiate', {
      method: 'POST',
      body: JSON.stringify({ plan })
    });
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    } else {
      throw new Error('No redirect URL received');
    }
  } catch (err) {
    if (msg) msg.textContent = '⚠️ ' + err.message;
    btn.disabled = false;
    btn.textContent = plan === 'starter' ? 'Subscribe · UGX 29,000 / mo' : 'Subscribe · UGX 89,000 / mo';
  }
}

/* ════════════════════════════════════════════════════════════════════════
   PAYMENT CALLBACK PAGE
   ════════════════════════════════════════════════════════════════════════ */
function initCallbackPage() {
  checkPayment();
}

async function checkPayment() {
  const params = new URLSearchParams(window.location.search);
  const orderTrackingId = params.get('OrderTrackingId') || params.get('orderTrackingId');
  const orderId = params.get('OrderMerchantReference') || params.get('orderId');
  if (!orderTrackingId) {
    showCallbackResult(false, 'Missing payment reference. Please contact support.');
    return;
  }
  for (let i = 0; i < 5; i++) {
    try {
      const data = await apiFetch('/payments/confirm?orderTrackingId=' + orderTrackingId + '&orderId=' + (orderId || ''));
      if (data.confirmed) {
        showCallbackResult(true, 'Payment confirmed! Your ' + (data.plan || '') + ' plan is now active.', data.expiresAt);
        return;
      }
      if (data.status === 'Failed') {
        showCallbackResult(false, 'Payment was not successful. Please try again.');
        return;
      }
    } catch (err) { console.error('Confirm error:', err.message); }
    await new Promise(r => setTimeout(r, 2000));
  }
  showCallbackResult(null, 'Payment is being processed. Check your subscription status in a few minutes.');
}

function showCallbackResult(success, message, expiresAt) {
  const card = document.getElementById('card');
  const spinner = document.getElementById('spinner');
  if (spinner) spinner.style.display = 'none';
  let icon, color, title;
  if (success === true)      { icon = '✅'; color = '#22c55e';      title = 'Payment Successful'; }
  else if (success === false){ icon = '❌'; color = '#ef4444';      title = 'Payment Failed'; }
  else                       { icon = '⏳'; color = 'var(--muted)'; title = 'Payment Pending'; }
  if (card) card.innerHTML =
    '<div class="icon">' + icon + '</div>' +
    '<h2 style="color:' + color + '">' + title + '</h2>' +
    '<p>' + message + '</p>' +
    (expiresAt ? '<p style="font-size:0.85rem;color:var(--muted)">Valid until: ' + new Date(expiresAt).toLocaleDateString() + '</p>' : '') +
    '<div style="display:flex;gap:1rem;justify-content:center;margin-top:1.5rem;">' +
    '<a href="/pricing" class="btn">Back to Plans</a>' +
    '<a href="/dashboard" class="btn primary">Go to Dashboard</a>' +
    '</div>';
}