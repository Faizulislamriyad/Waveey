// ---------- Toast ----------
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ---------- Auth ----------
let currentUser = null;
let savedIds = [];
let purchasedIds = [];
let savedPayment = null;
let isAdmin = false;

let userDocUnsub = null;
auth.onAuthStateChanged(async user => {
  currentUser = user;
  isAdmin = user ? isAdminEmail(user.email) : false;
  if (userDocUnsub) { userDocUnsub(); userDocUnsub = null; }

  if (user){
    await ensureUserDoc(user);
    userDocUnsub = db.collection('users').doc(user.uid).onSnapshot(doc => {
      const data = doc.exists ? doc.data() : {};
      savedIds = data.savedIds || [];
      purchasedIds = data.purchasedIds || [];
      savedPayment = data.savedPayment || null;
      render();
    });
  } else {
    savedIds = [];
    purchasedIds = [];
    savedPayment = null;
    render();
  }
});

async function ensureUserDoc(user){
  const ref = db.collection('users').doc(user.uid);
  const doc = await ref.get();
  if (!doc.exists){
    await ref.set({
      email: user.email,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      savedIds: [],
      purchasedIds: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('stats').doc('summary').set({
      totalUsers: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
  }
}

async function toggleSave(sfxId, btn){
  if (!currentUser){ loginOverlay.classList.remove('hidden'); return; }
  const isSaved = savedIds.includes(sfxId);
  btn.disabled = true;
  try{
    await db.collection('users').doc(currentUser.uid).update({
      savedIds: isSaved
        ? firebase.firestore.FieldValue.arrayRemove(sfxId)
        : firebase.firestore.FieldValue.arrayUnion(sfxId)
    });
  }catch(e){ toast('Could not update saved sounds'); }
  btn.disabled = false;
}

// ---------- Login-required modal ----------
const loginOverlay = document.getElementById('loginOverlay');
document.getElementById('modalCloseBtn').onclick = () => loginOverlay.classList.add('hidden');
document.getElementById('modalGoogleBtn').onclick = async () => {
  await auth.signInWithPopup(googleProvider).catch(err => toast('Sign-in failed: ' + err.message));
  if (auth.currentUser){
    loginOverlay.classList.add('hidden');
    toast('Signed in');
  }
};

// ---------- Stats dashboard ----------
db.collection('stats').doc('summary').onSnapshot(doc => {
  const d = doc.exists ? doc.data() : {};
  document.getElementById('statUsers').textContent = d.totalUsers || 0;
  document.getElementById('statDownloads').textContent = d.totalDownloads || 0;
});

async function bumpDownloadStat(){
  try{
    await db.collection('stats').doc('summary').set({
      totalDownloads: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
  }catch(e){ /* non-critical */ }
}

// ---------- Cart ----------
function getCart(){
  try{ return JSON.parse(localStorage.getItem('wf-cart') || '[]'); }catch(e){ return []; }
}
function setCart(items){
  localStorage.setItem('wf-cart', JSON.stringify(items));
  renderCartBadge();
}
function addToCart(sfx){
  const items = getCart();
  if (items.some(i => i.id === sfx.id)){ toast('Already in your cart'); return; }
  items.push({ id: sfx.id, name: sfx.name, price: sfx.price });
  setCart(items);
  toast('Added to cart');
  render();
}
function removeFromCart(id){
  setCart(getCart().filter(i => i.id !== id));
  renderCartModal();
  render();
}
function renderCartBadge(){
  const items = getCart();
  const badge = document.getElementById('cartBadge');
  badge.textContent = items.length;
  badge.classList.toggle('hidden', items.length === 0);
}
function renderCartModal(){
  const items = getCart();
  const wrap = document.getElementById('cartItems');
  if (!items.length){
    wrap.innerHTML = `<div class="cart-empty">Your cart is empty.</div>`;
    document.getElementById('checkoutBtn').classList.add('hidden');
    return;
  }
  const total = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  wrap.innerHTML = items.map(i => `
    <div class="cart-item">
      <div class="info"><b>${escapeHtml(i.name)}</b><span>${fmtPrice(i.price)}</span></div>
      <button class="btn small danger" data-id="${i.id}">Remove</button>
    </div>
  `).join('') + `<div class="cart-total"><span>Total</span><span>Tk ${total.toFixed(2)}</span></div>`;
  wrap.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => removeFromCart(b.dataset.id));
  document.getElementById('checkoutBtn').classList.remove('hidden');
}
function openCartModal(){
  renderCartModal();
  document.getElementById('cartOverlay').classList.remove('hidden');
}
document.getElementById('cartBtn').addEventListener('click', e => {
  e.preventDefault();
  openCartModal();
});
document.getElementById('cartCloseBtn').onclick = () => document.getElementById('cartOverlay').classList.add('hidden');
document.getElementById('checkoutBtn').onclick = openPaymentForm;
renderCartBadge();
if (location.hash === '#cart') openCartModal();

// ---------- Payment details form ----------
const paymentOverlay = document.getElementById('paymentOverlay');
const paymentForm = document.getElementById('paymentForm');

function renderSellerPayInfo(){
  const wrap = document.getElementById('sellerPayInfo');
  const items = getCart();
  const lines = [];
  items.forEach(item => {
    const sfx = allSfx.find(s => s.id === item.id);
    if (sfx && sfx.paymentMethods && sfx.paymentMethods.length){
      const methods = sfx.paymentMethods.map(p => `${p.method}: ${p.number}`).join(' · ');
      lines.push(`<div class="pm-line"><b>${escapeHtml(sfx.name)}</b> — ${escapeHtml(methods)}</div>`);
    }
  });
  wrap.innerHTML = lines.length
    ? `<div class="seller-pay-list"><b>Send payment to:</b>${lines.join('')}</div>`
    : '';
}

function openPaymentForm(){
  if (!getCart().length){ toast('Your cart is empty'); return; }
  if (!currentUser){
    document.getElementById('cartOverlay').classList.add('hidden');
    loginOverlay.classList.remove('hidden');
    return;
  }
  document.getElementById('payName').value = savedPayment?.fullName || currentUser.displayName || '';
  document.getElementById('payPhone').value = savedPayment?.phone || '';
  document.getElementById('payEmail').value = savedPayment?.email || currentUser.email || '';
  document.getElementById('payMethod').value = savedPayment?.method || 'Bkash';
  document.getElementById('payTxnId').value = '';
  document.getElementById('paySaveInfo').checked = !!savedPayment;
  document.getElementById('payAgreeTerms').checked = false;
  renderSellerPayInfo();
  document.getElementById('cartOverlay').classList.add('hidden');
  paymentOverlay.classList.remove('hidden');
}
document.getElementById('paymentCancelBtn').onclick = () => paymentOverlay.classList.add('hidden');

paymentForm.addEventListener('submit', async e => {
  e.preventDefault();
  const items = getCart();
  if (!items.length){ toast('Your cart is empty'); paymentOverlay.classList.add('hidden'); return; }
  if (!document.getElementById('payAgreeTerms').checked){
    toast('Please agree to the terms & conditions');
    return;
  }

  const fullName = document.getElementById('payName').value.trim();
  const phone = document.getElementById('payPhone').value.trim();
  const email = document.getElementById('payEmail').value.trim();
  const method = document.getElementById('payMethod').value;
  const transactionId = document.getElementById('payTxnId').value.trim();
  const saveInfo = document.getElementById('paySaveInfo').checked;

  const submitBtn = paymentForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  try{
    await db.collection('orders').add({
      userId: currentUser.uid,
      userEmail: currentUser.email,
      userName: currentUser.displayName || '',
      items,
      total: items.reduce((sum, i) => sum + (Number(i.price) || 0), 0),
      status: 'pending',
      payment: { fullName, phone, email, method, transactionId },
      agreedTerms: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (saveInfo){
      await db.collection('users').doc(currentUser.uid).update({
        savedPayment: { fullName, phone, email, method }
      });
    }

    setCart([]);
    paymentOverlay.classList.add('hidden');
    toast('Checkout request sent — an admin will review it.');
  }catch(err){
    toast('Checkout failed: ' + err.message);
  }finally{
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit for approval';
  }
});

// ---------- Library ----------
let allSfx = [];
let activeCategory = 'all';
let searchTerm = '';

const CATEGORY_COLORS = ['#8a6bff','#17d6c4','#ff9f5b','#ff6b9d','#5bd4ff','#c4ff5b','#ff6b6b','#c48aff'];
function colorFor(cat){
  let hash = 0;
  for (const c of (cat || 'sfx')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

db.collection('sfx').orderBy('uploadedAt', 'desc').onSnapshot(snap => {
  allSfx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  markPopular(allSfx);
  document.getElementById('statSounds').textContent = allSfx.length;
  buildCategoryChips();
  render();
}, err => {
  document.getElementById('sfxGrid').innerHTML = `<div class="empty"><b>Couldn't load the library</b>${err.message}</div>`;
});

function markPopular(list){
  const withDownloads = list.filter(s => Number(s.downloads) > 0);
  const top = [...withDownloads].sort((a,b) => (b.downloads||0) - (a.downloads||0)).slice(0, 3);
  const topIds = new Set(top.map(s => s.id));
  list.forEach(s => { s.popular = topIds.has(s.id); });
}

function buildCategoryChips(){
  const cats = [...new Set(allSfx.map(s => s.category).filter(Boolean))];
  const row = document.getElementById('categoryChips');
  row.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.className = 'chip' + (activeCategory === 'all' ? ' active' : '');
  allChip.textContent = 'All';
  allChip.onclick = () => { activeCategory = 'all'; buildCategoryChips(); render(); };
  row.appendChild(allChip);

  cats.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (activeCategory === cat ? ' active' : '');
    chip.textContent = cat;
    chip.onclick = () => { activeCategory = cat; buildCategoryChips(); render(); };
    row.appendChild(chip);
  });
}

document.getElementById('searchInput').addEventListener('input', e => {
  searchTerm = e.target.value.trim().toLowerCase();
  render();
});

let activePlayer = null;

function render(){
  const grid = document.getElementById('sfxGrid');
  let list = allSfx;
  if (activeCategory !== 'all') list = list.filter(s => s.category === activeCategory);
  if (searchTerm) list = list.filter(s =>
    (s.name||'').toLowerCase().includes(searchTerm) ||
    (s.description||'').toLowerCase().includes(searchTerm) ||
    (s.useFor||'').toLowerCase().includes(searchTerm)
  );

  if (!list.length){
    grid.innerHTML = `<div class="empty"><b>No sounds found</b>Try a different search or category.</div>`;
    return;
  }

  activePlayer = null;
  grid.innerHTML = '';
  list.forEach(sfx => grid.appendChild(renderCard(sfx)));
}

function renderCard(sfx){
  const isAlbum = sfx.type === 'album';
  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--cat-color', colorFor(sfx.category || 'sfx'));
  const isSaved = savedIds.includes(sfx.id);
  const price = Number(sfx.price) || 0;
  const owned = isAdmin || purchasedIds.includes(sfx.id);
  const downloads = Number(sfx.downloads) || 0;
  const previewUrl = isAlbum ? sfx.previewUrl : sfx.fileUrl;

  const priceLabel = price === 0
    ? '<span class="price free">Free</span>'
    : (owned && !isAdmin)
      ? '<span class="price free">Purchased</span>'
      : `<span class="price">Tk ${sfx.price}</span>`;

  const btnLabel = (price === 0 || owned)
    ? (isAlbum ? 'Download album' : 'Download')
    : (getCart().some(i => i.id === sfx.id) ? 'In cart' : 'Add to cart');

  card.innerHTML = `
    ${isAlbum && sfx.coverUrl ? `<img class="card-cover" src="${sfx.coverUrl}" alt="">` : ''}
    <div class="card-top">
      <h3>${escapeHtml(sfx.name || 'Untitled')}</h3>
      <div class="card-actions">
        <button class="save-btn${isSaved ? ' active' : ''}" title="Save" aria-label="Save sound">
          <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
        </button>
        <span class="tag-row">
          <span class="tag">${escapeHtml(sfx.category || 'General')}</span>
          ${isAlbum ? '<span class="tag album-tag">Album</span>' : ''}
          ${sfx.popular ? '<span class="tag popular-tag">🔥 Popular</span>' : ''}
        </span>
      </div>
    </div>
    <p class="desc">${escapeHtml(sfx.description || 'No description provided.')}</p>

    <audio class="raw-audio" preload="none" src="${previewUrl || ''}"></audio>
    <div class="player">
      <button class="play-btn" aria-label="Play">
        <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        <svg class="icon-pause hidden" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      </button>
      <div class="track"><div class="fill"></div><div class="knob"></div></div>
      <span class="time">0:00</span>
    </div>

    <div class="meta-row">${isAlbum ? `<b>Tracks:</b> ${Number(sfx.totalTracks)||0}` : `<b>Use for:</b> ${escapeHtml(sfx.useFor || '—')}`}</div>
    <div class="download-count">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      ${downloads} download${downloads === 1 ? '' : 's'}
    </div>
    <div class="card-foot">
      ${priceLabel}
      <button class="btn small">${btnLabel}</button>
    </div>
  `;

  wireSaveButton(card, sfx);
  wirePlayer(card);
  card.querySelector('.card-foot .btn').addEventListener('click', () => handleDownload(sfx, card.querySelector('.card-foot .btn')));
  return card;
}

function wireSaveButton(card, sfx){
  const btn = card.querySelector('.save-btn');
  btn.addEventListener('click', () => toggleSave(sfx.id, btn));
}

function wirePlayer(card){
  const audio = card.querySelector('.raw-audio');
  const playBtn = card.querySelector('.play-btn');
  const iconPlay = card.querySelector('.icon-play');
  const iconPause = card.querySelector('.icon-pause');
  const track = card.querySelector('.track');
  const fill = card.querySelector('.fill');
  const knob = card.querySelector('.knob');
  const timeEl = card.querySelector('.time');

  function fmt(t){
    if (!isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  function setProgress(){
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    fill.style.width = pct + '%';
    knob.style.left = pct + '%';
    timeEl.textContent = fmt(audio.duration ? audio.duration - audio.currentTime : 0);
  }
  function pauseVisual(){
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }

  playBtn.addEventListener('click', () => {
    if (!audio.src){ toast('No preview available'); return; }
    if (activePlayer && activePlayer !== audio){ activePlayer.pause(); }
    if (audio.paused){
      audio.play().catch(() => toast('Could not play this sound'));
      activePlayer = audio;
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
    } else {
      audio.pause();
      pauseVisual();
    }
  });
  audio.addEventListener('timeupdate', setProgress);
  audio.addEventListener('loadedmetadata', setProgress);
  audio.addEventListener('ended', () => { pauseVisual(); setProgress(); });
  audio.addEventListener('pause', pauseVisual);

  track.addEventListener('click', e => {
    if (!audio.duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * audio.duration;
    setProgress();
  });
}

async function handleDownload(sfx, btn){
  const price = Number(sfx.price) || 0;
  const owned = isAdmin || purchasedIds.includes(sfx.id);

  if (price > 0 && !owned){
    if (!currentUser){ loginOverlay.classList.remove('hidden'); return; }
    addToCart(sfx);
    return;
  }

  if (!currentUser){
    loginOverlay.classList.remove('hidden');
    return;
  }

  const original = btn.textContent;
  btn.textContent = 'Preparing…';
  btn.disabled = true;
  try{
    if (sfx.type === 'album'){
      const tracks = sfx.trackUrls || [];
      for (let i = 0; i < tracks.length; i++){
        await downloadFile(tracks[i], `${sfx.name || 'album'} - Track ${i+1}`.replace(/[^a-z0-9\-_ ]/gi,''));
        await new Promise(r => setTimeout(r, 400));
      }
    } else {
      await downloadFile(sfx.fileUrl, (sfx.name || 'sfx').replace(/[^a-z0-9\-_ ]/gi,''));
    }
    toast('Download started');
    bumpDownloadStat();
    bumpSfxDownloadCount(sfx.id);
  }catch(err){
    toast('Download failed — try again');
  }finally{
    btn.textContent = original;
    btn.disabled = false;
  }
}

async function downloadFile(fileUrl, baseName){
  const res = await fetch(fileUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = baseName + guessExt(fileUrl);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function bumpSfxDownloadCount(sfxId){
  try{
    await db.collection('sfx').doc(sfxId).update({
      downloads: firebase.firestore.FieldValue.increment(1)
    });
  }catch(e){ /* non-critical */ }
}

function guessExt(url){
  const m = url.split('?')[0].match(/\.(mp3|wav|ogg|m4a|flac|jpg|png)$/i);
  return m ? m[0] : '.mp3';
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtPrice(n){
  const num = Number(n) || 0;
  return num === 0 ? 'Free' : `Tk ${num}`;
}