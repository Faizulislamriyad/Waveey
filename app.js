// ---------- Theme ----------
const themeToggle = document.getElementById('themeToggle');
function applyTheme(mode){
  document.body.classList.toggle('day', mode === 'day');
}
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

// ---------- Auth ----------
const authArea = document.getElementById('authArea');
let currentUser = null;
let savedIds = [];
let purchasedIds = [];

function renderAuthArea(){
  authArea.innerHTML = '';
  if (currentUser){
    const chip = document.createElement('a');
    chip.href = 'profile.html';
    chip.className = 'user-chip';
    chip.innerHTML = `<img src="${currentUser.photoURL || ''}" alt=""><span>${(currentUser.displayName||'').split(' ')[0]}</span>`;
    const logout = document.createElement('button');
    logout.className = 'btn ghost small';
    logout.textContent = 'Sign out';
    logout.style.marginLeft = '8px';
    logout.onclick = () => auth.signOut();
    authArea.append(chip, logout);
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn primary small';
    btn.textContent = 'Sign in';
    btn.onclick = () => signIn();
    authArea.append(btn);
  }
}

function signIn(){
  return auth.signInWithPopup(googleProvider).catch(err => toast('Sign-in failed: ' + err.message));
}

let userDocUnsub = null;
auth.onAuthStateChanged(async user => {
  currentUser = user;
  renderAuthArea();
  if (userDocUnsub) { userDocUnsub(); userDocUnsub = null; }

  if (user){
    await ensureUserDoc(user);
    userDocUnsub = db.collection('users').doc(user.uid).onSnapshot(doc => {
      savedIds = (doc.exists && doc.data().savedIds) || [];
      purchasedIds = (doc.exists && doc.data().purchasedIds) || [];
      render();
    });
  } else {
    savedIds = [];
    purchasedIds = [];
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
  await signIn();
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

// ---------- Cart (client-side, no payment gateway wired up) ----------
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
      <div class="info"><b>${escapeHtml(i.name)}</b><span>${i.price ? '$'+i.price : 'Free'}</span></div>
      <button class="btn small danger" data-id="${i.id}">Remove</button>
    </div>
  `).join('') + `<div class="cart-total"><span>Total</span><span>$${total.toFixed(2)}</span></div>`;
  wrap.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => removeFromCart(b.dataset.id));
  document.getElementById('checkoutBtn').classList.remove('hidden');
}
document.getElementById('cartBtn').onclick = () => {
  renderCartModal();
  document.getElementById('cartOverlay').classList.remove('hidden');
};
document.getElementById('cartCloseBtn').onclick = () => document.getElementById('cartOverlay').classList.add('hidden');
document.getElementById('checkoutBtn').onclick = checkoutCart;
renderCartBadge();

async function checkoutCart(){
  const items = getCart();
  if (!items.length){ toast('Your cart is empty'); return; }
  if (!currentUser){
    document.getElementById('cartOverlay').classList.add('hidden');
    loginOverlay.classList.remove('hidden');
    return;
  }
  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try{
    await db.collection('orders').add({
      userId: currentUser.uid,
      userEmail: currentUser.email,
      userName: currentUser.displayName || '',
      items,
      total: items.reduce((sum, i) => sum + (Number(i.price) || 0), 0),
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    setCart([]);
    document.getElementById('cartOverlay').classList.add('hidden');
    toast('Checkout request sent — an admin will review it.');
  }catch(e){
    toast('Checkout failed: ' + e.message);
  }finally{
    btn.disabled = false;
    btn.textContent = 'Checkout';
  }
}

// ---------- Data ----------
let allSfx = [];
let activeCategory = 'all';
let searchTerm = '';

const CATEGORY_COLORS = ['#8a6bff','#17d6c4','#ff9f5b','#ff6b9d','#5bd4ff','#c4ff5b','#ff6b6b','#c48aff'];
function colorFor(cat){
  let hash = 0;
  for (const c of cat) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

db.collection('sfx').orderBy('uploadedAt', 'desc').onSnapshot(snap => {
  allSfx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  document.getElementById('statSounds').textContent = allSfx.length;
  buildCategoryChips();
  render();
}, err => {
  document.getElementById('sfxGrid').innerHTML = `<div class="empty"><b>Couldn't load the library</b>${err.message}</div>`;
});

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

let activePlayer = null; // currently playing <audio> element

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
  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--cat-color', colorFor(sfx.category || 'sfx'));
  const isSaved = savedIds.includes(sfx.id);
  const price = Number(sfx.price) || 0;
  const owned = purchasedIds.includes(sfx.id);

  const priceLabel = price === 0
    ? '<span class="price free">Free</span>'
    : owned
      ? '<span class="price free">Purchased</span>'
      : `<span class="price">$${sfx.price}</span>`;

  const btnLabel = (price === 0 || owned)
    ? 'Download'
    : (getCart().some(i => i.id === sfx.id) ? 'In cart' : 'Add to cart');

  card.innerHTML = `
    <div class="card-top">
      <h3>${escapeHtml(sfx.name || 'Untitled')}</h3>
      <div class="card-actions">
        <button class="save-btn${isSaved ? ' active' : ''}" title="Save" aria-label="Save sound">
          <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
        </button>
        <span class="tag">${escapeHtml(sfx.category || 'General')}</span>
      </div>
    </div>
    <p class="desc">${escapeHtml(sfx.description || 'No description provided.')}</p>

    <audio class="raw-audio" preload="none" src="${sfx.fileUrl}"></audio>
    <div class="player">
      <button class="play-btn" aria-label="Play">
        <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        <svg class="icon-pause hidden" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      </button>
      <div class="track"><div class="fill"></div><div class="knob"></div></div>
      <span class="time">0:00</span>
    </div>

    <div class="meta-row"><b>Use for:</b> ${escapeHtml(sfx.useFor || '—')}</div>
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
  const owned = purchasedIds.includes(sfx.id);

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
    const res = await fetch(sfx.fileUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (sfx.name || 'sfx').replace(/[^a-z0-9\-_ ]/gi,'') + guessExt(sfx.fileUrl);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Download started');
    bumpDownloadStat();
  }catch(err){
    toast('Download failed — try again');
  }finally{
    btn.textContent = original;
    btn.disabled = false;
  }
}

function guessExt(url){
  const m = url.split('?')[0].match(/\.(mp3|wav|ogg|m4a|flac)$/i);
  return m ? m[0] : '.mp3';
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}