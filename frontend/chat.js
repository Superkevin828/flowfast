/* ── chat.js ─────────────────────────────────────────────────────────── */
let activeChatId = null;
let userPlan = 'free';
let pendingFile = null; // File object waiting to be sent

/* ── Plan banner ──────────────────────────────────────────────────────── */
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

/* ── File attach ──────────────────────────────────────────────────────── */
document.getElementById('chatFileInput').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  pendingFile = file;
  document.getElementById('attachChipName').textContent = file.name;
  document.getElementById('attachChipWrap').style.display = 'block';
  document.getElementById('attachBtn').classList.add('has-file');
  this.value = '';
});

function clearAttach() {
  pendingFile = null;
  document.getElementById('attachChipWrap').style.display = 'none';
  document.getElementById('attachBtn').classList.remove('has-file');
}
window.clearAttach = clearAttach;

/* ── Message rendering ────────────────────────────────────────────────── */
function insertPrompt(text) {
  document.getElementById('chatInput').value = text;
  document.getElementById('chatInput').focus();
}
window.insertPrompt = insertPrompt;

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

/* ── Send (text or file+text) ─────────────────────────────────────────── */
async function sendMessage() {
  if (!activeChatId) return;
  const input = document.getElementById('chatInput');
  const message = input.value.trim();

  // Need at least a file or a message
  if (!message && !pendingFile) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;

  const fileToSend = pendingFile;
  clearAttach();

  // Show user message immediately
  if (fileToSend) {
    appendMessage('user', message || `Tell me about ${fileToSend.name}`, 'user', fileToSend.name);
  } else {
    appendMessage('user', message);
  }
  appendTyping();

  try {
    let data;
    if (fileToSend) {
      // Multipart upload
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

/* ── Chat list ────────────────────────────────────────────────────────── */
async function loadChats() {
  if (!getToken()) { window.location.href = '/'; return; }
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
  activeChatId = chat._id;
  document.getElementById('chatTitle').textContent = chat.title || 'Conversation';
  document.getElementById('chatMeta').textContent =
    chat.lastMessage ? 'Last: ' + chat.lastMessage : 'Attach documents or ask anything';
  const area = document.getElementById('messages');
  area.innerHTML = '';
  if (chat.messages?.length) {
    chat.messages.forEach(m => {
      // Detect file attachment messages
      const isFileMsg = m.role === 'user' && m.content.startsWith('📎 Attached:');
      if (isFileMsg) {
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

/* ── New chat ─────────────────────────────────────────────────────────── */
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

/* ── Input bindings ───────────────────────────────────────────────────── */
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
document.getElementById('chatInput').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
});

loadChats();