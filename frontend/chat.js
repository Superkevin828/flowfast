/* ── chat.js — chat page logic ──────────────────────────────────────── */
let activeChatId = null;
let userPlan = 'free'; // resolved on load

/* ── Plan banner ─────────────────────────────────────────────────────── */
function showPlanBanner(plan) {
  userPlan = plan;
  const banner = document.getElementById('planBanner');
  if (!banner) return;
  if (plan === 'free') {
    banner.innerHTML =
      '⚡ You\'re on the <strong>Free plan</strong> — using basic AI. ' +
      '<a href="/pricing" style="color:var(--accent);font-weight:600;">Upgrade to Pro</a> for full Claude AI answers.';
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

/* ── Message rendering ───────────────────────────────────────────────── */
function insertPrompt(text) {
  document.getElementById('chatInput').value = text;
  document.getElementById('chatInput').focus();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>');
}

function appendMessage(role, content, mode) {
  const area = document.getElementById('messages');
  document.getElementById('emptyState')?.remove();

  let label, avatarClass;
  if (role === 'assistant') {
    if (mode === 'claude') { label = 'Claude'; avatarClass = 'avatar-claude'; }
    else                   { label = 'AI';     avatarClass = 'avatar-free';   }
  } else {
    label = 'You'; avatarClass = 'avatar-user';
  }

  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML =
    `<div class="msg-avatar ${avatarClass}">${label}</div>` +
    `<div class="msg-bubble">${escapeHtml(content)}</div>`;
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

/* ── Send ────────────────────────────────────────────────────────────── */
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message || !activeChatId) return;
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;
  appendMessage('user', message);
  appendTyping();
  try {
    const data = await apiFetch('/chats/' + activeChatId + '/messages', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
    // Update plan in case it changed (e.g. user just paid)
    if (data.plan) showPlanBanner(data.plan);
    document.getElementById('typingIndicator')?.remove();
    appendMessage('assistant', data.reply.answer || 'No response.', data.reply.mode);
  } catch (err) {
    document.getElementById('typingIndicator')?.remove();
    appendMessage('assistant', '⚠️ ' + err.message, 'free');
  } finally {
    document.getElementById('sendBtn').disabled = false;
    input.focus();
  }
}

/* ── Chat list ───────────────────────────────────────────────────────── */
async function loadChats() {
  if (!getToken()) { window.location.href = '/'; return; }
  try {
    // Load plan and chats in parallel
    const [{ chats }, { subscription }] = await Promise.all([
      apiFetch('/chats'),
      apiFetch('/payments/subscription').catch(() => ({ subscription: { plan: 'free' } }))
    ]);
    showPlanBanner(subscription?.plan || 'free');
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
  activeChatId = chat._id;
  document.getElementById('chatTitle').textContent = chat.title || 'Conversation';
  document.getElementById('chatMeta').textContent =
    chat.lastMessage ? 'Last: ' + chat.lastMessage : 'Ask anything about your documents';
  const area = document.getElementById('messages');
  area.innerHTML = '';
  if (chat.messages?.length) {
    chat.messages.forEach(m => appendMessage(m.role, m.content));
  } else {
    area.innerHTML =
      '<div class="empty-state">' +
      '<div class="es-icon">💬</div>' +
      '<h3>New conversation</h3>' +
      '<p>Ask me anything about your uploaded documents.</p>' +
      '</div>';
  }
  document.querySelectorAll('.chat-item').forEach(b =>
    b.classList.toggle('active', b.dataset.id === activeChatId)
  );
}

/* ── New chat ────────────────────────────────────────────────────────── */
document.getElementById('newChatBtn').addEventListener('click', async () => {
  const btn = document.getElementById('newChatBtn');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    const { chat } = await apiFetch('/chats', { method: 'POST', body: JSON.stringify({ title: 'New conversation' }) });
    selectChat(chat);
    const { chats } = await apiFetch('/chats');
    renderChatList(chats || []);
  } catch {}
  btn.disabled = false;
  btn.textContent = '+ New chat';
});

/* ── Input bindings ──────────────────────────────────────────────────── */
document.getElementById('sendBtn').addEventListener('click', sendMessage);

document.getElementById('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

document.getElementById('chatInput').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
});

window.insertPrompt = insertPrompt;

loadChats();