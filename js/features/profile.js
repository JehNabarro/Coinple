/* ── Fotinhos (fotos de perfil) ── */
function resizeImageToDataUrl(file, size = 128) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Erro ao ler a imagem'));
    reader.readAsDataURL(file);
  });
}

let photoTargetEmail = null;

function pickPartnerPhoto(email) {
  photoTargetEmail = email;
  document.getElementById('partner-photo-file').click();
}

async function handlePartnerPhotoChange(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !photoTargetEmail) return;
  try {
    const dataUrl = await resizeImageToDataUrl(file);
    const p = getPartner(photoTargetEmail);
    if (p) {
      p.photo = dataUrl;
      saveState();
      if (!state.demoMode && p.id) {
        updateProfileInDb({ id: p.id, name: p.name, photo: dataUrl })
          .catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
      }
      renderPartnerList();
      renderCoupleCard(getActiveEvent());
      showToast('Fotinho atualizada! 📸💕');
    }
  } catch (err) {
    showToast(`Erro: ${err.message}`);
  }
}

