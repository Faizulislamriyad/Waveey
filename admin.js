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
    loadSettings();
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
initTypeToggle('uploadTypeToggle', {
  sfx: 'uploadSimpleFields',
  bgm: 'uploadSimpleFields',
  album: 'uploadAlbumFields',
  pack: 'uploadPackFields'
});
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
  const paymentMethods = requirePaymentRows('fPaymentRows');
  if (!paymentMethods) return;

  uploadBtn.disabled = true;
  progressWrap.classList.add('show');
  progressBar.style.width = '0%';
  uploadStatusText.textContent = '';

  try{
    if (type === 'sfx' || type === 'bgm'){
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
        type, name, category, description, useFor, price, copyright, paymentMethods,
        fileUrl: result.secure_url,
        cloudinaryId: result.public_id,
        downloads: 0,
        source: 'admin',
        uploadedBy: currentUser.email,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else if (type === 'album'){
      const cover = document.getElementById('fAlbumCover').files[0];
      const preview = document.getElementById('fAlbumPreview').files[0];
      const tracks = [...document.getElementById('fAlbumTracks').files];
      if (!cover || !preview || !tracks.length){ toast('Cover, preview and at least one track are required'); throw new Error('no-file'); }

      const name = document.getElementById('fAlbumName').value.trim();
      const artistName = document.getElementById('fAlbumArtist').value.trim();
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
        type: 'album', name, artistName, category, description, price, copyright, paymentMethods,
        coverUrl: coverRes.secure_url,
        previewUrl: previewRes.secure_url,
        totalTracks: trackUrls.length,
        trackUrls,
        downloads: 0,
        source: 'admin',
        uploadedBy: currentUser.email,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // pack
      const preview = document.getElementById('fPackPreview').files[0];
      const files = [...document.getElementById('fPackFiles').files];
      if (!preview || !files.length){ toast('Preview and at least one sound are required'); throw new Error('no-file'); }

      const name = document.getElementById('fPackName').value.trim();
      const category = document.getElementById('fPackCategory').value.trim();
      const description = document.getElementById('fPackDesc').value.trim();
      const price = Number(document.getElementById('fPackPrice').value) || 0;

      uploadStatusText.textContent = 'Uploading preview…';
      const previewRes = await uploadToCloudinary(preview, 'video', pct => { progressBar.style.width = pct + '%'; });

      const trackUrls = [];
      for (let i = 0; i < files.length; i++){
        uploadStatusText.textContent = `Uploading sound ${i+1} of ${files.length}…`;
        const r = await uploadToCloudinary(files[i], 'video', pct => { progressBar.style.width = pct + '%'; });
        trackUrls.push(r.secure_url);
      }

      await db.collection('sfx').add({
        type: 'pack', name, category, description, price, copyright, paymentMethods,
        previewUrl: previewRes.secure_url,
        totalTracks: trackUrls.length,
        trackUrls,
        downloads: 0,
        source: 'admin',
        uploadedBy: currentUser.email,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    toast('Uploaded');
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

// ---------- Site settings ----------
function loadSettings(){
  db.collection('settings').doc('site').get().then(doc => {
    const d = doc.exists ? doc.data() : {};
    document.getElementById('stNews').value = d.newsText || '';
    document.getElementById('stVersion').value = d.version || 'Version : 2.00 Waveform SFX Library by Faizul Islam Riyad';
  });
}
document.getElementById('stSaveBtn').onclick = async () => {
  const btn = document.getElementById('stSaveBtn');
  btn.disabled = true;
  try{
    await db.collection('settings').doc('site').set({
      newsText: document.getElementById('stNews').value.trim(),
      version: document.getElementById('stVersion').value.trim()
    }, { merge: true });
    toast('Settings saved');
  }catch(e){
    toast('Save failed: ' + e.message);
  }finally{
    btn.disabled = false;
  }
};

// ---------- Library (admin-uploaded only, with edit) ----------
function loadLibrary(){
  db.collection('sfx').orderBy('uploadedAt', 'desc').onSnapshot(snap => {
    const list = document.getElementById('libList');
    const adminDocs = snap.docs.filter(d => (d.data().source || 'admin') === 'admin');
    document.getElementById('libCount').textContent = adminDocs.length;
    if (!adminDocs.length){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No sounds yet</b><span>Upload your first one above.</span></div></div>`;
      return;
    }
    list.innerHTML = '';
    adminDocs.forEach(doc => {
      const d = doc.data();
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="info">
          <b>${escapeHtml(d.name || 'Untitled')} <span class="badge pending">${(d.type||'sfx').toUpperCase()}</span></b>
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
  const paymentMethods = requirePaymentRows('ePaymentRows');
  if (!paymentMethods) return;
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
      paymentMethods
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
      const p = d.payment || {};
      const row = document.createElement('div');
      row.className = 'order-card';
      row.innerHTML = `
        <div class="order-card-head">
          <div>
            <b>${escapeHtml(d.userName || d.userEmail || '—')}</b>
            <span>${escapeHtml(d.userEmail || '—')}</span>
          </div>
          <div class="order-total">Tk ${(d.total || 0).toFixed(2)}</div>
        </div>
        <div class="order-card-body">
          <div class="order-section">
            <h4>Items</h4>
            <ul>${(d.items || []).map(i => `<li>${escapeHtml(i.name)} — ${fmtPrice(i.price)}</li>`).join('')}</ul>
          </div>
          <div class="order-section">
            <h4>Payment info</h4>
            <dl>
              <dt>Name</dt><dd>${escapeHtml(p.fullName || '—')}</dd>
              <dt>Phone</dt><dd>${escapeHtml(p.phone || '—')}</dd>
              <dt>Email</dt><dd>${escapeHtml(p.email || '—')}</dd>
              <dt>Method</dt><dd>${escapeHtml(p.method || '—')}</dd>
              <dt>Txn ID</dt><dd>${escapeHtml(p.transactionId || '—')}</dd>
            </dl>
          </div>
        </div>
        <div class="order-card-actions">
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
      const type = d.type || 'sfx';
      const isBundle = type === 'album' || type === 'pack';
      const row = document.createElement('div');
      row.className = 'panel';
      row.style.cssText = 'padding:16px;margin-bottom:14px;background:var(--glass-strong)';

      const rowId = `req-${doc.id}`;
      const pmHtml = (d.paymentMethods||[]).map(p => `${p.method}: ${p.number}`).join(' · ') || '—';

      row.innerHTML = `
        <div class="sub" style="margin-bottom:10px">
          Submitted by ${escapeHtml(d.requestedBy || '—')} · <span class="badge pending">${type.toUpperCase()}</span> · ${fmtPrice(d.price)} · Copyright: ${escapeHtml(d.copyright || 'None')}
        </div>

        ${isBundle ? `
          <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap">
            ${d.coverUrl ? `<img src="${d.coverUrl}" alt="" style="width:80px;height:80px;border-radius:10px;object-fit:cover">` : ''}
            <div style="flex:1;min-width:180px">
              ${d.artistName ? `<div class="sub" style="margin-bottom:4px">Artist: ${escapeHtml(d.artistName)}</div>` : ''}
              <div class="sub" style="margin-bottom:4px">Preview (public sample):</div>
              <audio controls preload="none" src="${d.previewUrl||''}" style="width:100%;height:36px"></audio>
              <div class="sub" style="margin:6px 0 0">${d.totalTracks||0} file(s) in this ${type}</div>
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
    const type = d.type || 'sfx';

    const published = {
      type, name, category, description,
      price: d.price || 0,
      copyright: d.copyright || 'None',
      paymentMethods: d.paymentMethods || [],
      downloads: 0,
      source: 'user',
      uploadedBy: d.requestedBy || 'user request',
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (type === 'album' || type === 'pack'){
      published.previewUrl = d.previewUrl;
      published.totalTracks = d.totalTracks || 0;
      published.trackUrls = d.trackUrls || [];
      if (type === 'album'){
        published.coverUrl = d.coverUrl;
        published.artistName = d.artistName || '';
      }
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