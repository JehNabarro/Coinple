/* ── Views: login / setup / app ── */
function showView(view) {
  document.body.classList.toggle('logged-out', view === 'login');
  document.body.classList.toggle('in-setup', view === 'setup');
  if (view === 'setup') renderSetup();
  if (view === 'app') {
    monthBudget(realMonthKey()); // garante orçamentos do mês atual em memória
    showScreen('dashboard');
  }
}

/* ── Navigation ── */
let activeScreen = 'dashboard';

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`screen-${id}`)?.classList.add('active');
  // event-form keeps the events tab active
  const tabId = id === 'event-form' ? 'events' : id;
  document.getElementById(`tab-${tabId}`)?.classList.add('active');
  activeScreen = id;

  // O mês selecionado só vale no ecrã de orçamentos; o resto usa o mês real.
  if (id !== 'budgets') state.viewingMonth = null;

  if (id === 'dashboard')  renderDashboard();
  if (id === 'add')        resetAddForm();
  if (id === 'history')    { reportTab = 'dashboard'; renderHistory(); }
  if (id === 'budgets')    renderCatBudgetList();
  if (id === 'events')     renderEventsScreen();
  if (id === 'event-form') renderEventFormScreen();
  if (id === 'settings')   {
    renderPartnerList();
    renderSheetStatus();
    const vEl = document.getElementById('app-version-label');
    if (vEl) vEl.textContent = `Coinple v${APP_VERSION}`;
  }
}

/* ── Toast ── */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

