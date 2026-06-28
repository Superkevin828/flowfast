/* ── FlowFast shared utilities ─────────────────────────────────────────── */
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

// Expose globals for page scripts
window.TOKEN_KEY = TOKEN_KEY;
window.getToken  = getToken;
window.apiFetch  = apiFetch;

// Apply saved theme immediately (before DOMContentLoaded to avoid flash)
(function () {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

document.addEventListener('DOMContentLoaded', () => {
  // Sync theme toggle icon
  const btn = document.getElementById('themeToggle');
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  if (btn) {
    btn.textContent = cur === 'light' ? '☀︎' : '☾';
    btn.addEventListener('click', toggleTheme);
  }
});