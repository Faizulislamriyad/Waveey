// nav.js — shared header behavior across index.html / admin.html / profile.html
// Self-contained (IIFE) so its variable names never collide with each page's own script.
(function(){
  function renderAuthArea(user){
    const authArea = document.getElementById('authArea');
    if (!authArea) return;
    authArea.innerHTML = '';
    if (user){
      const chip = document.createElement('a');
      chip.href = 'profile.html';
      chip.className = 'user-chip';
      chip.innerHTML = `<img src="${user.photoURL || ''}" alt=""><span>${(user.displayName || '').split(' ')[0]}</span>`;
      authArea.append(chip);
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

    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn){
      signOutBtn.classList.toggle('hidden', !user);
      signOutBtn.onclick = () => auth.signOut();
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