// ---------- Theme (shared behaviour with main site) ----------
const themeToggle = document.getElementById('themeToggle');
function applyTheme(mode){ document.body.classList.toggle('day', mode === 'day'); }
applyTheme(localStorage.getItem('wf-theme') || 'night');
themeToggle.addEventListener('click', () => {
  const next = document.body.classList.contains('day') ? 'night' : 'day';
  applyTheme(next);
  localStorage.setItem('wf-theme', next);
});

// ---------- Toast ----------
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ---------- Elements ----------
const authArea = document.getElementById('authArea');
const gateSignedOut = document.getElementById('gateSignedOut');
const gateDenied = document.getElementById('gateDenied');
const dashboard = document.getElementById('dashboard');

document.getElementById('gateSignInBtn').onclick = () => auth.signInWithPopup(googleProvider).catch(e => toast(e.message));
document.getElementById('denySignOutBtn').onclick = () => auth.signOut();

function showOnly(el){
  [gateSignedOut, gateDenied, dashboard].forEach(x => x.classList.add('hidden'));
  el.classList.remove('hidden');
}

let currentUser = null;
let isAdmin = false;

auth.onAuthStateChanged(async user => {
  currentUser = user;
  renderAuthArea();

  if (!user){
    isAdmin = false;
    showOnly(gateSignedOut);
    return;
  }

  try{
    isAdmin = ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(user.email.toLowerCase().trim());
  }catch(e){
    isAdmin = false;
    console.error('Admin check failed:', e);
  }

  if (isAdmin){
    showOnly(dashboard);
    loadLibrary();
    loadRequests();
    loadOrders();
  } else {
    showOnly(gateDenied);
  }
});

function renderAuthArea(){
  authArea.innerHTML = '';
  if (!currentUser) return;
  const chip = document.createElement('div');
  chip.className = 'user-chip';
  chip.innerHTML = `<img src="${currentUser.photoURL || ''}" alt=""><span>${(currentUser.displayName||'').split(' ')[0]}</span>`;
  const logout = document.createElement('button');
  logout.className = 'btn ghost small';
  logout.textContent = 'Sign out';
  logout.style.marginLeft = '8px';
  logout.onclick = () => auth.signOut();
  authArea.append(chip, logout);
}

// ---------- Category suggestions ----------
function updateCategoryList(categories){
  const datalist = document.getElementById('categoryList');
  datalist.innerHTML = [...new Set(categories)].sort()
    .map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
}

// ---------- Upload ----------
const form = document.getElementById('uploadForm');
const progressWrap = document.getElementById('uploadProgress');
const progressBar = document.getElementById('uploadProgressBar');
const uploadBtn = document.getElementById('uploadBtn');

form.addEventListener('submit', e => {
  e.preventDefault();
  const file = document.getElementById('fFile').files[0];
  if (!file){ toast('Choose an audio file first'); return; }

  const name = document.getElementById('fName').value.trim();
  const category = document.getElementById('fCategory').value.trim();
  const description = document.getElementById('fDesc').value.trim();
  const useFor = document.getElementById('fUseFor').value.trim();
  const price = Number(document.getElementById('fPrice').value) || 0;

  if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME'){
    toast('Set up Cloudinary first — see cloud-config.js / README');
    return;
  }

  uploadBtn.disabled = true;
  progressWrap.classList.add('show');
  progressBar.style.width = '0%';

  uploadToCloudinary(file, pct => { progressBar.style.width = pct + '%'; })
    .then(async result => {
      await db.collection('sfx').add({
        name, category, description, useFor, price,
        fileUrl: result.secure_url,
        cloudinaryId: result.public_id,
        uploadedBy: currentUser.email,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      toast('Sound uploaded');
      form.reset();
    })
    .catch(err => toast('Upload failed: ' + err.message))
    .finally(() => {
      uploadBtn.disabled = false;
      progressWrap.classList.remove('show');
      progressBar.style.width = '0%';
    });
});

function uploadToCloudinary(file, onProgress){
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`);

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      try{
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error?.message || 'Upload failed'));
      }catch(err){ reject(err); }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

// ---------- Library list ----------
function loadLibrary(){
  db.collection('sfx').orderBy('uploadedAt', 'desc').onSnapshot(snap => {
    const list = document.getElementById('libList');
    document.getElementById('libCount').textContent = snap.size;
    updateCategoryList(snap.docs.map(d => d.data().category).filter(Boolean));

    if (snap.empty){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No sounds yet</b><span>Upload your first one above.</span></div></div>`;
      return;
    }
    list.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="info">
          <b>${escapeHtml(d.name || 'Untitled')}</b>
          <span>${escapeHtml(d.category || 'General')} · ${d.price ? '$'+d.price : 'Free'} · by ${escapeHtml(d.uploadedBy || '—')}</span>
        </div>
        <button class="btn small danger">Delete</button>
      `;
      row.querySelector('button').onclick = () => deleteSfx(doc.id);
      list.appendChild(row);
    });
  });
}

async function deleteSfx(id){
  if (!confirm('Remove this sound from the library? This cannot be undone.\n\n(Note: the audio file itself stays on Cloudinary — delete it there too if you want it fully gone.)')) return;
  try{
    await db.collection('sfx').doc(id).delete();
    toast('Removed from library');
  }catch(e){
    toast('Delete failed: ' + e.message);
  }
}

// ---------- Upload requests ----------
function loadRequests(){
  db.collection('requests').where('status', '==', 'pending').onSnapshot(snap => {
    const list = document.getElementById('requestsList');
    document.getElementById('reqCount').textContent = snap.size;

    if (snap.empty){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No pending requests</b><span>New upload requests from users will show up here.</span></div></div>`;
      return;
    }

    list.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const row = document.createElement('div');
      row.className = 'panel';
      row.style.cssText = 'padding:16px;margin-bottom:14px;background:var(--glass-strong)';
      row.innerHTML = `
        <div class="sub" style="margin-bottom:12px">Requested by ${escapeHtml(d.requestedByName || d.requestedBy || '—')} · ${d.price ? '$'+d.price : 'Free'} · <a href="${d.fileUrl}" target="_blank" rel="noopener">preview file</a></div>
        <div class="form-grid">
          <div class="field">
            <label>Sound name</label>
            <input type="text" class="rName" value="${escapeHtml(d.name || '')}">
          </div>
          <div class="field">
            <label>Category</label>
            <input type="text" class="rCategory" list="categoryList" value="${escapeHtml(d.category || '')}">
          </div>
          <div class="field full">
            <label>Description</label>
            <textarea class="rDesc">${escapeHtml(d.description || '')}</textarea>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn primary small approveBtn">Approve</button>
          <button class="btn danger small rejectBtn">Reject</button>
        </div>
      `;
      row.querySelector('.approveBtn').onclick = () => approveRequest(doc.id, d, row);
      row.querySelector('.rejectBtn').onclick = () => rejectRequest(doc.id);
      list.appendChild(row);
    });
  });
}

async function approveRequest(id, original, row){
  const name = row.querySelector('.rName').value.trim();
  const category = row.querySelector('.rCategory').value.trim();
  const description = row.querySelector('.rDesc').value.trim();
  if (!name || !category){ toast('Name and category are required'); return; }

  try{
    await db.collection('sfx').add({
      name, category, description,
      useFor: original.useFor || '',
      price: original.price || 0,
      fileUrl: original.fileUrl,
      cloudinaryId: original.cloudinaryId || null,
      uploadedBy: original.requestedBy || currentUser.email,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('requests').doc(id).update({ status: 'approved' });
    toast('Approved — now live in the library');
  }catch(e){
    toast('Approve failed: ' + e.message);
  }
}

async function rejectRequest(id){
  if (!confirm('Reject this upload request?')) return;
  try{
    await db.collection('requests').doc(id).update({ status: 'rejected' });
    toast('Request rejected');
  }catch(e){
    toast('Failed: ' + e.message);
  }
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Orders (checkout requests) ----------
function loadOrders(){
  db.collection('orders').where('status', '==', 'pending').onSnapshot(snap => {
    const list = document.getElementById('ordersList');
    document.getElementById('orderCount').textContent = snap.size;

    if (snap.empty){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No pending orders</b><span>Checkout requests from users will show up here.</span></div></div>`;
      return;
    }

    const docs = snap.docs.sort((a,b) => (b.data().createdAt?.seconds||0) - (a.data().createdAt?.seconds||0));
    list.innerHTML = '';
    docs.forEach(doc => {
      const d = doc.data();
      const row = document.createElement('div');
      row.className = 'panel';
      row.style.cssText = 'padding:16px;margin-bottom:14px;background:var(--glass-strong)';
      const itemsHtml = (d.items || []).map(i => `${escapeHtml(i.name)} — $${i.price}`).join('<br>');
      row.innerHTML = `
        <div class="sub" style="margin-bottom:6px">Requested by ${escapeHtml(d.userName || d.userEmail || '—')} (${escapeHtml(d.userEmail || '—')})</div>
        <div class="order-items">${itemsHtml}</div>
        <div style="font-weight:700;margin:8px 0">Total: $${(d.total || 0).toFixed(2)}</div>
        <div style="display:flex;gap:10px">
          <button class="btn primary small approveBtn">Approve</button>
          <button class="btn danger small rejectBtn">Reject</button>
        </div>
      `;
      row.querySelector('.approveBtn').onclick = () => approveOrder(doc.id, d, row);
      row.querySelector('.rejectBtn').onclick = () => rejectOrder(doc.id);
      list.appendChild(row);
    });
  });
}

async function approveOrder(id, order, row){
  const btn = row.querySelector('.approveBtn');
  btn.disabled = true;
  btn.textContent = 'Approving…';
  try{
    const ids = (order.items || []).map(i => i.id);
    await db.collection('users').doc(order.userId).update({
      purchasedIds: firebase.firestore.FieldValue.arrayUnion(...ids)
    });
    await db.collection('orders').doc(id).update({
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Order approved — sounds unlocked for the buyer');
  }catch(e){
    toast('Approve failed: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Approve';
  }
}

async function rejectOrder(id){
  if (!confirm('Reject this checkout request?')) return;
  try{
    await db.collection('orders').doc(id).update({ status: 'rejected' });
    toast('Order rejected');
  }catch(e){
    toast('Failed: ' + e.message);
  }
}