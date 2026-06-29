
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
let pendingFiles = [];
let allChats = [];
let isStreaming = false;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    pdf: ['📄', 'ftype-pdf'],
    png: ['🖼️', 'ftype-img'],
    jpg: ['🖼️', 'ftype-img'],
    jpeg: ['🖼️', 'ftype-img'],
    gif: ['🖼️', 'ftype-img'],
    webp: ['🖼️', 'ftype-img'],
    csv: ['📊', 'ftype-csv'],
    xlsx: ['📊', 'ftype-xlsx'],
    xls: ['📊', 'ftype-xlsx'],
    json: ['{}', 'ftype-json'],
    xml: ['📋', 'ftype-xml'],
    txt: ['📝', 'ftype-txt'],
    doc: ['📝', 'ftype-doc'],
    docx: ['📝', 'ftype-doc'],
    zip: ['🗜️', 'ftype-default']
  };
  return map[ext] || ['📎', 'ftype-default'];
}

function fileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderMarkdown(text) {
  const safe = escapeHtml(text || '');
  return safe.replace(/\n/g, '<br>');
}

function showPlanBanner(plan) {
  userPlan = plan;
  const banner = document.getElementById('planBanner');
  if (!banner) return;
  if (plan === 'free') {
    banner.innerHTML = '<span>Free plan — AI works on uploaded files in this chat.</span>';
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

function renderAttachBar() {
  const attachBar = document.getElementById('attachPreviewBar');
  const attachBtn = document.getElementById('attachBtn');
  if (!attachBar || !attachBtn) return;

  if (!pendingFiles.length) {
    attachBar.style.display = 'none';
    attachBar.innerHTML = '';
    attachBtn.classList.remove('has-file');
    return;
  }

  attachBar.style.display = 'flex';
  attachBtn.classList.add('has-file');
  attachBar.innerHTML = pendingFiles.map((file, index) => {
    const [icon, cssClass] = fileIcon(file.name);
    return `<div class="attach-chip">
      <span class="${cssClass}">${icon}</span>
      <span class="chip-name">${escapeHtml(file.name)}</span>
      <span class="chip-size">${fileSize(file.size)}</span>
      <button type="button" data-index="${index}" title="Remove">×</button>
    </div>`;
  }).join('');

  attachBar.querySelectorAll('button[data-index]').forEach((button) => {
    button.addEventListener('click', () => {
      pendingFiles.splice(Number(button.dataset.index), 1);
      renderAttachBar();
    });
  });
}

function clearAttach() {
  pendingFiles = [];
  renderAttachBar();
}

function showEmpty(show) {
  const emptyEl = document.getElementById('emptyState');
  if (!emptyEl) return;
  emptyEl.style.display = show ? '' : 'none';
}

function appendMessage(role, content, mode, fileChips) {
  const area = document.getElementById('messages');
  if (!area) return null;
  const emptyEl = document.getElementById('emptyState');
  if (emptyEl) emptyEl.remove();

  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const isUser = role === 'user';
  const metaLabel = isUser ? 'You' : 'FlowFast AI';
  const badgeHtml = !isUser && mode
    ? `<span class="model-badge">${mode === 'claude' ? '⬡ Claude' : mode === 'free' ? '◈ Gemini' : '◎ AI'}</span>`
    : '';

  div.innerHTML = `
    <div class="msg-meta">${metaLabel} ${badgeHtml}</div>
    ${fileChips ? `<div>${fileChips}</div>` : ''}
    <div class="msg-bubble"></div>
    <div class="msg-actions">
      <button class="msg-action-btn copy-btn" type="button">Copy</button>
      ${!isUser ? `<button class="msg-action-btn regenerate-btn" type="button">Regenerate</button>` : ''}
    </div>`;

  const bubble = div.querySelector('.msg-bubble');
  if (isUser) {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = renderMarkdown(content);
    bubble.querySelectorAll('pre').forEach((pre) => {
      const btn = document.createElement('button');
      btn.className = 'pre-copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.querySelector('code')?.textContent || pre.textContent);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      });
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  }

  const copyBtn = div.querySelector('.copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(bubble.textContent || '');
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
  }

  const regenBtn = div.querySelector('.regenerate-btn');
  if (regenBtn) {
    regenBtn.addEventListener('click', () => regenerateLast());
  }

  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

function appendTyping() {
  const area = document.getElementById('messages');
  if (!area) return null;
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="msg-meta">FlowFast AI</div>
    <div class="msg-bubble">
      <div class="thinking-bar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        Thinking…
      </div>
    </div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

function buildFileChips(files) {
  return files.map((file) => {
    const [icon] = fileIcon(file.name);
    return `<div class="msg-file-chip"><span class="file-icon">${icon}</span> ${escapeHtml(file.name)} <span class="file-size">${fileSize(file.size)}</span></div>`;
  }).join('');
}

async function sendMessage() {
  if (!activeChatId || isStreaming) return;
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  if (!input || !sendBtn) return;

  const message = input.value.trim();
  if (!message && !pendingFiles.length) return;

  isStreaming = true;
  sendBtn.disabled = true;
  input.value = '';
  input.style.height = 'auto';

  const filesToSend = [...pendingFiles];
  pendingFiles = [];
  renderAttachBar();

  const chips = filesToSend.length ? buildFileChips(filesToSend) : null;
  appendMessage('user', message || (filesToSend.length ? `Tell me about ${filesToSend.map((file) => file.name).join(', ')}` : ''), null, chips);
  const typingEl = appendTyping();

  try {
    let data;
    if (filesToSend.length) {
      let lastData;
      for (let index = 0; index < filesToSend.length; index += 1) {
        const fd = new FormData();
        fd.append('file', filesToSend[index]);
        if (index === filesToSend.length - 1 && message) fd.append('message', message);
        else if (index === filesToSend.length - 1) fd.append('message', `I uploaded ${filesToSend.length} files: ${filesToSend.map((file) => file.name).join(', ')}. Please analyze them for office work.`);

        const headers = {};
        const token = getToken();
        if (token) headers.Authorization = 'Bearer ' + token;

        const res = await fetch(`/api/chats/${activeChatId}/upload`, { method: 'POST', headers, body: fd });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Upload failed');
        lastData = payload;
      }
      data = lastData;
    } else {
      data = await apiFetch('/chats/' + activeChatId + '/messages', {
        method: 'POST',
        body: JSON.stringify({ message })
      });
    }

    typingEl?.remove();
    appendMessage('assistant', data.reply?.answer || 'No response.', data.reply?.mode);
    if (data.chat?.title && data.chat.title !== 'New conversation') {
      document.getElementById('chatTitle').textContent = data.chat.title;
      updateChatInList(data.chat);
    }
  } catch (err) {
    typingEl?.remove();
    appendMessage('assistant', '⚠️ ' + err.message, 'error');
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function renderChatList(chats) {
  const chatList = document.getElementById('chatList');
  if (!chatList) return;
  allChats = chats || [];
  const chatSearch = document.getElementById('chatSearch');
  const query = (chatSearch?.value || '').toLowerCase();
  const filtered = query ? allChats.filter((chat) => (chat.title || '').toLowerCase().includes(query)) : allChats;

  if (!filtered.length) {
    chatList.innerHTML = `<div class="text-xs muted" style="padding:0.5rem 0.65rem;">${query ? 'No results' : 'No chats yet'}</div>`;
    return;
  }

  chatList.innerHTML = filtered.map((chat) => `
    <div class="chat-item${activeChatId === chat._id ? ' active' : ''}" data-id="${chat._id}">
      <svg class="chat-item-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      <span class="chat-item-label" id="label-${chat._id}">${escapeHtml(chat.title || 'Untitled')}</span>
      <div class="chat-item-actions">
        <button class="chat-item-btn" type="button" data-action="rename" data-id="${chat._id}" title="Rename">✎</button>
        <button class="chat-item-btn del" type="button" data-action="delete" data-id="${chat._id}" title="Delete">✕</button>
      </div>
    </div>`).join('');

  chatList.querySelectorAll('.chat-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      if (event.target.closest('[data-action]')) return;
      const chatId = item.dataset.id;
      const chat = allChats.find((entry) => entry._id === chatId);
      if (chat) selectChat(chat);
    });
  });

  chatList.querySelectorAll('[data-action="rename"]').forEach((button) => {
    button.addEventListener('click', () => renameChat(button.dataset.id));
  });
  chatList.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', () => deleteChat(button.dataset.id));
  });
}

function updateChatInList(chat) {
  allChats = allChats.map((entry) => (entry._id === chat._id ? { ...entry, ...chat } : entry));
  renderChatList(allChats);
}

function selectChat(chat) {
  const chatTitle = document.getElementById('chatTitle');
  const chatMeta = document.getElementById('chatMeta');
  const messagesEl = document.getElementById('messages');
  const modelSelect = document.getElementById('modelSelect');
  if (!chatTitle || !chatMeta || !messagesEl || !modelSelect) return;

  activeChatId = chat._id;
  modelSelect.value = chat.selectedModel || 'gemini';
  updateModelDot();
  chatTitle.textContent = chat.title || 'Untitled';
  chatMeta.textContent = chat.lastMessage ? 'Last: ' + chat.lastMessage : 'Attach documents or ask anything';

  const nodes = Array.from(messagesEl.children).filter((node) => node.id !== 'emptyState');
  nodes.forEach((node) => node.remove());
  showEmpty(!(chat.messages?.length));

  (chat.messages || []).forEach((message) => {
    let content = message.content || '';
    let chips = null;
    if (message.role === 'user' && content.startsWith('📎 Attached:')) {
      const parts = content.split('\n');
      const fileName = parts[0].replace('📎 Attached:', '').trim();
      chips = `<div class="msg-file-chip"><span class="file-icon">${fileIcon(fileName)[0]}</span> ${escapeHtml(fileName)}</div>`;
      content = parts.slice(1).join('\n').trim();
    }
    appendMessage(message.role, content, message.role === 'assistant' ? (userPlan === 'free' ? 'free' : 'claude') : null, chips);
  });

  renderChatList(allChats);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateModelDot() {
  const modelDot = document.getElementById('modelDot');
  const modelSelect = document.getElementById('modelSelect');
  if (!modelDot || !modelSelect) return;
  const isPaid = modelSelect.value === 'claude';
  modelDot.style.background = isPaid ? '#a78bfa' : '#22c55e';
}

async function regenerateLast() {
  if (!activeChatId || isStreaming) return;
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;
  const userMessages = messagesEl.querySelectorAll('.msg.user');
  if (!userMessages.length) return;
  const lastUserBubble = userMessages[userMessages.length - 1].querySelector('.msg-bubble');
  const lastMessage = lastUserBubble?.textContent?.trim();
  if (!lastMessage) return;

  const assistantMessages = messagesEl.querySelectorAll('.msg.assistant');
  if (assistantMessages.length) assistantMessages[assistantMessages.length - 1].remove();
  const input = document.getElementById('chatInput');
  if (input) input.value = lastMessage;
  await sendMessage();
}

async function renameChat(chatId) {
  const labelEl = document.getElementById('label-' + chatId);
  if (!labelEl) return;
  const currentTitle = labelEl.textContent;
  const input = document.createElement('input');
  input.className = 'chat-item-rename-input';
  input.value = currentTitle;
  labelEl.replaceWith(input);
  input.focus();
  input.select();

  async function save() {
    const newTitle = input.value.trim() || currentTitle;
    try {
      await apiFetch(`/chats/${chatId}`, { method: 'PATCH', body: JSON.stringify({ title: newTitle }) });
      allChats = allChats.map((entry) => (entry._id === chatId ? { ...entry, title: newTitle } : entry));
    } catch {}
    renderChatList(allChats);
    if (activeChatId === chatId) {
      const chatTitle = document.getElementById('chatTitle');
      if (chatTitle) chatTitle.textContent = newTitle;
    }
  }

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save();
    if (event.key === 'Escape') renderChatList(allChats);
  });
}

async function deleteChat(chatId) {
  if (!confirm('Delete this chat?')) return;
  try {
    await apiFetch(`/chats/${chatId}`, { method: 'DELETE' });
    allChats = allChats.filter((chat) => chat._id !== chatId);
    renderChatList(allChats);
    if (activeChatId === chatId) {
      activeChatId = null;
      const messagesEl = document.getElementById('messages');
      if (messagesEl) {
        messagesEl.innerHTML = '';
        showEmpty(true);
      }
      const chatTitle = document.getElementById('chatTitle');
      if (chatTitle) chatTitle.textContent = 'Select or start a chat';
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.selectChatById = (chatId) => {
  const chat = allChats.find((entry) => entry._id === chatId);
  if (chat) selectChat(chat);
};
window.renameChat = renameChat;
window.deleteChat = deleteChat;

async function loadChats() {
  try {
    const token = getToken();
    if (!token) {
      window.location.href = '/';
      return;
    }

    const [{ chats }, subData] = await Promise.all([
      apiFetch('/chats'),
      apiFetch('/payments/subscription').catch(() => ({ plan: 'free' }))
    ]);

    userPlan = subData?.plan || 'free';
    allChats = chats || [];
    renderChatList(allChats);
    if (allChats.length) selectChat(allChats[0]);
    showPlanBanner(userPlan);
  } catch (err) {
    console.error(err);
    if (err.message?.includes('401') || err.message?.includes('token')) window.location.href = '/';
  }
}

function initChatPage() {
  if (!getToken()) { window.location.href = '/'; return; }

  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('chatFileInput');
  const modelSelect = document.getElementById('modelSelect');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const sidebar = document.getElementById('chatSidebar');
  const chatSearch = document.getElementById('chatSearch');
  const scrollBtn = document.getElementById('scrollBtn');
  const messagesEl = document.getElementById('messages');

  if (chatInput) {
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';
    });
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (attachBtn && fileInput) attachBtn.addEventListener('click', () => fileInput.click());
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      if (files.length) {
        pendingFiles = [...pendingFiles, ...files];
        renderAttachBar();
        fileInput.value = '';
      }
    });
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', async () => {
      updateModelDot();
      if (!activeChatId) return;
      try {
        await apiFetch(`/chats/${activeChatId}/model`, { method: 'PATCH', body: JSON.stringify({ selectedModel: modelSelect.value }) });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    updateModelDot();
  }

  if (messagesEl) {
    messagesEl.addEventListener('dragover', (event) => {
      event.preventDefault();
      messagesEl.style.outline = '2px dashed var(--accent)';
    });
    messagesEl.addEventListener('dragleave', () => {
      messagesEl.style.outline = '';
    });
    messagesEl.addEventListener('drop', (event) => {
      event.preventDefault();
      messagesEl.style.outline = '';
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length) {
        pendingFiles = [...pendingFiles, ...files];
        renderAttachBar();
        showToast(`${files.length} file(s) attached`, 'success');
      }
    });
    messagesEl.addEventListener('scroll', () => {
      const atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
      if (scrollBtn) scrollBtn.classList.toggle('show', !atBottom);
    });
  }

  if (sidebarToggle && sidebar && sidebarOverlay) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('show');
    });
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('show');
    });
  }

  if (chatSearch) chatSearch.addEventListener('input', () => renderChatList(allChats));
  if (scrollBtn) scrollBtn.addEventListener('click', () => {
    const messagesEl = document.getElementById('messages');
    if (messagesEl) messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  });

  document.querySelectorAll('.es-card[data-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      if (chatInput) {
        chatInput.value = button.dataset.prompt;
        chatInput.focus();
      }
    });
  });

  document.getElementById('newChatBtn')?.addEventListener('click', async () => {
    const button = document.getElementById('newChatBtn');
    if (!button) return;
    button.disabled = true;
    button.textContent = '…';
    try {
      const { chat } = await apiFetch('/chats', { method: 'POST', body: JSON.stringify({ title: 'New conversation' }) });
      allChats.unshift(chat);
      renderChatList(allChats);
      selectChat(chat);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = '+ New chat';
    }
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/';
  });

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
    html.dataset.theme = next;
    localStorage.setItem('ff-theme', next);
  });

  const savedTheme = localStorage.getItem('ff-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;

  loadChats();
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