/* ── Login ── */
async function handleAuthSignIn(user) {
  state.user = {
    id:      user.id,
    email:   user.email,
    name:    user.user_metadata?.full_name || user.email,
    picture: user.user_metadata?.avatar_url || '',
  };
  state.demoMode = false;
  saveState();

  const profile = await getCurrentProfile();
  if (profile?.couple_id) {
    state.coupleId = profile.couple_id;
    await syncFromSupabase({ quiet: true });
    subscribeRealtime();
    showView('app');
  } else {
    showView('setup');
  }
  saveState();
}

function handleDemoLogin() {
  state.user     = { id: null, email: 'eu@coinple.demo', name: 'Eu', picture: '' };
  state.demoMode = true;
  state.coupleId = null;
  if (!state.partners.length) {
    state.partners = [
      { id: null, email: 'eu@coinple.demo',  name: 'Eu',        photo: '' },
      { id: null, email: 'par@coinple.demo', name: 'Meu Amor',  photo: '' },
    ];
  }
  saveState();
  showView('app');
  showToast('Modo demo — os dados ficam só neste aparelho 💛');
}

async function handleLogout() {
  if (!confirm('Sair da Coinple neste aparelho?')) return;
  if (state.demoMode) {
    state.user     = null;
    state.demoMode = false;
    saveState();
    showView('login');
  } else {
    await handleLogout_supabase();
  }
}

async function handleLogout_supabase() {
  if (realtimeChannel) { realtimeChannel.unsubscribe(); realtimeChannel = null; }
  await _supabase.auth.signOut();
  // onAuthStateChange SIGNED_OUT vai tratar do resto
}

/* ── Setup (criar / juntar casal) ── */
function renderSetup() {
  const u = state.user || {};
  document.getElementById('setup-name').textContent = firstName(u.name);
  const av = document.getElementById('setup-avatar');
  if (u.picture) { av.src = u.picture; av.style.display = ''; }
  else av.style.display = 'none';
  document.getElementById('setup-share').style.display = 'none';
}

async function handleCreateSheet() {
  const btn = document.getElementById('btn-create-sheet');
  btn.disabled = true; btn.textContent = 'A criar… 🪄';
  try {
    // Semente do mês atual: usa orçamentos mensais já definidos, senão os
    // valores padrão das categorias.
    const mk = realMonthKey();
    let mb = state.monthlyBudgets[mk];
    if (!mb) {
      const categoryBudgets = {};
      state.categories.forEach(c => { categoryBudgets[c.id] = c.budget || 0; });
      mb = state.monthlyBudgets[mk] = {
        total: state.categories.reduce((s, c) => s + (c.budget || 0), 0),
        categoryBudgets,
      };
      saveState();
    }
    const couple = await createCouple(state.categories, mk, mb.total, mb.categoryBudgets);
    state.coupleId = couple.id;
    const profile = await getCurrentProfile();
    const code = profile?.couples?.invite_code || couple.invite_code;
    document.getElementById('share-link').value = code;
    document.getElementById('setup-share').style.display = '';
    document.getElementById('setup-share').scrollIntoView({ behavior: 'smooth' });
    await syncFromSupabase({ quiet: true });
    subscribeRealtime();
    saveState();
  } catch (err) {
    showToast(`Erro: ${err.message}`);
  } finally {
    btn.disabled = false; btn.textContent = 'Criar o nosso espaço';
  }
}

async function handleJoinSheet() {
  const code = document.getElementById('join-sheet-link').value.trim();
  if (!code) { showToast('Cola o código de convite 💌'); return; }
  const btn = document.getElementById('btn-join-sheet');
  btn.disabled = true; btn.textContent = 'A juntar… 💞';
  try {
    const couple = await joinCouple(code);
    state.coupleId = couple.id;
    await syncFromSupabase({ quiet: true });
    subscribeRealtime();
    saveState();
    showView('app');
    showToast('Contas juntas! Bem-vindos à Coinple 💛💗');
  } catch (err) {
    state.coupleId = null;
    showToast(`Erro: ${err.message}`);
  } finally {
    btn.disabled = false; btn.textContent = 'Juntar as nossas contas';
  }
}

/* ── Sync com Supabase ── */
let syncing = false;
let realtimeChannel = null;

async function syncFromSupabase({ quiet = false } = {}) {
  if (state.demoMode || !state.coupleId) return;
  if (syncing) return;
  syncing = true;
  document.getElementById('btn-sync')?.classList.add('spinning');
  try {
    const { expenses, partners, monthlyBudgets, legacyTotalBudget, events } = await loadCoupleData();
    state.expenses = expenses;
    state.partners = partners;
    state.events   = events;
    state.monthlyBudgets = monthlyBudgets || {};
    // Migração: casal antigo sem orçamentos mensais mas com total_budget legado
    // → copia o total legado para o mês atual.
    if (!Object.keys(state.monthlyBudgets).length && legacyTotalBudget > 0) {
      state.monthlyBudgets[realMonthKey()] = { total: legacyTotalBudget, categoryBudgets: {} };
    }
    saveState();
    if (activeScreen === 'dashboard') renderDashboard();
    if (activeScreen === 'history')   renderHistory();
    if (!quiet) showToast('Sincronizado 📊');
  } catch (err) {
    if (!quiet) showToast(`Erro ao sincronizar: ${err.message}`);
  } finally {
    syncing = false;
    document.getElementById('btn-sync')?.classList.remove('spinning');
  }
}

function subscribeRealtime() {
  if (state.demoMode || !state.coupleId) return;
  if (realtimeChannel) { realtimeChannel.unsubscribe(); realtimeChannel = null; }
  realtimeChannel = subscribeToCouple(state.coupleId, () => {
    syncFromSupabase({ quiet: true }).catch(() => {});
  });
}

