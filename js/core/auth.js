/* ── Supabase Auth (Google OAuth) ── */

async function handleGoogleLogin() {
  const hint = document.getElementById('login-hint');
  if (hint) hint.textContent = 'A abrir o Google…';

  const redirectTo = window.location.href.split('?')[0].replace(/#.*$/, '');
  const { error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error && hint) hint.textContent = `Erro: ${error.message}`;
}

/* clearAuth() mantida para compatibilidade — signOut é feito em app.js */
function clearAuth() {}
