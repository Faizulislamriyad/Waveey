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
const gateChecking = document.getElementById('gateChecking');
const profileWrap = document.getElementById('profileWrap');
document.getElementById('gateSignInBtn').onclick = () => auth.signInWithPopup(googleProvider).catch(e => toast(e.message));

let currentUser = null;
let allSfxCache = [];

auth.onAuthStateChanged(user => {
  currentUser = user;
  gateChecking.classList.add('hidden');

  if (!user){
    gateSignedOut.classList.remove('hidden');
    profileWrap.classList.add('hidden');
    return;
  }
  gateSignedOut.classList.add('hidden');
  profileWrap.classList.remove('hidden');

  document.getElementById('pAvatar').src = user.photoURL || '';
  document.getElementById('pName').textContent = user.displayName || 'Anonymous';
  document.getElementById('pEmail').textContent = user.email || '';

  const admin = isAdminEmail(user.email);
  document.querySelectorAll('.user-only').forEach(el => el.classList.toggle('hidden', admin));
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !admin));

  if (admin){
    watchSalesDashboard();
    watchAdminRequests();
  } else {
    watchSavedSounds(user.uid);
    watchMyRequests(user.email);
    watchMyOrders(user.uid);
    watchCategoryList();
    initTypeToggle('requestTypeToggle', 'requestSingleFields', 'requestAlbumFields');
    initPaymentRows('rqPaymentRows', 'rqAddPayment');
  }
});

function fmtPrice(n){
  const num = Number(n) || 0;
  return num === 0 ? 'Free' : `Tk ${num}`;
}

// ---------- Admin: sales dashboard ----------
function watchSalesDashboard(){
  db.collection('orders').onSnapshot(snap => {
    let total = 0, approved = 0, pending = 0;
    snap.forEach(doc => {
      const d = doc.data();
      if (d.status === 'approved'){ total += Number(d.total) || 0; approved++; }
      if (d.status === 'pending') pending++;
    });
    document.getElementById('salesTotal').textContent = `Tk ${total.toFixed(2)}`;
    document.getElementById('salesOrders').textContent = approved;
    document.getElementById('salesPending').textContent = pending;
  });
}

// ---------- Admin: quick upload-request review ----------
function watchAdminRequests(){
  db.collection('requests').where('status', '==', 'pending').onSnapshot(snap => {
    const list = document.getElementById('adminReqList');
    document.getElementById('adminReqCount').textContent = snap.size;
    if (snap.empty){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No pending requests</b></div></div>`;
      return;
    }
    list.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="info">
          <b>${escapeHtml(d.name || 'Untitled')} ${d.type === 'album' ? '<span class="badge pending">Album</span>' : ''}</b>
          <span>${escapeHtml(d.requestedBy || '—')} · ${fmtPrice(d.price)}</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn ghost small">Full review</button>
        </div>
      `;
      row.querySelector('button').onclick = () => { location.href = 'admin.html'; };
      list.appendChild(row);
    });
  });
}

// ---------- Category suggestions ----------
function watchCategoryList(){
  db.collection('sfx').onSnapshot(snap => {
    allSfxCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cats = [...new Set(allSfxCache.map(s => s.category).filter(Boolean))];
    const dl = document.getElementById('categoryList');
    dl.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
  });
}

// ---------- Saved sounds ----------
let savedUnsub = null;
function watchSavedSounds(uid){
  if (savedUnsub) savedUnsub();
  savedUnsub = db.collection('users').doc(uid).onSnapshot(async doc => {
    const ids = (doc.exists && doc.data().savedIds) || [];
    document.getElementById('savedCount').textContent = ids.length;
    const list = document.getElementById('savedList');
    if (!ids.length){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No saved sounds yet</b><span>Tap the bookmark icon on any sound to save it here.</span></div></div>`;
      return;
    }
    list.innerHTML = `<div class="admin-row"><div class="info"><b>Loading…</b></div></div>`;
    try{
      const snaps = await Promise.all(ids.map(id => db.collection('sfx').doc(id).get()));
      list.innerHTML = '';
      snaps.forEach(s => {
        if (!s.exists) return;
        const d = s.data();
        const row = document.createElement('div');
        row.className = 'admin-row';
        row.innerHTML = `
          <div class="info">
            <b>${escapeHtml(d.name || 'Untitled')}</b>
            <span>${escapeHtml(d.category || 'General')} · ${fmtPrice(d.price)}</span>
          </div>
          <a class="btn ghost small" href="index.html">View</a>
        `;
        list.appendChild(row);
      });
    }catch(e){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>Couldn't load saved sounds</b></div></div>`;
    }
  });
}

// ---------- Request a sound upload ----------
const requestForm = document.getElementById('requestForm');
const rqProgress = document.getElementById('rqProgress');
const rqProgressBar = document.getElementById('rqProgressBar');
const rqSubmitBtn = document.getElementById('rqSubmitBtn');
const rqStatusText = document.getElementById('rqStatusText');

requestForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME'){
    toast('Uploads are not set up yet — ask the site owner to finish Cloudinary setup');
    return;
  }

  const type = getActiveType('requestTypeToggle');
  const copyright = document.getElementById('rqCopyright').value;
  const paymentMethods = collectPaymentRows('rqPaymentRows');

  rqSubmitBtn.disabled = true;
  rqProgress.classList.add('show');
  rqProgressBar.style.width = '0%';
  rqStatusText.textContent = '';

  try{
    if (type === 'single'){
      const file = document.getElementById('rqFile').files[0];
      if (!file){ toast('Choose an audio file first'); throw new Error('no-file'); }

      const name = document.getElementById('rqName').value.trim();
      const category = document.getElementById('rqCategory').value.trim();
      const description = document.getElementById('rqDesc').value.trim();
      const useFor = document.getElementById('rqUseFor').value.trim();
      const price = Number(document.getElementById('rqPrice').value) || 0;

      rqStatusText.textContent = 'Uploading audio…';
      const result = await uploadToCloudinary(file, 'video', pct => { rqProgressBar.style.width = pct + '%'; });

      await db.collection('requests').add({
        type: 'single', name, category, description, useFor, price, copyright, paymentMethods,
        fileUrl: result.secure_url,
        cloudinaryId: result.public_id,
        status: 'pending',
        requestedBy: currentUser.email,
        requestedByUid: currentUser.uid,
        requestedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const cover = document.getElementById('rqAlbumCover').files[0];
      const preview = document.getElementById('rqAlbumPreview').files[0];
      const tracks = [...document.getElementById('rqAlbumTracks').files];
      if (!cover || !preview || !tracks.length){ toast('Cover, preview and at least one track are required'); throw new Error('no-file'); }

      const name = document.getElementById('rqAlbumName').value.trim();
      const category = document.getElementById('rqAlbumCategory').value.trim();
      const description = document.getElementById('rqAlbumDesc').value.trim();
      const price = Number(document.getElementById('rqAlbumPrice').value) || 0;

      rqStatusText.textContent = 'Uploading cover…';
      const coverRes = await uploadToCloudinary(cover, 'image', pct => { rqProgressBar.style.width = pct + '%'; });

      rqStatusText.textContent = 'Uploading preview…';
      const previewRes = await uploadToCloudinary(preview, 'video', pct => { rqProgressBar.style.width = pct + '%'; });

      const trackUrls = [];
      for (let i = 0; i < tracks.length; i++){
        rqStatusText.textContent = `Uploading track ${i+1} of ${tracks.length}…`;
        const r = await uploadToCloudinary(tracks[i], 'video', pct => { rqProgressBar.style.width = pct + '%'; });
        trackUrls.push(r.secure_url);
      }

      await db.collection('requests').add({
        type: 'album', name, category, description, price, copyright, paymentMethods,
        coverUrl: coverRes.secure_url,
        previewUrl: previewRes.secure_url,
        totalTracks: trackUrls.length,
        trackUrls,
        status: 'pending',
        requestedBy: currentUser.email,
        requestedByUid: currentUser.uid,
        requestedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    toast('Request submitted — an admin will review it');
    requestForm.reset();
    initPaymentRows('rqPaymentRows', 'rqAddPayment');
  }catch(err){
    if (err.message !== 'no-file') toast('Submit failed: ' + err.message);
  }finally{
    rqSubmitBtn.disabled = false;
    rqProgress.classList.remove('show');
    rqProgressBar.style.width = '0%';
    rqStatusText.textContent = '';
  }
});

// ---------- My requests ----------
let reqUnsub = null;
function watchMyRequests(email){
  if (reqUnsub) reqUnsub();
  reqUnsub = db.collection('requests').where('requestedBy', '==', email).onSnapshot(snap => {
    const list = document.getElementById('myRequests');
    if (snap.empty){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No requests yet</b><span>Submit a sound above and track its status here.</span></div></div>`;
      return;
    }
    const docs = snap.docs.sort((a,b) => (b.data().requestedAt?.seconds||0) - (a.data().requestedAt?.seconds||0));
    list.innerHTML = '';
    docs.forEach(doc => {
      const d = doc.data();
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="info">
          <b>${escapeHtml(d.name || 'Untitled')}</b>
          <span>${escapeHtml(d.category || 'General')} · ${fmtPrice(d.price)}</span>
        </div>
        <span class="badge ${d.status}">${d.status}</span>
      `;
      list.appendChild(row);
    });
  });
}

// ---------- My orders ----------
let orderUnsub = null;
function watchMyOrders(uid){
  if (orderUnsub) orderUnsub();
  orderUnsub = db.collection('orders').where('userId', '==', uid).onSnapshot(snap => {
    const list = document.getElementById('myOrders');
    if (snap.empty){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No orders yet</b><span>Add a paid sound to your cart and check out to see it here.</span></div></div>`;
      return;
    }
    const docs = snap.docs.sort((a,b) => (b.data().createdAt?.seconds||0) - (a.data().createdAt?.seconds||0));
    list.innerHTML = '';
    docs.forEach(doc => {
      const d = doc.data();
      const names = (d.items || []).map(i => i.name).join(', ');
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="info">
          <b>${escapeHtml(names || 'Order')}</b>
          <span>Tk ${(d.total||0).toFixed(2)}</span>
        </div>
        <span class="badge ${d.status}">${d.status}</span>
      `;
      list.appendChild(row);
    });
  });
}