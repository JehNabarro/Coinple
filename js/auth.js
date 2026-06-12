/* ── Google auth (Google Identity Services, token model) ── */

const GOOGLE_SCOPES = 'openid email profile https://www.googleapis.com/auth/spreadsheets';

let gisTokenClient = null;
let gisAccessToken = null;
let gisTokenExpiry = 0;
let gisClientId = null;

function getGoogleClientId() {
  return (
    localStorage.getItem('coinple-client-id') ||
    (typeof CONFIG !== 'undefined' && CONFIG.GOOGLE_CLIENT_ID) ||
    ''
  );
}

function setGoogleClientId(id) {
  if (id) localStorage.setItem('coinple-client-id', id.trim());
  else localStorage.removeItem('coinple-client-id');
}

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Não foi possível carregar o Google. Verifica a internet.'));
    document.head.appendChild(s);
  });
}

async function initTokenClient() {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error('Google Client ID não configurado.');
  if (gisTokenClient && gisClientId === clientId) return gisTokenClient;
  await loadGisScript();
  gisTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    callback: () => {},
  });
  gisClientId = clientId;
  return gisTokenClient;
}

function requestAccessToken({ silent = false } = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const client = await initTokenClient();
      client.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        gisAccessToken = resp.access_token;
        gisTokenExpiry = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        resolve(gisAccessToken);
      };
      client.error_callback = (err) =>
        reject(new Error(err?.message || err?.type || 'Login cancelado'));
      client.requestAccessToken({ prompt: silent ? '' : 'select_account' });
    } catch (e) {
      reject(e);
    }
  });
}

async function getValidToken() {
  if (gisAccessToken && Date.now() < gisTokenExpiry) return gisAccessToken;
  return requestAccessToken({ silent: true });
}

async function fetchGoogleProfile() {
  const token = await getValidToken();
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Não foi possível obter o teu perfil Google.');
  const data = await res.json();
  return { email: data.email, name: data.name || data.given_name || data.email, picture: data.picture || '' };
}

function clearAuth() {
  if (gisAccessToken && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(gisAccessToken, () => {}); } catch (e) { /* ignore */ }
  }
  gisAccessToken = null;
  gisTokenExpiry = 0;
}
