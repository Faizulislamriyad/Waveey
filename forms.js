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
    <input type="text" class="pm-number" placeholder="Number">
    <button type="button" class="pm-remove" aria-label="Remove">✕</button>
  `;
  row.querySelector('.pm-method').value = method || 'Bkash';
  row.querySelector('.pm-number').value = number || '';
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

function initTypeToggle(toggleId, singleFieldsId, albumFieldsId){
  const toggle = document.getElementById(toggleId);
  if (!toggle) return;
  toggle.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      toggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      document.getElementById(singleFieldsId).classList.toggle('hidden', type !== 'single');
      document.getElementById(albumFieldsId).classList.toggle('hidden', type !== 'album');
    };
  });
}

function getActiveType(toggleId){
  const active = document.querySelector(`#${toggleId} button.active`);
  return active ? active.dataset.type : 'single';
}

function fmtPrice(n){
  const num = Number(n) || 0;
  return num === 0 ? 'Free' : `Tk ${num}`;
}

// Generic Cloudinary upload (used for audio, cover images, and album tracks).
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