/* ── Modal helpers ── */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  applyTheme(state.theme || 'dark');

  // Ecrã de loading fixo de 2 segundos
  setTimeout(() => document.body.classList.add('ready'), 2000);

  // Login / setup
  document.getElementById('btn-google-login').addEventListener('click', handleGoogleLogin);
  document.getElementById('btn-create-sheet').addEventListener('click', handleCreateSheet);
  document.getElementById('btn-join-sheet').addEventListener('click', handleJoinSheet);
  document.getElementById('btn-setup-done').addEventListener('click', () => { showView('app'); });
  document.getElementById('btn-setup-logout').addEventListener('click', () => {
    _supabase.auth.signOut();
  });
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const input = document.getElementById('share-link');
    input.select();
    navigator.clipboard?.writeText(input.value);
    showToast('Código copiado! 💌');
  });

  // App
  document.getElementById('tab-dashboard').addEventListener('click', () => showScreen('dashboard'));
  document.getElementById('tab-add').addEventListener('click', () => {
    showScreen('add');
    if (historyFilters.category !== 'all' && activeScreen === 'history') {
      addFormState.selectedCategory = historyFilters.category;
      renderCategoryPills();
    }
  });
  document.getElementById('tab-history').addEventListener('click',   () => showScreen('history'));
  document.getElementById('tab-budgets').addEventListener('click', openBudgetModal);
  document.getElementById('tab-events').addEventListener('click',   () => showScreen('events'));

  document.getElementById('btn-sync').addEventListener('click', () => syncFromSupabase());
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  document.getElementById('partner-photo-file').addEventListener('change', handlePartnerPhotoChange);

  document.getElementById('btn-open-sheet').addEventListener('click', handleOpenSheet);

  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.closeModal));
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('btn-save-budgets').addEventListener('click', saveBudgets);

  // Supabase Auth state listener — valida/invalida a sessão em background
  _supabase.auth.onAuthStateChange(async (event, session) => {
    if (state.demoMode) return; // demo mode ignora Supabase
    if (event === 'SIGNED_IN' && session?.user) {
      await handleAuthSignIn(session.user);
    } else if (event === 'INITIAL_SESSION' && session?.user) {
      // Sessão válida já existia — sincroniza silenciosamente se já na app
      if (state.user && state.coupleId) {
        syncFromSupabase({ quiet: true }).catch(() => {});
        subscribeRealtime();
      } else {
        await handleAuthSignIn(session.user);
      }
    } else if (event === 'INITIAL_SESSION' && !session) {
      // Sem sessão Supabase — limpa estado e vai para login
      state.user = null; state.coupleId = null; saveState();
      showView('login');
    } else if (event === 'SIGNED_OUT') {
      if (realtimeChannel) { realtimeChannel.unsubscribe(); realtimeChannel = null; }
      state.user     = null;
      state.demoMode = false;
      state.coupleId = null;
      saveState();
      showView('login');
    }
  });

  // Mostra a app imediatamente com dados locais (auth listener valida/invalida depois)
  if (state.user && state.demoMode) {
    showView('app');
  } else if (state.user && state.coupleId) {
    showView('app');
  } else if (!state.user) {
    showView('login');
  }

  // Re-sincroniza quando a app volta ao primeiro plano
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !state.demoMode && state.coupleId) {
      syncFromSupabase({ quiet: true }).catch(() => {});
    }
  });
});
