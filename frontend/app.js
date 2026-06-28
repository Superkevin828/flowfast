const THEME_KEY = 'flowfast-theme';
const TOKEN_KEY = 'flowfast-token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  setTheme(current);
  const trigger = document.getElementById('themeToggle');
  if (trigger) trigger.textContent = current === 'light' ? '☀︎' : '☾';
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function bindAuthForms() {
  const tabs = document.querySelectorAll('.tab');
  const forms = document.querySelectorAll('.auth-form');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      forms.forEach((form) => form.classList.add('hidden'));
      document.getElementById(`${tab.dataset.target}Form`).classList.remove('hidden');
    });
  });

  document.getElementById('loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    localStorage.setItem(TOKEN_KEY, data.token);
    window.location.href = '/dashboard';
  });

  document.getElementById('registerForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const data = await api('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    localStorage.setItem(TOKEN_KEY, data.token);
    window.location.href = '/dashboard';
  });
}

async function requireAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    return false;
  }
  try {
    const profile = await api('/auth/me');
    document.getElementById('userName')?.replaceChildren(document.createTextNode(profile.user?.name || 'FlowFast user'));
    return true;
  } catch (error) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/';
    return false;
  }
}

async function loadDashboard() {
  if (!(await requireAuth())) return;
  const files = await api('/uploads');
  const mappings = await api('/mappings');
  renderFiles(files.files || []);
  renderMappings(mappings.mappings || []);
}

function renderFiles(files) {
  const container = document.getElementById('filesList');
  if (!container) return;
  if (!files.length) {
    container.innerHTML = '<p class="muted">No uploads yet. Add your first document to begin.</p>';
    return;
  }
  container.innerHTML = files.map((file) => `
    <div class="list-item">
      <strong>${file.originalName}</strong>
      <div>${file.structuredData?.customerName || file.structuredData?.email || 'Structured data ready'}</div>
      <small>${file.status}</small>
    </div>
  `).join('');
}

function renderMappings(mappings) {
  const container = document.getElementById('mappingList');
  if (!container) return;
  if (!mappings.length) {
    container.innerHTML = '<p class="muted">No mappings saved yet.</p>';
    return;
  }
  container.innerHTML = mappings.map((mapping) => `
    <div class="list-item">
      <strong>${mapping.sourceField}</strong> → <strong>${mapping.targetField}</strong>
      <div>${mapping.description || 'Saved mapping'}</div>
    </div>
  `).join('');
}

function bindDashboard() {
  const form = document.getElementById('uploadForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('fileInput');
    if (!input.files.length) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    const data = await fetch('/api/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData
    }).then((response) => response.json());
    document.getElementById('uploadStatus').textContent = `Processed ${data.file?.originalName || 'file'} successfully.`;
    await loadDashboard();
  });

  document.getElementById('mappingForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    await api('/mappings', { method: 'POST', body: JSON.stringify(payload) });
    await loadDashboard();
  });
}

async function loadChats() {
  if (!(await requireAuth())) return;
  const data = await api('/chats');
  const chats = data.chats || [];
  const list = document.getElementById('chatList');
  if (!list) return;
  list.innerHTML = chats.map((chat) => `<button class="list-item" data-chat-id="${chat._id}">${chat.title}</button>`).join('');
  list.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => loadChat(button.dataset.chatId));
  });
  if (chats.length) {
    const first = chats[0];
    loadChat(first._id);
  }
}

async function loadChat(chatId) {
  const data = await api('/chats');
  const chat = (data.chats || []).find((item) => item._id === chatId);
  if (!chat) return;
  const titleNode = document.getElementById('activeChatTitle');
  titleNode.textContent = chat.title;
  titleNode.dataset.chatId = chat._id;
  const messageContainer = document.getElementById('messages');
  if (!messageContainer) return;
  messageContainer.innerHTML = (chat.messages || []).map((message) => `
    <div class="message ${message.role === 'assistant' ? 'assistant' : 'user'}">${message.content}</div>
  `).join('');
}

function bindChat() {
  document.getElementById('newChatButton')?.addEventListener('click', async () => {
    const chat = await api('/chats', { method: 'POST', body: JSON.stringify({ title: 'New conversation' }) });
    await loadChats();
    const titleNode = document.getElementById('activeChatTitle');
    titleNode.textContent = chat.chat.title;
    titleNode.dataset.chatId = chat.chat._id;
  });

  document.getElementById('chatForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const chatId = document.getElementById('activeChatTitle').dataset.chatId;
    if (!chatId) return;
    const message = input.value.trim();
    if (!message) return;
    const data = await api(`/chats/${chatId}/messages`, { method: 'POST', body: JSON.stringify({ message }) });
    const messageContainer = document.getElementById('messages');
    messageContainer.insertAdjacentHTML('beforeend', `<div class="message user">${message}</div><div class="message assistant">${data.reply.answer}</div>`);
    input.value = '';
  });
}

function bindGlobalActions() {
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
  document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  setTheme(savedTheme);
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.textContent = savedTheme === 'light' ? '☀︎' : '☾';

  bindGlobalActions();
  bindAuthForms();
  if (window.location.pathname === '/dashboard') {
    bindDashboard();
    loadDashboard();
  }
  if (window.location.pathname === '/chat') {
    bindChat();
    loadChats();
  }
});
