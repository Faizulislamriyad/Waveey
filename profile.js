// ---------- Theme ----------
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
const profileWrap = document.getElementById('profileWrap');
document.getElementById('gateSignInBtn').onclick = () => auth.signInWithPopup(googleProvider).catch(e => toast(e.message));

let currentUser = null;
let allSfxCache = [];

auth.onAuthStateChanged(user => {
  currentUser = user;
  renderAuthArea();

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

  watchSavedSounds(user.uid);
  watchMyRequests(user.email);
  watchMyOrders(user.uid);
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

// ---------- Category suggestions (for the request form) ----------
db.collection('sfx').onSnapshot(snap => {
  allSfxCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const cats = [...new Set(allSfxCache.map(s => s.category).filter(Boolean))].sort();
  document.getElementById('categoryList').innerHTML = cats.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
});

// ---------- Saved sounds ----------
let savedUnsub = null;
function watchSavedSounds(uid){
  if (savedUnsub) savedUnsub();
  savedUnsub = db.collection('users').doc(uid).onSnapshot(doc => {
    const ids = (doc.exists && doc.data().savedIds) || [];
    renderSaved(ids, uid);
  });
}

function renderSaved(ids, uid){
  const list = document.getElementById('savedList');
  document.getElementById('savedCount').textContent = ids.length;

  if (!ids.length){
    list.innerHTML = `<div class="admin-row"><div class="info"><b>Nothing saved yet</b><span>Tap the heart on any sound to save it here.</span></div></div>`;
    return;
  }

  const items = allSfxCache.filter(s => ids.includes(s.id));
  list.innerHTML = '';
  items.forEach(sfx => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="info">
        <b>${escapeHtml(sfx.name || 'Untitled')}</b>
        <span>${escapeHtml(sfx.category || 'General')} · ${sfx.price ? '$'+sfx.price : 'Free'}</span>
      </div>
      <button class="btn small danger">Remove</button>
    `;
    row.querySelector('button').onclick = async () => {
      await db.collection('users').doc(uid).update({
        savedIds: firebase.firestore.FieldValue.arrayRemove(sfx.id)
      });
    };
    list.appendChild(row);
  });
}

// ---------- Upload request form ----------
const rqForm = document.getElementById('requestForm');
const rqProgressWrap = document.getElementById('rqProgress');
const rqProgressBar = document.getElementById('rqProgressBar');
const rqSubmitBtn = document.getElementById('rqSubmitBtn');

rqForm.addEventListener('submit', e => {
  e.preventDefault();
  const file = document.getElementById('rqFile').files[0];
  if (!file){ toast('Choose an audio file first'); return; }

  const name = document.getElementById('rqName').value.trim();
  const category = document.getElementById('rqCategory').value.trim();
  const description = document.getElementById('rqDesc').value.trim();
  const useFor = document.getElementById('rqUseFor').value.trim();
  const price = Number(document.getElementById('rqPrice').value) || 0;

  if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME'){
    toast('Cloudinary is not set up yet — ask the site owner');
    return;
  }

  rqSubmitBtn.disabled = true;
  rqProgressWrap.classList.add('show');
  rqProgressBar.style.width = '0%';

  uploadToCloudinary(file, pct => { rqProgressBar.style.width = pct + '%'; })
    .then(async result => {
      await db.collection('requests').add({
        name, category, description, useFor, price,
        fileUrl: result.secure_url,
        cloudinaryId: result.public_id,
        requestedBy: currentUser.email,
        requestedByName: currentUser.displayName || '',
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      toast('Request submitted — an admin will review it');
      rqForm.reset();
    })
    .catch(err => toast('Submit failed: ' + err.message))
    .finally(() => {
      rqSubmitBtn.disabled = false;
      rqProgressWrap.classList.remove('show');
      rqProgressBar.style.width = '0%';
    });
});

function uploadToCloudinary(file, onProgress){
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress((e.loaded / e.total) * 100); };
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

// ---------- My requests ----------
let reqUnsub = null;
function watchMyRequests(email){
  if (reqUnsub) reqUnsub();
  reqUnsub = db.collection('requests').where('requestedBy', '==', email).onSnapshot(snap => {
    const list = document.getElementById('myRequests');
    if (snap.empty){
      list.innerHTML = `<div class="admin-row"><div class="info"><b>No requests yet</b><span>Submitted requests will show up here with their status.</span></div></div>`;
      return;
    }
    const docs = snap.docs.sort((a,b) => (b.data().createdAt?.seconds||0) - (a.data().createdAt?.seconds||0));
    list.innerHTML = '';
    docs.forEach(doc => {
      const d = doc.data();
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="info">
          <b>${escapeHtml(d.name || 'Untitled')}</b>
          <span>${escapeHtml(d.category || 'General')} · ${d.price ? '$'+d.price : 'Free'}</span>
        </div>
        <span class="badge ${d.status}">${d.status}</span>
      `;
      list.appendChild(row);
    });
  });
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
          <span>$${(d.total||0).toFixed(2)}</span>
        </div>
        <span class="badge ${d.status}">${d.status}</span>
      `;
      list.appendChild(row);
    });
  });
}