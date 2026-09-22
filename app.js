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

function renderAuthArea(){
  authArea.innerHTML = '';
  if (currentUser){
    const chip = document.createElement('div');
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
  // Redirect-based sign-in — works around Chrome's COOP popup blocking
  return auth.signInWithRedirect(googleProvider).catch(err => toast('Sign-in failed: ' + err.message));
}

// ---------- Handle redirect result ----------
auth.getRedirectResult()
  .then(result => {
    if (result && result.user) {
      toast('Signed in — you can download now.');
    }
  })
  .catch(err => {
    if (err && err.code && err.code !== 'auth/no-auth-event') {
      toast('Sign-in failed: ' + err.message);
    }
  });

auth.onAuthStateChanged(user => {
  currentUser = user;
  renderAuthArea();
});

// ---------- Login-required modal ----------
const loginOverlay = document.getElementById('loginOverlay');
document.getElementById('modalCloseBtn').onclick = () => loginOverlay.classList.add('hidden');
document.getElementById('modalGoogleBtn').onclick = () => {
  // Redirect will navigate away; on return onAuthStateChanged will fire.
  signIn();
};

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
  buildCategoryChips();
  render();
}, err => {
  console.error('Library load failed:', err.code, err.message);
  document.getElementById('sfxGrid').innerHTML = `<div class="empty"><b>Couldn't load the library</b>${err.message}</div>`;
});

function buildCategoryChips(){
  const cats = [...new Set(allSfx.map(s => s.category).filter(Boolean))];
  document.getElementById('statCount').textContent = allSfx.length;
  document.getElementById('statCat').textContent = cats.length;

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

  grid.innerHTML = '';
  list.forEach(sfx => grid.appendChild(renderCard(sfx)));
}

function renderCard(sfx){
  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--cat-color', colorFor(sfx.category || 'sfx'));

  const priceLabel = (!sfx.price || Number(sfx.price) === 0)
    ? '<span class="price free">Free</span>'
    : `<span class="price">${sfx.price}</span>`;

  card.innerHTML = `
    <div class="card-top">
      <h3>${escapeHtml(sfx.name || 'Untitled')}</h3>
      <span class="tag">${escapeHtml(sfx.category || 'General')}</span>
    </div>
    <p class="desc">${escapeHtml(sfx.description || 'No description provided.')}</p>
    <audio controls preload="none" src="${sfx.fileUrl}"></audio>
    <div class="meta-row"><b>Use for:</b> ${escapeHtml(sfx.useFor || '—')}</div>
    <div class="card-foot">
      ${priceLabel}
      <button class="btn small">Download</button>
    </div>
  `;

  const dlBtn = card.querySelector('.card-foot .btn');
  dlBtn.addEventListener('click', () => handleDownload(sfx, dlBtn));
  return card;
}

async function handleDownload(sfx, btn){
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