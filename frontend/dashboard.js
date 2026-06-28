/* ── dashboard.js — Analyst page ─────────────────────────────────────── */

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
  badge.textContent = planLabels[stats.plan] || stats.plan;
  badge.className = `plan-badge-lg ${stats.plan}`;
  document.getElementById('planSubtext').textContent = planSubtext[stats.plan] || '';

  document.getElementById('statTotalDocs').textContent = stats.totalDocs;
  document.getElementById('statDocsWeek').textContent = `+${stats.docsThisWeek} this week`;
  document.getElementById('statChats').textContent = stats.totalChats;
  document.getElementById('statTokens').textContent = formatNum(stats.estimatedTokens);
  document.getElementById('statTokenLimit').textContent = formatNum(stats.tokenLimit) + ' limit';

  const bar = document.getElementById('tokenBar');
  bar.style.width = stats.tokenPct + '%';
  if (stats.tokenPct >= 80) bar.classList.add('warn');

  if (stats.plan === 'free') {
    document.getElementById('upgradeCta').classList.remove('hidden');
    document.getElementById('upgradeCta').classList.add('visible-flex');
  }
}

function renderFiles(files) {
  const el = document.getElementById('filesList');
  document.getElementById('fileCount').textContent = files.length + ' file' + (files.length !== 1 ? 's' : '');
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

async function load() {
  try {
    const profile = await apiFetch('/auth/me');
    document.getElementById('sidebarUser').textContent = profile.user?.name || profile.user?.email || '—';
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
    document.getElementById('sidebarPlan').appendChild(badge);
  } catch {}

  // Load stats, files, mappings in parallel
  const [statsRes, filesRes, mappingsRes] = await Promise.allSettled([
    apiFetch('/chats/stats'),
    apiFetch('/uploads'),
    apiFetch('/mappings')
  ]);

  if (statsRes.status === 'fulfilled') renderStats(statsRes.value);
  if (filesRes.status === 'fulfilled') renderFiles(filesRes.value.files || []);
  if (mappingsRes.status === 'fulfilled') renderMappings(mappingsRes.value.mappings || []);
}

/* ── Upload ──────────────────────────────────────────────────────────── */
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleUpload(fileInput.files[0]); });

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
    fileInput.value = '';
  } catch (err) {
    clearInterval(interval);
    fill.style.width = '0%'; prog.classList.remove('show');
    showToast(err.message, 'error');
  }
}

/* ── Mappings ──────────────────────────────────────────────────────────── */
document.getElementById('toggleMappingForm').addEventListener('click', () => {
  document.getElementById('mappingFormWrap').classList.toggle('hidden');
});

document.getElementById('saveMappingBtn').addEventListener('click', async () => {
  const src = document.getElementById('srcField').value.trim();
  const tgt = document.getElementById('tgtField').value.trim();
  if (!src || !tgt) { showToast('Source and target fields are required.', 'error'); return; }
  try {
    await apiFetch('/mappings', { method: 'POST', body: JSON.stringify({ sourceField: src, targetField: tgt, description: document.getElementById('mapDesc').value }) });
    document.getElementById('srcField').value = '';
    document.getElementById('tgtField').value = '';
    document.getElementById('mapDesc').value = '';
    document.getElementById('mappingFormWrap').classList.add('hidden');
    showToast('Mapping saved!');
    const { mappings } = await apiFetch('/mappings');
    renderMappings(mappings || []);
  } catch (err) { showToast(err.message, 'error'); }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/';
});

load();