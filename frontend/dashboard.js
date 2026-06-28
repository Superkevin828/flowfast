/* ── dashboard.js — dashboard page logic ────────────────────────────── */

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

function renderFiles(files) {
  const el = document.getElementById('filesList');
  document.getElementById('fileCount').textContent = files.length + ' file' + (files.length !== 1 ? 's' : '');
  if (!files.length) {
    el.innerHTML = '<div class="empty-state" style="padding:2rem;"><div class="es-icon">📂</div><h3>No documents yet</h3><p>Upload your first file above to get started.</p></div>';
    return;
  }
  el.innerHTML = '<div class="file-list">' + files.map(f => {
    const docType = f.structuredData?.documentType || 'Document';
    const summary = f.structuredData?.customerName || f.structuredData?.total
      ? [f.structuredData?.customerName, f.structuredData?.total ? 'Total: ' + f.structuredData.total : null].filter(Boolean).join(' · ')
      : 'Processed';
    return `<div class="file-item">
      <div class="file-icon">${fileIcon(f.originalName)}</div>
      <div class="file-info">
        <div class="name">${f.originalName}</div>
        <div class="meta">${docType} · ${summary} · ${formatSize(f.size)}</div>
      </div>
      <div class="file-actions">
        <span class="badge ${f.status === 'processed' ? 'green' : 'yellow'}">${f.status || 'done'}</span>
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
    if (plan === 'free') {
      const banner = document.getElementById('upgradeBanner');
      banner.classList.remove('hidden');
      banner.classList.add('visible-flex');
    }
  } catch {}

  try {
    const { files } = await apiFetch('/uploads');
    renderFiles(files || []);
  } catch {}

  try {
    const { mappings } = await apiFetch('/mappings');
    renderMappings(mappings || []);
  } catch {}
}

// Drop zone upload
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleUpload(fileInput.files[0]); });

async function handleUpload(file) {
  const prog  = document.getElementById('uploadProgress');
  const fill  = document.getElementById('progressFill');
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
    label.textContent = '✓ ' + file.name + ' processed successfully';
    showToast('Document processed!', 'success');
    setTimeout(() => { prog.classList.remove('show'); fill.style.width = '0%'; }, 2500);
    const { files } = await apiFetch('/uploads');
    renderFiles(files || []);
    fileInput.value = '';
  } catch (err) {
    clearInterval(interval);
    fill.style.width = '0%';
    prog.classList.remove('show');
    showToast(err.message, 'error');
  }
}

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