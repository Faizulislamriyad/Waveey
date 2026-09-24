// nav.js — shared header behavior across index.html / admin.html / profile.html
// Self-contained (IIFE) so its variable names never collide with each page's own script.
(function(){
  const ICON_SIGNOUT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';

  function renderAuthArea(user){
    const authArea = document.getElementById('authArea');
    if (!authArea) return;
    authArea.innerHTML = '';
    if (user){
      const chip = document.createElement('a');
      chip.href = 'profile.html';
      chip.className = 'user-chip';
      chip.innerHTML = `<img src="${user.photoURL || ''}" alt=""><span>${(user.displayName || '').split(' ')[0]}</span>`;
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'icon-btn';
      logout.setAttribute('aria-label', 'Sign out');
      logout.title = 'Sign out';
      logout.innerHTML = ICON_SIGNOUT;
      logout.onclick = () => auth.signOut();
      authArea.append(chip, logout);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn primary small';
      btn.textContent = 'Sign in';
      btn.onclick = () => auth.signInWithPopup(googleProvider).catch(() => {
        if (typeof toast === 'function') toast('Sign-in failed');
      });
      authArea.append(btn);
    }
  }

  let orderUnsub = null, reqUnsub = null;
  const counts = { orders: 0, requests: 0 };

  function updateAdminBadge(){
    const badge = document.getElementById('adminBadge');
    if (!badge) return;
    const total = counts.orders + counts.requests;
    badge.textContent = total;
    badge.classList.toggle('hidden', total === 0);
  }

  auth.onAuthStateChanged(user => {
    renderAuthArea(user);

    const adminLink = document.getElementById('adminLink');
    if (!adminLink) return;

    const admin = user ? isAdminEmail(user.email) : false;
    adminLink.classList.toggle('hidden', !admin);

    if (orderUnsub){ orderUnsub(); orderUnsub = null; }
    if (reqUnsub){ reqUnsub(); reqUnsub = null; }
    counts.orders = 0; counts.requests = 0;

    if (admin){
      orderUnsub = db.collection('orders').where('status', '==', 'pending').onSnapshot(snap => {
        counts.orders = snap.size; updateAdminBadge();
      });
      reqUnsub = db.collection('requests').where('status', '==', 'pending').onSnapshot(snap => {
        counts.requests = snap.size; updateAdminBadge();
      });
    } else {
      updateAdminBadge();
    }
  });

  function refreshCartBadge(){
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    let items = [];
    try{ items = JSON.parse(localStorage.getItem('wf-cart') || '[]'); }catch(e){}
    badge.textContent = items.length;
    badge.classList.toggle('hidden', items.length === 0);
  }
  refreshCartBadge();
  window.addEventListener('storage', refreshCartBadge);
  window.addEventListener('focus', refreshCartBadge);
})();