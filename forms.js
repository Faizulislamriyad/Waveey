// forms.js — shared helpers for the upload / edit / request forms
// (admin.html and profile.html both load this before their own script)

function paymentRowEl(method, number){
  const row = document.createElement('div');
  row.className = 'payment-row';
  row.innerHTML = `
    <select class="pm-method">
      <option value="Bkash">Bkash</option>
      <option value="Nogod">Nogod</option>
      <option value="Roket">Roket</option>
    </select>
    <input type="tel" class="pm-number" placeholder="11 digit number" inputmode="numeric" maxlength="11">
    <button type="button" class="pm-remove" aria-label="Remove">✕</button>
  `;
  row.querySelector('.pm-method').value = method || 'Bkash';
  row.querySelector('.pm-number').value = number || '';
  const numberInput = row.querySelector('.pm-number');
  numberInput.addEventListener('input', () => {
    numberInput.value = numberInput.value.replace(/\D/g, '').slice(0, 11);
  });
  row.querySelector('.pm-remove').onclick = () => row.remove();
  return row;
}

function initPaymentRows(containerId, addBtnId, existing){
  const container = document.getElementById(containerId);
  const addBtn = document.getElementById(addBtnId);
  if (!container || !addBtn) return;
  container.innerHTML = '';
  const rows = (existing && existing.length) ? existing : [{ method: 'Bkash', number: '' }];
  rows.forEach(p => container.appendChild(paymentRowEl(p.method, p.number)));
  addBtn.onclick = () => container.appendChild(paymentRowEl('Bkash', ''));
}

function collectPaymentRows(containerId){
  const rows = document.querySelectorAll(`#${containerId} .payment-row`);
  return [...rows]
    .map(r => ({
      method: r.querySelector('.pm-method').value,
      number: r.querySelector('.pm-number').value.trim()
    }))
    .filter(p => p.number);
}

// Payment method + number is mandatory on every upload/request/edit form,
// and every number must be exactly 11 digits (Bkash/Nogod/Roket format).
// Returns the collected list if valid; shows a toast and returns false otherwise.
function requirePaymentRows(containerId){
  const list = collectPaymentRows(containerId);
  if (!list.length){
    if (typeof toast === 'function') toast('Add at least one payment method and number');
    return false;
  }
  const bad = list.find(p => !/^\d{11}$/.test(p.number));
  if (bad){
    if (typeof toast === 'function') toast(`${bad.method} number must be exactly 11 digits`);
    return false;
  }
  return list;
}

// Generic Single/BGM/Album/Pack toggle. fieldsMap maps each button's
// data-type to the id of the field block it should reveal (multiple types
// can share the same block, e.g. sfx/bgm both show "uploadSimpleFields").
function initTypeToggle(toggleId, fieldsMap){
  const toggle = document.getElementById(toggleId);
  if (!toggle) return;
  const buttons = [...toggle.querySelectorAll('button')];
  const allFieldIds = [...new Set(Object.values(fieldsMap || {}))];

  function activate(btn){
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const targetId = fieldsMap ? fieldsMap[btn.dataset.type] : null;
    allFieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== targetId);
    });
  }

  buttons.forEach(btn => btn.addEventListener('click', () => activate(btn)));

  const initial = toggle.querySelector('button.active') || buttons[0];
  if (initial) activate(initial);
}

function getActiveType(toggleId){
  const active = document.querySelector(`#${toggleId} button.active`);
  return active ? active.dataset.type : 'sfx';
}

// Treats the legacy "single" type (from before the SFX/BGM/Album/Pack
// rename) as "sfx" everywhere.
function normalizeType(t){
  return t === 'single' ? 'sfx' : (t || 'sfx');
}

function fmtPrice(n){
  const num = Number(n) || 0;
  return num === 0 ? 'Free' : `Tk ${num}`;
}

// Generic Cloudinary upload (used for audio, cover images, and multi-track uploads).
// resourceType: 'video' for audio files, 'image' for cover images.
function uploadToCloudinary(file, resourceType, onProgress){
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`);

    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
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