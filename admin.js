// ---------- Toast ----------
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Elements ----------
const gateSignedOut = document.getElementById('gateSignedOut');
const gateDenied = document.getElementById('gateDenied');
const gateChecking = document.getElementById('gateChecking');
const dashboard = document.getElementById('dashboard');

document.getElementById('gateSignInBtn').onclick = () => auth.signInWithPopup(googleProvider).catch(e => toast(e.message));
document.getElementById('denySignOutBtn').onclick = () => auth.signOut();

function showOnly(el){
  [gateSignedOut, gateDenied, gateChecking, dashboard].forEach(x => x.classList.add('hidden'));
  el.classList.remove('hidden');
}

let currentUser = null;
let isAdmin = false;

auth.onAuthStateChanged(async user => {
  currentUser = user;

  if (!user){
    isAdmin = false;
    showOnly(gateSignedOut);
    return;
  }

  isAdmin = isAdminEmail(user.email);

  if (isAdmin){
    showOnly(dashboard);
    loadCategoryList();
    loadLibrary();
    loadRequests();
    loadOrders();
  } else {
    showOnly(gateDenied);
  }
});

function loadCategoryList(){
  db.collection('sfx').onSnapshot(snap => {
    const cats = [...new Set(snap.docs.map(d => d.data().category).filter(Boolean))];
    const dl = document.getElementById('categoryList');
    dl.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
  });
}

// ---------- Type toggle + payment rows for the upload form ----------
initTypeToggle('uploadTypeToggle', 'uploadSingleFields', 'uploadAlbumFields');
initPaymentRows('fPaymentRows', 'fAddPayment');

// ---------- Upload ----------
const form = document.getElementById('uploadForm');
const progressWrap = document.getElementById('uploadProgress');
const progressBar = document.getElementById('uploadProgressBar');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatusText = document.getElementById('uploadStatusText');

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME'){
    toast('Set up Cloudinary first — see cloud-config.js / README');
    return;
  }

  const type = getActiveType('uploadTypeToggle');
  const copyright = document.getElementById('fCopyright').value;
  const paymentMethods = collectPaymentRows('fPaymentRows');

  uploadBtn.disabled = true;
  progressWrap.classList.add('show');
  progressBar.style.width = '0%';
  uploadStatusText.textContent = '';

  try{
    if (type === 'single'){
      const file = document.getElementById('fFile').files[0];
      if (!file){ toast('Choose an audio file first'); throw new Error('no-file'); }

      const name = document.getElementById('fName').value.trim();
      const category = document.getElementById('fCategory').value.trim();
      const description = document.getElementById('fDesc').value.trim();
      const useFor = document.getElementById('fUseFor').value.trim();
      const price = Number(document.getElementById('fPrice').value) || 0;

      uploadStatusText.textContent = 'Uploading audio…';
      const result = await uploadToCloudinary(file, 'video', pct => { progressBar.style.width = pct + '%'; });

      await db.collection('sfx').add({
        type: 'single', name, category, description, useFor, price, copyright, paymentMethods,
        fileUrl: result.secure_url,
        cloudinaryId: result.public_id,
        downloads: 0,
        uploadedBy: currentUser.email,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const cover = document.getElementById('fAlbumCover').files[0];
      const preview = document.getElementById('fAlbumPreview').files[0];
      const tracks = [...document.getElementById('fAlbumTracks').files];
      if (!cover || !preview || !tracks.length){ toast('Cover, preview and at least one track are required'); throw new Error('no-file'); }

      const name = document.getElementById('fAlbumName').value.trim();
      const category = document.getElementById('fAlbumCategory').value.trim();
      const description = document.getElementById('fAlbumDesc').value.trim();
      const price = Number(document.getElementById('fAlbumPrice').value) || 0;

      uploadStatusText.textContent = 'Uploading cover…';
      const coverRes = await uploadToCloudinary(cover, 'image', pct => { progressBar.style.width = pct + '%'; });

      uploadStatusText.textContent = 'Uploading preview…';
      const previewRes = await uploadToCloudinary(preview, 'video', pct => { progressBar.style.width = pct + '%'; });

      const trackUrls = [];
      for (let i = 0; i < tracks.length; i++){
        uploadStatusText.textContent = `Uploading track ${i+1} of ${tracks.length}…`;
        const r = await uploadToCloudinary(tracks[i], 'video', pct => { progressBar.style.width = pct + '%'; });
        trackUrls.push(r.secure_url);
      }

      await db.collection('sfx').add({
        type: 'album', name, category, description, price, copyright, paymentMethods,
        coverUrl: coverRes.secure_url,
        previewUrl: previewRes.secure_url,
        totalTracks: trackUrls.length,
        trackUrls,
        downloads: 0,
        uploadedBy: currentUser.email,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    toast('Sound uploaded');
    form.reset();
    initPaymentRows('fPaymentRows', 'fAddPayment');
  }catch(err){
    if (err.message !== 'no-file') toast('Upload failed: ' + err.message);
  }finally{
    uploadBtn.disabled = false;
    progressWrap.classList.remove('show');
    progressBar.style.width = '0%';
    uploadStatusText.textContent = '';
  }
});

// ---------- Library (with edit) ----------
let libraryCache = {};
function loadLibrary(){
  db.collection('sfx').orderBy('uploadedAt', 'desc').onSnapshot(snap => {
    const list = document.getElementById('libList');
    document.getElementById('libCount').textContent = snap.size;
    libraryCache = {};
    if (snap.empty){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No sounds yet</b><span>Upload your first one above.</span></div></div>`;
      return;
    }
    list.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      libraryCache[doc.id] = d;
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="info">
          <b>${escapeHtml(d.name || 'Untitled')} ${d.type === 'album' ? '<span class="badge pending">Album</span>' : ''}</b>
          <span>${escapeHtml(d.category || 'General')} · ${fmtPrice(d.price)} · ${d.downloads||0} downloads · by ${escapeHtml(d.uploadedBy || '—')}</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn ghost small editBtn">Edit</button>
          <button class="btn small danger delBtn">Delete</button>
        </div>
      `;
      row.querySelector('.editBtn').onclick = () => openEditModal(doc.id, d);
      row.querySelector('.delBtn').onclick = () => deleteSfx(doc.id);
      list.appendChild(row);
    });
  });
}

async function deleteSfx(id){
  if (!confirm('Remove this sound from the library? This cannot be undone.\n\n(Note: files stay on Cloudinary — delete them there too if you want them fully gone.)')) return;
  try{
    await db.collection('sfx').doc(id).delete();
    toast('Removed from library');
  }catch(e){
    toast('Delete failed: ' + e.message);
  }
}

// ---------- Edit modal ----------
const editOverlay = document.getElementById('editOverlay');
const editForm = document.getElementById('editForm');
let editingId = null;
initPaymentRows('ePaymentRows', 'eAddPayment');

function openEditModal(id, d){
  editingId = id;
  document.getElementById('eName').value = d.name || '';
  document.getElementById('eCategory').value = d.category || '';
  document.getElementById('eDesc').value = d.description || '';
  document.getElementById('eUseFor').value = d.useFor || '';
  document.getElementById('ePrice').value = d.price || 0;
  document.getElementById('eCopyright').value = d.copyright || 'None';
  initPaymentRows('ePaymentRows', 'eAddPayment', d.paymentMethods);
  editOverlay.classList.remove('hidden');
}
document.getElementById('editCancelBtn').onclick = () => editOverlay.classList.add('hidden');

editForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!editingId) return;
  const submitBtn = editForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try{
    await db.collection('sfx').doc(editingId).update({
      name: document.getElementById('eName').value.trim(),
      category: document.getElementById('eCategory').value.trim(),
      description: document.getElementById('eDesc').value.trim(),
      useFor: document.getElementById('eUseFor').value.trim(),
      price: Number(document.getElementById('ePrice').value) || 0,
      copyright: document.getElementById('eCopyright').value,
      paymentMethods: collectPaymentRows('ePaymentRows')
    });
    toast('Sound updated');
    editOverlay.classList.add('hidden');
  }catch(err){
    toast('Update failed: ' + err.message);
  }finally{
    submitBtn.disabled = false;
  }
});

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
      const itemsHtml = (d.items || []).map(i => `${escapeHtml(i.name)} — ${fmtPrice(i.price)}`).join('<br>');
      const p = d.payment || {};
      row.innerHTML = `
        <div class="sub" style="margin-bottom:6px">Requested by ${escapeHtml(d.userName || d.userEmail || '—')} (${escapeHtml(d.userEmail || '—')})</div>
        <div class="order-items">${itemsHtml}</div>
        <div style="font-weight:700;margin:8px 0">Total: Tk ${(d.total || 0).toFixed(2)}</div>
        <div class="order-payment">
          <div><b>Name:</b> ${escapeHtml(p.fullName || '—')}</div>
          <div><b>Phone:</b> ${escapeHtml(p.phone || '—')}</div>
          <div><b>Email:</b> ${escapeHtml(p.email || '—')}</div>
          <div><b>Method:</b> ${escapeHtml(p.method || '—')}</div>
          <div><b>Transaction ID:</b> ${escapeHtml(p.transactionId || '—')}</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px">
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

// ---------- Upload requests ----------
function loadRequests(){
  db.collection('requests').where('status', '==', 'pending').onSnapshot(snap => {
    const list = document.getElementById('requestsList');
    document.getElementById('reqCount').textContent = snap.size;

    if (snap.empty){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No pending requests</b><span>User-submitted sounds will show up here.</span></div></div>`;
      return;
    }

    const docs = snap.docs.sort((a,b) => (b.data().requestedAt?.seconds||0) - (a.data().requestedAt?.seconds||0));
    list.innerHTML = '';
    docs.forEach(doc => {
      const d = doc.data();
      const isAlbum = d.type === 'album';
      const row = document.createElement('div');
      row.className = 'panel';
      row.style.cssText = 'padding:16px;margin-bottom:14px;background:var(--glass-strong)';

      const rowId = `req-${doc.id}`;
      const pmHtml = (d.paymentMethods||[]).map(p => `${p.method}: ${p.number}`).join(' · ') || '—';

      row.innerHTML = `
        <div class="sub" style="margin-bottom:10px">
          Submitted by ${escapeHtml(d.requestedBy || '—')} ${isAlbum ? '<span class="badge pending">Album</span>' : ''} · ${fmtPrice(d.price)} · Copyright: ${escapeHtml(d.copyright || 'None')}
        </div>

        ${isAlbum ? `
          <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap">
            ${d.coverUrl ? `<img src="${d.coverUrl}" alt="" style="width:80px;height:80px;border-radius:10px;object-fit:cover">` : ''}
            <div style="flex:1;min-width:180px">
              <div class="sub" style="margin-bottom:4px">Preview (public sample):</div>
              <audio controls preload="none" src="${d.previewUrl||''}" style="width:100%;height:36px"></audio>
              <div class="sub" style="margin:6px 0 0">${d.totalTracks||0} track(s) in this album</div>
            </div>
          </div>
        ` : `
          <audio controls preload="none" src="${d.fileUrl||''}" style="width:100%;height:36px;margin-bottom:10px"></audio>
        `}

        <div class="sub" style="margin-bottom:6px">Payment methods: ${escapeHtml(pmHtml)}</div>

        <div class="request-edit-fields">
          <div class="field"><label>Name</label><input type="text" id="${rowId}-name" value="${escapeHtml(d.name||'')}"></div>
          <div class="field"><label>Category</label><input type="text" id="${rowId}-category" list="categoryList" value="${escapeHtml(d.category||'')}"></div>
          <div class="field full"><label>Description</label><textarea id="${rowId}-desc">${escapeHtml(d.description||'')}</textarea></div>
        </div>

        <div style="display:flex;gap:10px;margin-top:6px">
          <button class="btn primary small approveBtn">Approve &amp; publish</button>
          <button class="btn danger small rejectBtn">Reject</button>
        </div>
      `;
      row.querySelector('.approveBtn').onclick = () => approveRequest(doc.id, d, rowId, row);
      row.querySelector('.rejectBtn').onclick = () => rejectRequest(doc.id);
      list.appendChild(row);
    });
  });
}

async function approveRequest(id, d, rowId, row){
  const btn = row.querySelector('.approveBtn');
  btn.disabled = true;
  btn.textContent = 'Publishing…';
  try{
    const name = document.getElementById(`${rowId}-name`).value.trim();
    const category = document.getElementById(`${rowId}-category`).value.trim();
    const description = document.getElementById(`${rowId}-desc`).value.trim();

    const published = {
      type: d.type || 'single',
      name, category, description,
      price: d.price || 0,
      copyright: d.copyright || 'None',
      paymentMethods: d.paymentMethods || [],
      downloads: 0,
      uploadedBy: d.requestedBy || 'user request',
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (published.type === 'album'){
      published.coverUrl = d.coverUrl;
      published.previewUrl = d.previewUrl;
      published.totalTracks = d.totalTracks || 0;
      published.trackUrls = d.trackUrls || [];
    } else {
      published.useFor = d.useFor || '';
      published.fileUrl = d.fileUrl;
      published.cloudinaryId = d.cloudinaryId || '';
    }

    await db.collection('sfx').add(published);
    await db.collection('requests').doc(id).update({ status: 'approved' });
    toast('Published to the library');
  }catch(err){
    toast('Publish failed: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Approve & publish';
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