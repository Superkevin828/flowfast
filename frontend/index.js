/* ── index.js — landing page auth logic ─────────────────────────────── */

// Auth tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.auth-form-inner').forEach(f => f.classList.add('hidden'));
    document.getElementById(tab.dataset.target + 'Form').classList.remove('hidden');
  });
});

async function authAction(email, password, name, isRegister) {
  const path = isRegister ? '/auth/register' : '/auth/login';
  const body = isRegister ? { name, email, password } : { email, password };
  const res = await fetch('/api' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Authentication failed');
  return data;
}

async function handleLogin(e) {
  e.preventDefault();
  const btn    = document.getElementById('loginBtn');
  const errEl  = document.getElementById('loginError');
  errEl.classList.remove('show');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span> Signing in…';
  try {
    const data = await authAction(
      document.getElementById('loginEmail').value,
      document.getElementById('loginPassword').value,
      null, false
    );
    localStorage.setItem('flowfast-token', data.token);
    window.location.href = '/dashboard';
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn   = document.getElementById('registerBtn');
  const errEl = document.getElementById('registerError');
  errEl.classList.remove('show');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span> Creating account…';
  try {
    const data = await authAction(
      document.getElementById('regEmail').value,
      document.getElementById('regPassword').value,
      document.getElementById('regName').value,
      true
    );
    localStorage.setItem('flowfast-token', data.token);
    window.location.href = '/dashboard';
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Create account →';
  }
}

// Bind form submit (works with both Enter key and button click)
document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('registerForm').addEventListener('submit', handleRegister);