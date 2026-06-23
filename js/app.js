/* ── Altura real do viewport ──
   Em PWA standalone no iOS, 100vh/100dvh/100% podem não corresponder à área
   visível, deixando a barra inferior a "flutuar". Medimos com window.innerHeight
   e expomos em --app-h, usado pelo #app. */
function setAppHeight() {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
}
setAppHeight();
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 250));
window.addEventListener('pageshow', setAppHeight);

/* ── State ── */
// Ordem alinhada ao design: 3 cartões grandes (em cima) + 4 pequenos (em baixo)
const DEFAULT_CATEGORIES = [
  { id: 'lazer',        name: 'Lazer',        emoji: '🎉', budget: 300,  color: '#EC4899' },
  { id: 'supermercado', name: 'Supermercado', emoji: '🛒', budget: 1500, color: '#10B981' },
  { id: 'restaurantes', name: 'Restaurantes', emoji: '🍽️', budget: 300,  color: '#F472B6' },
  { id: 'gasolina',     name: 'Gasolina',     emoji: '⛽', budget: 200,  color: '#E0A82E' },
  { id: 'saude',        name: 'Saúde',        emoji: '💊', budget: 150,  color: '#8B5CF6' },
  { id: 'outros',       name: 'Outros',       emoji: '📦', budget: 100,  color: '#6B7280' },
  { id: 'casa',         name: 'Casa',         emoji: '🏠', budget: 1000, color: '#C28E1B' },
];

let state = {
  user: null,                 // { id, email, name, picture }
  demoMode: false,
  coupleId: null,             // Supabase couple UUID
  partners: [],               // [{ id, email, name, photo }] — máx. 2
  categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
  expenses: [],               // { id, amount, description, category, payerEmail, payerName, date, createdAt, eventId? }
  events: [],                 // { id, name, emoji, totalBudget, startDate, endDate, categories, createdAt }
  settings: { apiKey: '' },
  totalBudget: 0,             // orçamento total do mês
  theme: 'dark',
};

/* ── Persistence ── */
function loadState() {
  try {
    const saved = localStorage.getItem('coinple-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      state = {
        ...state,
        ...parsed,
        categories: parsed.categories || JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
        partners:   parsed.partners   || [],
        expenses:   parsed.expenses   || [],
        events:     parsed.events     || [],
        settings:   { apiKey: '', ...(parsed.settings || {}) },
        totalBudget: parsed.totalBudget || 0,
        theme:       parsed.theme       || 'dark',
        coupleId:    parsed.coupleId    || null,
        // compatibilidade: migra spreadsheetId → coupleId
        ...(parsed.spreadsheetId && !parsed.coupleId ? { spreadsheetId: undefined } : {}),
      };
    }
  } catch (e) { /* usa defaults */ }
}

function saveState() {
  localStorage.setItem('coinple-state', JSON.stringify(state));
}

/* ── Helpers ── */
function formatCurrency(amount) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function monthName(monthKey) {
  return MONTH_NAMES[parseInt(monthKey.split('-')[1], 10) - 1] || '';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function eventEmojiFor(expense) {
  if (!expense.eventId) return '';
  return (state.events || []).find(ev => ev.id === expense.eventId)?.emoji || '';
}

function totalAllocated() {
  const catTotal = state.categories.reduce((s, c) => s + (c.budget || 0), 0);
  const mk = currentMonthKey();
  const eventTotal = (state.events || [])
    .filter(ev => ev.startDate.slice(0, 7) <= mk && ev.endDate.slice(0, 7) >= mk)
    .reduce((s, ev) => s + (ev.totalBudget || 0), 0);
  return catTotal + eventTotal;
}

function totalSpentThisMonth(mk) {
  return expensesForMonth(mk).reduce((s, e) => s + (e.amount || 0), 0);
}

function getCategory(id) {
  let cat = state.categories.find(c => c.id === id);
  if (cat) return cat;
  for (const ev of (state.events || [])) {
    cat = (ev.categories || []).find(c => c.id === id);
    if (cat) return cat;
  }
  return state.categories.find(c => c.id === 'outros') || state.categories[0];
}

/* ── Event helpers ── */
function getActiveEvent() {
  const today = todayISO();
  return (state.events || []).find(ev => ev.startDate <= today && ev.endDate >= today) || null;
}

function getEventStatus(ev) {
  const today = todayISO();
  if (ev.startDate <= today && ev.endDate >= today) return 'active';
  if (ev.startDate > today) return 'upcoming';
  return 'past';
}

function spentOnEvent(eventId) {
  return state.expenses
    .filter(e => e.eventId === eventId)
    .reduce((s, e) => s + (e.amount || 0), 0);
}

function spentOnEventCategory(eventId, catId) {
  return state.expenses
    .filter(e => e.eventId === eventId && e.category === catId)
    .reduce((s, e) => s + (e.amount || 0), 0);
}

function expensesForMonth(monthKey) {
  return state.expenses.filter(e => e.date?.slice(0, 7) === monthKey);
}

function spentByCategory(catId, monthKey) {
  return expensesForMonth(monthKey)
    .filter(e => e.category === catId)
    .reduce((s, e) => s + (e.amount || 0), 0);
}

function progressClass(spent, budget) {
  if (!budget) return 'progress-gold';
  const pct = spent / budget;
  if (pct >= 1)    return 'progress-red';
  if (pct >= 0.75) return 'progress-pink';
  return 'progress-gold';
}

function generateId() {
  return (crypto.randomUUID?.()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function groupByMonth(expenses) {
  const groups = {};
  [...expenses].sort((a, b) => b.date.localeCompare(a.date)).forEach(e => {
    const key = e.date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  return groups;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${names[parseInt(m) - 1]} ${y}`;
}

/* ── Partners / avatars ── */
function getPartner(email) {
  return state.partners.find(p => p.email === email);
}

function partnerIndex(email) {
  return state.partners.findIndex(p => p.email === email);
}

function firstName(name) {
  return (name || '').trim().split(' ')[0] || '?';
}

function avatarHtml(email, cls = '') {
  const p = getPartner(email);
  const idx = Math.max(partnerIndex(email), 0);
  const tone = idx === 0 ? 'tone-gold' : 'tone-pink';
  if (p?.photo) {
    return `<img class="avatar ${tone} ${cls}" src="${p.photo}" alt="${firstName(p.name)}" />`;
  }
  const initial = firstName(p?.name || email).charAt(0).toUpperCase() || '💕';
  return `<div class="avatar avatar-fallback ${tone} ${cls}">${initial}</div>`;
}

function payerLabel(e) {
  const p = getPartner(e.payerEmail);
  return firstName(p?.name || e.payerName || e.payerEmail);
}

/* ── Tema ── */
function applyTheme(theme) {
  document.documentElement.classList.toggle('light-theme', theme === 'light');
}

function toggleTheme(isLight) {
  state.theme = isLight ? 'light' : 'dark';
  applyTheme(state.theme);
  saveState();
}

/* ── Views: login / setup / app ── */
function showView(view) {
  document.body.classList.toggle('logged-out', view === 'login');
  document.body.classList.toggle('in-setup', view === 'setup');
  if (view === 'setup') renderSetup();
  if (view === 'app') showScreen('dashboard');
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

  if (id === 'dashboard')  renderDashboard();
  if (id === 'add')        resetAddForm();
  if (id === 'history')    renderHistory();
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
    const couple = await createCouple(state.categories, state.totalBudget);
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
    const { expenses, partners, budgets, totalBudget, events } = await loadCoupleData();
    state.expenses = expenses;
    state.partners = partners;
    state.events   = events;
    if (totalBudget > 0) state.totalBudget = totalBudget;
    state.categories.forEach(c => {
      if (budgets[c.id] !== undefined) c.budget = budgets[c.id];
    });
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

/* ── Dashboard ── */
function renderDashboard() {
  const activeEvent = getActiveEvent();
  renderCoupleCard(activeEvent);
  if (activeEvent) {
    renderEventBudgetOverview(activeEvent);
    renderEventCategoryCards(activeEvent);
  } else {
    renderBudgetOverview(currentMonthKey());
    renderCategoryCards(currentMonthKey());
  }
  renderRecentExpenses(currentMonthKey());

  // Update "Editar orçamentos" link text
  const editLink = document.querySelector('.section-header .section-link[onclick="openBudgetModal()"]');
  if (editLink) editLink.textContent = activeEvent ? 'Ver orçamentos mensais' : 'Editar orçamentos';
}

function renderBudgetOverview(mk) {
  const el = document.getElementById('budget-overview');
  if (!el) return;
  const total = state.totalBudget || totalAllocated();
  const spent = totalSpentThisMonth(mk);
  const remaining = total - spent;
  const pct = total ? Math.min((spent / total) * 100, 100) : 0;

  el.innerHTML = `
    <div class="finance-total">
      <div class="finance-total-amt ${remaining < 0 ? 'neg' : ''}">${formatCurrency(remaining)}</div>
      <div class="finance-total-label">total disponível em ${monthName(mk)}</div>
    </div>
    <div class="finance-progress">
      <div class="finance-progress-fill" style="width:${pct}%"></div>
      <span class="finance-progress-marker" style="left:${pct}%;font-size:${(20 * (1 + pct / 100)).toFixed(1)}px">💸</span>
    </div>`;
}

function renderCoupleCard(activeEvent = null) {
  const photos = document.getElementById('couple-photos');
  const namesEl = document.getElementById('couple-names');
  const subEl = document.getElementById('couple-sub');

  // Title is always "Tranquilidade Financeira"
  const titleEl = document.querySelector('.finance-title');
  if (titleEl) titleEl.textContent = 'Tranquilidade Financeira';

  // Remove any leftover event-mode-bar
  document.getElementById('event-mode-bar')?.remove();

  const ps = state.partners;
  if (ps.length >= 2) {
    photos.innerHTML = `${avatarHtml(ps[0].email, 'avatar-xl')}<span class="couple-heart">💛💗</span>${avatarHtml(ps[1].email, 'avatar-xl')}`;
    namesEl.textContent = `${firstName(ps[0].name)} & ${firstName(ps[1].name)}`;
    subEl.textContent = state.demoMode ? 'Modo demo' : 'Contas juntas 🥰';
  } else if (ps.length === 1) {
    photos.innerHTML = `${avatarHtml(ps[0].email, 'avatar-xl')}<span class="couple-heart">💛💗</span><div class="avatar avatar-fallback avatar-xl tone-pink">?</div>`;
    namesEl.textContent = firstName(ps[0].name);
    subEl.textContent = 'À espera do teu par — partilha o código de convite 💌';
  } else {
    photos.innerHTML = '<img src="assets/coinple-logo.png" alt="Coinple" style="height:44px;width:auto;object-fit:contain">';
    namesEl.textContent = 'Coinple';
    subEl.textContent = '';
  }
}

function renderEventBudgetOverview(ev) {
  const el = document.getElementById('budget-overview');
  if (!el) return;
  const spent = spentOnEvent(ev.id);
  const remaining = ev.totalBudget - spent;
  const pct = ev.totalBudget ? Math.min((spent / ev.totalBudget) * 100, 100) : 0;

  el.innerHTML = `
    <div class="finance-total">
      <div class="finance-total-row">
        <div class="finance-total-amt ${remaining < 0 ? 'neg' : ''}">${formatCurrency(remaining)}</div>
        <button class="event-badge-btn" onclick="openEventDetail('${ev.id}')" title="Ver ${ev.name}">${ev.emoji}</button>
      </div>
      <div class="finance-total-label">total disponível em "${ev.name}"</div>
    </div>
    <div class="finance-progress">
      <div class="finance-progress-fill" style="width:${pct}%"></div>
      <span class="finance-progress-marker" style="left:${pct}%;font-size:${(20 * (1 + pct / 100)).toFixed(1)}px">💸</span>
    </div>`;
}

function renderEventCategoryCards(ev) {
  const grid = document.getElementById('categories-grid');
  const cats = ev.categories || [];
  if (!cats.length) { grid.innerHTML = ''; return; }

  const card = (cat, isBig) => {
    const spent  = spentOnEventCategory(ev.id, cat.id);
    const budget = cat.budget || 0;
    const avail  = budget - spent;
    const pct    = budget ? Math.min((spent / budget) * 100, 100) : 0;
    const tint   = `color-mix(in srgb, ${cat.color || '#EC4899'} 16%, #fff)`;
    const bar    = `<div class="cat-progress"><div class="cat-progress-fill" style="width:${pct}%"></div></div>`;
    if (isBig) {
      return `
        <div class="cat-card big" style="background:${tint}"
             onclick="openAddWithCategory('${cat.id}')" title="${cat.name}">
          <div class="cat-icon-wrap">${cat.emoji}</div>
          <div class="cat-avail ${avail < 0 ? 'neg' : ''}">${formatCurrency(avail)}</div>
          <div class="cat-avail-label">disponível</div>
          ${bar}
          <div class="cat-budget-line">de ${formatCurrency(budget)}</div>
        </div>`;
    }
    return `
      <div class="cat-card small" style="background:${tint}"
           onclick="openAddWithCategory('${cat.id}')" title="${cat.name}">
        <div class="cat-icon-wrap">${cat.emoji}</div>
        ${bar}
        <div class="cat-avail ${avail < 0 ? 'neg' : ''}">${formatCurrency(avail)}</div>
      </div>`;
  };

  const big   = cats.slice(0, 3);
  const small = cats.slice(3);
  grid.innerHTML = `
    <div class="cat-row-big">${big.map(c => card(c, true)).join('')}</div>
    ${small.length ? `<div class="cat-row-small">${small.map(c => card(c, false)).join('')}</div>` : ''}`;
}

function renderCategoryCards(mk) {
  const grid = document.getElementById('categories-grid');
  const cats = state.categories;
  const big = cats.slice(0, 3);
  const small = cats.slice(3);

  const card = (cat, isBig) => {
    const spent  = spentByCategory(cat.id, mk);
    const budget = cat.budget || 0;
    const avail  = budget - spent;
    const pct    = budget ? Math.min((spent / budget) * 100, 100) : 0;
    const tint   = `color-mix(in srgb, ${cat.color} 16%, #fff)`;
    const bar    = `<div class="cat-progress"><div class="cat-progress-fill" style="width:${pct}%"></div></div>`;
    if (isBig) {
      return `
      <div class="cat-card big" style="background:${tint}"
           onclick="filterHistoryByCat('${cat.id}')" title="${cat.name}">
        <div class="cat-icon-wrap">${cat.emoji}</div>
        <div class="cat-avail ${avail < 0 ? 'neg' : ''}">${formatCurrency(avail)}</div>
        <div class="cat-avail-label">disponível</div>
        ${bar}
        <div class="cat-budget-line">de ${formatCurrency(budget)}</div>
      </div>`;
    }
    return `
      <div class="cat-card small" style="background:${tint}"
           onclick="filterHistoryByCat('${cat.id}')" title="${cat.name}">
        <div class="cat-icon-wrap">${cat.emoji}</div>
        ${bar}
        <div class="cat-avail ${avail < 0 ? 'neg' : ''}">${formatCurrency(avail)}</div>
      </div>`;
  };

  grid.innerHTML = `
    <div class="cat-row-big">${big.map(c => card(c, true)).join('')}</div>
    <div class="cat-row-small">${small.map(c => card(c, false)).join('')}</div>`;
}

function openAddWithCategory(catId) {
  showScreen('add');
  addFormState.selectedCategory = catId;
  renderCategoryPills();
}

function renderRecentExpenses(mk) {
  const recent = expensesForMonth(mk)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  const list = document.getElementById('recent-expenses');
  if (!recent.length) {
    list.innerHTML = '<p class="text-muted" style="font-size:13px;padding:8px 0">Nenhuma despesa este mês. 💸</p>';
    return;
  }

  list.innerHTML = recent.map(e => {
    const cat = getCategory(e.category);
    const evEmoji = eventEmojiFor(e);
    return `
      <div class="expense-item" onclick="openExpenseDetail('${e.id}')">
        <div class="expense-icon" style="background:${cat.color}22">${cat.emoji}</div>
        <div class="expense-info">
          <div class="expense-desc">
            <span>${e.description || cat.name}</span>
            ${evEmoji ? `<span class="expense-event-tag">${evEmoji}</span>` : ''}
          </div>
          <div class="expense-meta">
            ${avatarHtml(e.payerEmail, 'avatar-xs')}
            <span>${formatDate(e.date)}${formatTime(e.createdAt) ? ' · ' + formatTime(e.createdAt) : ''}</span>
          </div>
        </div>
        <div class="expense-amount">${formatCurrency(e.amount)}</div>
      </div>`;
  }).join('');
}

/* ── Add Expense ── */
let addFormState = {
  payerEmail: null,
  selectedCategory: null,
  scope: 'month',
  receiptBase64: null,
  receiptMediaType: null,
};

function resetAddForm() {
  addFormState = {
    payerEmail: state.user?.email || state.partners[0]?.email || null,
    selectedCategory: null,
    scope: getActiveEvent() ? 'event' : 'month',
    receiptBase64: null,
    receiptMediaType: null,
  };

  document.getElementById('expense-amount').value   = '';
  document.getElementById('expense-desc').value     = '';
  document.getElementById('expense-date').value     = todayISO();

  const btn = document.getElementById('btn-submit-expense');
  btn.textContent = 'Guardar Despesa';
  btn.onclick = submitExpense;

  renderPersonButtons();
  renderCategoryPills();
}

function renderPersonButtons() {
  const container = document.getElementById('person-selector');
  if (!state.partners.length) {
    container.innerHTML = '<p class="text-muted" style="font-size:13px">Liga a conta do casal nas definições 💌</p>';
    return;
  }
  container.innerHTML = state.partners.map(p => `
    <button class="person-btn ${addFormState.payerEmail === p.email ? 'selected' : ''}"
            onclick="selectPerson('${p.email}')">
      ${avatarHtml(p.email, 'avatar-sm')}
      <span>${firstName(p.name)}</span>
    </button>`).join('');
}

function renderCategoryPills() {
  const scopeTabsEl = document.getElementById('expense-scope-tabs');
  const container   = document.getElementById('category-pills');
  const activeEvent = getActiveEvent();

  if (activeEvent && scopeTabsEl) {
    scopeTabsEl.style.display = 'flex';
    scopeTabsEl.innerHTML = `
      <button class="scope-tab ${addFormState.scope === 'month' ? 'active' : ''}"
              onclick="selectExpenseScope('month')">📅 Mês</button>
      <button class="scope-tab ${addFormState.scope === 'event' ? 'active' : ''}"
              onclick="selectExpenseScope('event')">${activeEvent.emoji} ${activeEvent.name}</button>`;
  } else {
    if (scopeTabsEl) scopeTabsEl.style.display = 'none';
    addFormState.scope = 'month';
  }

  const useEvent = activeEvent && addFormState.scope === 'event';
  const cats = useEvent ? (activeEvent.categories || []) : state.categories;

  container.innerHTML = `<div class="cat-grid">${cats.map(cat => `
    <button class="cat-grid-item ${addFormState.selectedCategory === cat.id ? 'selected' : ''}"
            onclick="selectCategory('${cat.id}')">
      <span class="cat-grid-emoji">${cat.emoji}</span>
      <span class="cat-grid-name">${cat.name}</span>
    </button>`).join('')}</div>`;
}

function selectExpenseScope(scope) {
  addFormState.scope = scope;
  addFormState.selectedCategory = null;
  renderCategoryPills();
}

function selectPerson(email) {
  addFormState.payerEmail = email;
  renderPersonButtons();
}

function selectCategory(id) {
  addFormState.selectedCategory = id;
  renderCategoryPills();
}

async function handleReceiptUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    const base64  = dataUrl.split(',')[1];
    const media   = file.type || 'image/jpeg';

    addFormState.receiptBase64    = base64;
    addFormState.receiptMediaType = media;

    const preview = document.getElementById('receipt-preview');
    preview.src = dataUrl;
    preview.style.display = 'block';
    document.getElementById('upload-placeholder').style.display = 'none';

    const apiKey = state.settings.apiKey;
    if (!apiKey) {
      showToast('Adiciona a API Key nas definições para análise automática');
      return;
    }

    document.getElementById('ai-analyzing').classList.add('visible');
    try {
      const result = await analyzeReceipt(base64, media, apiKey, state.categories);

      document.getElementById('expense-amount').value = result.amount ? result.amount.toFixed(2) : '';
      document.getElementById('expense-desc').value   = result.establishment || '';
      if (result.date) document.getElementById('expense-date').value = result.date;

      if (result.suggestedCategory) {
        const cat = state.categories.find(c =>
          c.name.toLowerCase() === result.suggestedCategory.toLowerCase());
        if (cat) {
          addFormState.selectedCategory = cat.id;
          renderCategoryPills();
        }
      }

      const suggestion = document.getElementById('ai-suggestion');
      suggestion.classList.add('visible');
      document.getElementById('ai-suggestion-text').textContent =
        `${result.establishment || 'Despesa'} · ${formatCurrency(result.amount || 0)} · ${formatDate(result.date || todayISO())}`;

    } catch (err) {
      showToast(`Erro IA: ${err.message}`);
    } finally {
      document.getElementById('ai-analyzing').classList.remove('visible');
    }
  };
  reader.readAsDataURL(file);
}

function readExpenseForm() {
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const desc   = document.getElementById('expense-desc').value.trim();
  const date   = document.getElementById('expense-date').value;

  if (!amount || amount <= 0)         { showToast('Insere um valor válido'); return null; }
  if (!date)                          { showToast('Insere uma data'); return null; }
  if (!addFormState.selectedCategory) { showToast('Seleciona uma categoria'); return null; }
  if (!addFormState.payerEmail)       { showToast('Seleciona quem pagou'); return null; }

  return { amount, desc, date };
}

function submitExpense() {
  const form = readExpenseForm();
  if (!form) return;

  const activeEvent = getActiveEvent();
  const payer = getPartner(addFormState.payerEmail);
  const tagEvent = activeEvent && addFormState.scope === 'event';
  const expense = {
    id:          generateId(),
    amount:      form.amount,
    description: form.desc || getCategory(addFormState.selectedCategory).name,
    category:    addFormState.selectedCategory,
    payerEmail:  addFormState.payerEmail,
    payerName:   payer?.name || '',
    date:        form.date,
    createdAt:   Date.now(),
    ...(tagEvent ? { eventId: activeEvent.id } : {}),
  };

  state.expenses.push(expense);
  saveState();

  if (!state.demoMode && state.coupleId) {
    appendExpenseToDb(state.coupleId, expense, payer?.id || null)
      .catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
  }

  showToast('Despesa guardada! 💛');
  showScreen('dashboard');
}

/* ── History ── */
let historyFilters = { category: 'all', person: 'all' };

function filterHistoryByCat(catId) {
  historyFilters.category = catId;
  showScreen('history');
}

function renderHistory() {
  renderFilterBar();

  let filtered = [...state.expenses];
  if (historyFilters.category !== 'all') filtered = filtered.filter(e => e.category === historyFilters.category);
  if (historyFilters.person   !== 'all') filtered = filtered.filter(e => e.payerEmail === historyFilters.person);

  const container = document.getElementById('history-list');

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💸</div>
        <h3>Sem despesas</h3>
        <p>Nenhuma despesa encontrada.</p>
      </div>`;
    return;
  }

  const groups = groupByMonth(filtered);
  container.innerHTML = Object.entries(groups).map(([mk, exps]) => `
    <div class="month-group">
      <div class="month-label">${monthLabel(mk)}</div>
      ${exps.map(e => {
        const cat = getCategory(e.category);
        const evEmoji = eventEmojiFor(e);
        return `
          <div class="history-item" onclick="openExpenseDetail('${e.id}')">
            <div class="expense-icon" style="background:${cat.color}22">${cat.emoji}</div>
            <div class="history-info">
              <div class="history-desc">
                <span>${e.description}</span>
                ${evEmoji ? `<span class="expense-event-tag">${evEmoji}</span>` : ''}
              </div>
              <div class="history-meta">
                ${avatarHtml(e.payerEmail, 'avatar-xs')}
                <span class="history-cat">${cat.name}</span>
              </div>
            </div>
            <div class="history-right">
              <div class="history-amount">${formatCurrency(e.amount)}</div>
              <div class="history-date">${formatDate(e.date)}${formatTime(e.createdAt) ? ' · ' + formatTime(e.createdAt) : ''}</div>
            </div>
          </div>`;
      }).join('')}
    </div>`).join('');
}

function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  const personChips = [
    `<button class="filter-chip ${historyFilters.person === 'all' ? 'active' : ''}" onclick="setHistoryFilter('person','all')">Todos</button>`,
    ...state.partners.map(p => `
      <button class="filter-chip ${historyFilters.person === p.email ? 'active' : ''}"
              onclick="setHistoryFilter('person','${p.email}')">${firstName(p.name)}</button>`),
  ].join('');
  const allCatChip = `<button class="filter-chip ${historyFilters.category === 'all' ? 'active' : ''}" onclick="setHistoryFilter('category','all')">Todas</button>`;
  const catChips = state.categories.map(c => `
    <button class="filter-chip ${historyFilters.category === c.id ? 'active' : ''}" onclick="setHistoryFilter('category','${c.id}')">${c.emoji} ${c.name}</button>
  `).join('');

  bar.innerHTML = personChips + allCatChip + catChips;
}

function setHistoryFilter(key, value) {
  historyFilters[key] = value;
  renderHistory();
}

/* ── Expense Detail Modal ── */
function openExpenseDetail(id) {
  const expense = state.expenses.find(e => e.id === id);
  if (!expense) return;

  const cat = getCategory(expense.category);

  document.getElementById('detail-title').textContent  = expense.description;
  document.getElementById('detail-amount').textContent = formatCurrency(expense.amount);
  document.getElementById('detail-cat').textContent    = `${cat.emoji} ${cat.name}`;
  document.getElementById('detail-person').innerHTML   =
    `${avatarHtml(expense.payerEmail, 'avatar-xs')} ${payerLabel(expense)}`;
  document.getElementById('detail-date').textContent   = formatDate(expense.date);

  document.getElementById('btn-delete-expense').onclick = () => deleteExpense(id);
  document.getElementById('btn-edit-expense').onclick   = () => editExpense(id);

  openModal('modal-expense-detail');
}

function deleteExpense(id) {
  if (!confirm('Eliminar esta despesa?')) return;
  state.expenses = state.expenses.filter(e => e.id !== id);
  saveState();
  if (!state.demoMode && state.coupleId) {
    deleteExpenseFromDb(id).catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
  }
  closeModal('modal-expense-detail');
  showToast('Despesa eliminada');
  if (activeScreen === 'dashboard') renderDashboard();
  if (activeScreen === 'history')   renderHistory();
}

function editExpense(id) {
  const expense = state.expenses.find(e => e.id === id);
  if (!expense) return;
  closeModal('modal-expense-detail');

  showScreen('add');
  addFormState.payerEmail       = expense.payerEmail;
  addFormState.selectedCategory = expense.category;
  addFormState.scope            = expense.eventId ? 'event' : 'month';

  document.getElementById('expense-amount').value = expense.amount.toFixed(2);
  document.getElementById('expense-desc').value   = expense.description;
  document.getElementById('expense-date').value   = expense.date;
  renderPersonButtons();
  renderCategoryPills();

  const btn = document.getElementById('btn-submit-expense');
  btn.textContent = 'Atualizar Despesa';
  btn.onclick = () => {
    const form = readExpenseForm();
    if (!form) return;
    const activeEvent = getActiveEvent();
    const tagEvent    = activeEvent && addFormState.scope === 'event';
    const payer = getPartner(addFormState.payerEmail);
    expense.amount      = form.amount;
    expense.description = form.desc || getCategory(addFormState.selectedCategory).name;
    expense.category    = addFormState.selectedCategory;
    expense.payerEmail  = addFormState.payerEmail;
    expense.payerName   = payer?.name || '';
    expense.date        = form.date;
    expense.eventId     = tagEvent ? activeEvent.id : undefined;
    saveState();
    if (!state.demoMode && state.coupleId) {
      updateExpenseInDb(expense, payer?.id || null, state.coupleId)
        .catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
    }
    showToast('Despesa atualizada! 💛');
    showScreen('dashboard');
  };
}

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

/* ── Events ── */
const EVENT_EMOJIS = [
  '🎉','✈️','🏖️','🏕️','🎂','🏠','🌍','🎪','🎭','🏆',
  '🍾','💒','🎓','🎵','🎸','🎮','📚','🌸','🎯','🏄',
  '🎿','🚴','🏋️','🌮','🍕','🍣','🚀','⭐','💎','🌴',
  '🏔️','🎨','🦁','🎃','🎄',
];

function renderEventsScreen() {
  const events = state.events || [];
  const today  = todayISO();
  const active   = events.filter(ev => ev.startDate <= today && ev.endDate >= today);
  const upcoming = events.filter(ev => ev.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past     = events.filter(ev => ev.endDate < today).sort((a, b) => b.endDate.localeCompare(a.endDate));

  const container = document.getElementById('events-list-content');

  const newEventBtn = `<button class="btn btn-primary btn-new-event-bottom" onclick="openEventForm()">+ Novo Evento</button>`;

  if (!events.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎉</div>
        <h3>Sem eventos</h3>
        <p>Cria um evento para gerir um orçamento especial — viagem, festa, aniversário…</p>
        ${newEventBtn}
      </div>`;
    return;
  }

  const eventCard = (ev) => {
    const status = getEventStatus(ev);
    const spent  = spentOnEvent(ev.id);
    const labels = { active: 'Ativo agora', upcoming: 'Próximo', past: 'Passado' };
    return `
      <div class="event-card ${status === 'active' ? 'is-active' : ''}" onclick="openEventDetail('${ev.id}')">
        <div class="event-emoji-large">${ev.emoji || '🎉'}</div>
        <div class="event-info">
          <div class="event-name">${ev.name}</div>
          <div class="event-dates">${formatDate(ev.startDate)} — ${formatDate(ev.endDate)}</div>
          <div class="event-spent">${formatCurrency(spent)} de ${formatCurrency(ev.totalBudget)}</div>
        </div>
        <span class="event-status-badge ${status}">${labels[status]}</span>
      </div>`;
  };

  // Group past events by month (most recent first)
  const pastByMonth = {};
  past.forEach(ev => {
    const mk = ev.endDate.slice(0, 7);
    if (!pastByMonth[mk]) pastByMonth[mk] = [];
    pastByMonth[mk].push(ev);
  });
  const pastMonthKeys = Object.keys(pastByMonth).sort().reverse();

  let html = '';
  if (active.length)   html += `<div class="events-section-label">Ativo agora</div>` + active.map(eventCard).join('');
  if (upcoming.length) html += `<div class="events-section-label">Próximos</div>` + upcoming.map(eventCard).join('');
  if (pastMonthKeys.length) {
    html += `<div class="events-section-label">Passados</div>`;
    pastMonthKeys.forEach(mk => {
      const [y, m] = mk.split('-');
      const label  = new Date(+y, +m - 1, 1).toLocaleString('pt-PT', { month: 'long', year: 'numeric' });
      html += `<div class="events-month-label">${label}</div>`;
      html += pastByMonth[mk].map(eventCard).join('');
    });
  }

  html += newEventBtn;
  container.innerHTML = html;
}

/* ── Event form screen ── */
/* ── Drag-to-reorder utility (Pointer Events, works mouse + touch) ── */
function setupSortable(listEl, onReorder) {
  if (!listEl) return;
  let dragRow = null;
  let placeholder = null;
  let pid = null;

  function getRows() {
    return Array.from(listEl.querySelectorAll('[data-sort-idx]'));
  }

  listEl.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      const row = handle.closest('[data-sort-idx]');
      if (!row) return;
      handle.setPointerCapture(e.pointerId);
      pid = e.pointerId;
      dragRow = row;

      placeholder = document.createElement('div');
      placeholder.className = 'drag-placeholder';
      placeholder.style.height = row.offsetHeight + 'px';
      row.after(placeholder);
      row.classList.add('dragging-row');
    });

    handle.addEventListener('pointermove', e => {
      if (!dragRow || e.pointerId !== pid) return;
      const y = e.clientY;
      const others = getRows().filter(r => r !== dragRow);
      let inserted = false;
      for (const r of others) {
        const rect = r.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          listEl.insertBefore(placeholder, r);
          inserted = true;
          break;
        }
      }
      if (!inserted && placeholder.parentNode === listEl) {
        listEl.appendChild(placeholder);
      }
    });

    handle.addEventListener('pointerup', e => {
      if (!dragRow || e.pointerId !== pid) return;
      listEl.insertBefore(dragRow, placeholder);
      placeholder.remove();
      placeholder = null;
      dragRow.classList.remove('dragging-row');
      const newOrder = getRows().map(r => parseInt(r.dataset.sortIdx));
      dragRow = null;
      pid = null;
      onReorder(newOrder);
    });

    handle.addEventListener('pointercancel', e => {
      if (!dragRow || e.pointerId !== pid) return;
      placeholder?.remove();
      dragRow.classList.remove('dragging-row');
      dragRow = null;
      placeholder = null;
      pid = null;
    });
  });
}

let eventFormState = { editingId: null, selectedEmoji: '🎉', totalBudget: 0, categories: [] };

function openEventForm(eventId = null) {
  const ev = eventId ? (state.events || []).find(e => e.id === eventId) : null;
  eventFormState.editingId    = eventId;
  eventFormState.selectedEmoji = ev?.emoji || '🎉';
  eventFormState.totalBudget   = ev?.totalBudget || 0;
  eventFormState.categories    = JSON.parse(JSON.stringify(
    ev ? (ev.categories || []) : DEFAULT_CATEGORIES
  ));
  showScreen('event-form');
}

function renderEventFormScreen() {
  const ev = eventFormState.editingId ? (state.events || []).find(e => e.id === eventFormState.editingId) : null;

  document.getElementById('event-form-screen-title').textContent = ev ? 'Editar Evento' : 'Novo Evento';
  document.getElementById('event-name').value   = ev?.name      || '';
  document.getElementById('event-budget').value = eventFormState.totalBudget || '';
  document.getElementById('event-start').value  = ev?.startDate || todayISO();
  document.getElementById('event-end').value    = ev?.endDate   || '';
  document.getElementById('btn-save-event').textContent = ev ? 'Guardar' : 'Criar Evento';

  const emojiBtn = document.getElementById('event-emoji-btn');
  if (emojiBtn) emojiBtn.textContent = eventFormState.selectedEmoji || '🎉';
  renderEventCategoryEditor();
  renderEventBudgetAllocStatus();
}

/* ── Emoji popup (shared for event + category emoji pickers) ── */
let _emojiPopupCb = null;

function openEmojiPopup(anchorEl, currentEmoji, onSelect) {
  document.getElementById('emoji-popup')?.remove();
  _emojiPopupCb = onSelect;

  const popup = document.createElement('div');
  popup.id = 'emoji-popup';
  popup.className = 'emoji-popup';
  popup.innerHTML = EVENT_EMOJIS.map(e => `
    <button class="emoji-option ${e === currentEmoji ? 'selected' : ''}"
            onclick="pickFromPopup('${e}')" type="button">${e}</button>`).join('');
  document.body.appendChild(popup);

  const rect = anchorEl.getBoundingClientRect();
  const pw = 244;
  let left = rect.left;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  left = Math.max(8, left);
  let top = rect.bottom + 4;
  if (top + 210 > window.innerHeight) top = rect.top - 214;
  popup.style.left = left + 'px';
  popup.style.top  = top  + 'px';

  setTimeout(() => document.addEventListener('click', closeEmojiPopup, { once: true }), 0);
}

function pickFromPopup(emoji) {
  const cb = _emojiPopupCb;
  closeEmojiPopup();
  if (cb) cb(emoji);
}

function closeEmojiPopup() {
  document.getElementById('emoji-popup')?.remove();
  _emojiPopupCb = null;
}

function openEventEmojiPicker(anchorEl) {
  openEmojiPopup(anchorEl, eventFormState.selectedEmoji, emoji => {
    eventFormState.selectedEmoji = emoji;
    const btn = document.getElementById('event-emoji-btn');
    if (btn) btn.textContent = emoji;
  });
}

function openEventCatEmojiPicker(idx, anchorEl) {
  const cat = eventFormState.categories[idx];
  openEmojiPopup(anchorEl, cat?.emoji || '📦', emoji => {
    updateEventCatField(idx, 'emoji', emoji);
    anchorEl.textContent = emoji;
  });
}

function openBudgetCatEmojiPicker(catId, anchorEl) {
  const cat = state.categories.find(c => c.id === catId);
  openEmojiPopup(anchorEl, cat?.emoji || '📦', emoji => {
    if (cat) cat.emoji = emoji;
    anchorEl.textContent = emoji;
  });
}

function renderEventCategoryEditor() {
  const list = document.getElementById('event-categories-list');
  if (!list) return;
  list.innerHTML = eventFormState.categories.map((cat, i) => `
    <div class="event-cat-row" data-sort-idx="${i}">
      <div class="drag-handle" title="Arrastar">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
        </svg>
      </div>
      <button class="cat-emoji-btn" onclick="openEventCatEmojiPicker(${i},this)" type="button">${cat.emoji || '📦'}</button>
      <input class="event-cat-name-input" type="text" value="${cat.name || ''}"
             placeholder="Nome"
             oninput="updateEventCatField(${i},'name',this.value)" />
      <input class="event-cat-budget-input" type="number" value="${cat.budget || ''}"
             placeholder="€" min="0" step="10" inputmode="decimal"
             oninput="updateEventCatBudget(${i},this.value)" />
      <button class="event-cat-remove" onclick="removeEventCategory(${i})" type="button">✕</button>
    </div>`).join('');

  setupSortable(list, newOrder => {
    const old = [...eventFormState.categories];
    eventFormState.categories = newOrder.map(i => old[i]);
    renderEventCategoryEditor();
    renderEventBudgetAllocStatus();
  });
}

function updateEventCatField(idx, field, value) {
  if (eventFormState.categories[idx]) eventFormState.categories[idx][field] = value;
}

function updateEventCatBudget(idx, value) {
  if (eventFormState.categories[idx]) {
    eventFormState.categories[idx].budget = parseFloat(value) || 0;
    renderEventBudgetAllocStatus();
  }
}

function onEventBudgetInput(value) {
  eventFormState.totalBudget = parseFloat(value) || 0;
  renderEventBudgetAllocStatus();
}

function renderEventBudgetAllocStatus() {
  const el = document.getElementById('event-budget-alloc-status');
  if (!el) return;
  const total = eventFormState.totalBudget || 0;
  if (!total) { el.innerHTML = ''; return; }

  const allocated = eventFormState.categories.reduce((s, c) => s + (c.budget || 0), 0);
  const remaining = total - allocated;
  const pct    = Math.min((allocated / total) * 100, 100);
  const barCls = remaining < 0 ? 'progress-red' : remaining / total < 0.25 ? 'progress-pink' : 'progress-gold';
  const valCls = remaining < 0 ? 'over' : remaining / total < 0.1 ? 'warn' : 'ok';

  el.innerHTML = `
    <div class="budget-alloc-box" style="margin-bottom:12px">
      <div class="budget-alloc-top">
        <span class="budget-alloc-label">Distribuído</span>
        <span class="budget-alloc-value ${valCls}">${formatCurrency(allocated)} de ${formatCurrency(total)}</span>
      </div>
      <div class="progress-bar" style="margin-bottom:6px">
        <div class="progress-fill ${barCls}" style="width:${pct}%"></div>
      </div>
      <div style="font-size:12px;color:var(--text-muted)">
        ${remaining >= 0
          ? `Por distribuir: <b style="color:var(--gold-dark)">${formatCurrency(remaining)}</b>`
          : `<span style="color:var(--danger)">⚠️ Excede em ${formatCurrency(-remaining)}</span>`}
      </div>
    </div>`;
}

function removeEventCategory(idx) {
  eventFormState.categories.splice(idx, 1);
  renderEventCategoryEditor();
  renderEventBudgetAllocStatus();
}

function addEventCategory() {
  eventFormState.categories.push({ id: 'ecat_' + generateId().slice(0, 8), name: '', emoji: '📦', color: '#6B7280', budget: 0 });
  renderEventCategoryEditor();
}

function saveEvent() {
  const name        = document.getElementById('event-name').value.trim();
  const emoji       = eventFormState.selectedEmoji || '🎉';
  const totalBudget = parseFloat(document.getElementById('event-budget').value) || 0;
  const startDate   = document.getElementById('event-start').value;
  const endDate     = document.getElementById('event-end').value;

  if (!name)                  { showToast('Dá um nome ao evento'); return; }
  if (!startDate || !endDate) { showToast('Seleciona as datas do evento'); return; }
  if (startDate > endDate)    { showToast('O início deve ser antes do fim'); return; }

  const validCats = eventFormState.categories.filter(c => (c.name || '').trim());
  if (!state.events) state.events = [];

  let savedId;
  if (eventFormState.editingId) {
    const idx = state.events.findIndex(e => e.id === eventFormState.editingId);
    if (idx >= 0) {
      state.events[idx] = { ...state.events[idx], name, emoji, totalBudget, startDate, endDate, categories: validCats };
      savedId = state.events[idx].id;
    }
    showToast('Evento atualizado! 🎉');
  } else {
    savedId = generateId();
    state.events.push({ id: savedId, name, emoji, totalBudget, startDate, endDate, categories: validCats, createdAt: Date.now() });
    showToast('Evento criado! 🎉');
  }

  saveState();

  if (!state.demoMode && state.coupleId && savedId) {
    const ev = state.events.find(e => e.id === savedId);
    if (ev) saveEventToDb(state.coupleId, ev).catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
  }

  showScreen('events');
  if (activeScreen === 'dashboard') renderDashboard();
}

function deleteEvent(eventId) {
  if (!confirm('Eliminar este evento?')) return;
  state.events = (state.events || []).filter(e => e.id !== eventId);
  saveState();

  if (!state.demoMode && state.coupleId) {
    deleteEventFromDb(eventId).catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
  }

  closeModal('modal-event-detail');
  renderEventsScreen();
  renderDashboard();
  showToast('Evento eliminado');
}

function openEventDetail(eventId) {
  const ev = (state.events || []).find(e => e.id === eventId);
  if (!ev) return;

  const spent     = spentOnEvent(ev.id);
  const remaining = ev.totalBudget - spent;
  const pct       = ev.totalBudget ? Math.min((spent / ev.totalBudget) * 100, 100) : 0;

  document.getElementById('event-detail-emoji').textContent = ev.emoji || '🎉';
  document.getElementById('event-detail-name').textContent  = ev.name;
  document.getElementById('event-detail-dates').textContent = `${formatDate(ev.startDate)} — ${formatDate(ev.endDate)}`;

  document.getElementById('event-detail-budget').innerHTML = `
    <div class="event-budget-amount ${remaining < 0 ? 'neg' : ''}">${formatCurrency(remaining)}</div>
    <div class="event-budget-label">disponível de ${formatCurrency(ev.totalBudget)}</div>
    <div class="finance-progress" style="margin-top:10px">
      <div class="finance-progress-fill" style="width:${pct}%"></div>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:6px">Gasto total: ${formatCurrency(spent)}</div>`;

  const catsEl = document.getElementById('event-detail-cats');
  catsEl.innerHTML = (ev.categories || []).map(cat => {
    const catSpent = spentOnEventCategory(ev.id, cat.id);
    return `
      <div class="cat-edit-item">
        <span class="cat-edit-emoji">${cat.emoji}</span>
        <span class="cat-edit-name">${cat.name}</span>
        <span style="font-weight:600;font-size:14px;color:var(--text)">${formatCurrency(catSpent)}</span>
      </div>`;
  }).join('');

  document.getElementById('btn-edit-event').onclick   = () => { closeModal('modal-event-detail'); openEventForm(ev.id); };
  document.getElementById('btn-delete-event').onclick = () => deleteEvent(ev.id);

  openModal('modal-event-detail');
}

/* ── Settings / Budgets (páginas) ── */
function openSettings() {
  showScreen('settings');
}

function openBudgetModal() {
  showScreen('budgets');
}

function renderPartnerList() {
  const list = document.getElementById('partner-list');
  if (!state.partners.length) {
    list.innerHTML = '<p class="text-muted" style="font-size:13px">Ainda sem casal ligado.</p>';
    return;
  }
  list.innerHTML = state.partners.map(p => `
    <div class="partner-row">
      <button class="partner-photo-btn" onclick="pickPartnerPhoto('${p.email}')" title="Mudar fotinho">
        ${avatarHtml(p.email, 'avatar-md')}
        <span class="partner-photo-badge">📷</span>
      </button>
      <div class="partner-info">
        <input type="text" class="partner-name-input" value="${p.name.replace(/"/g, '&quot;')}"
               data-email="${p.email}" placeholder="Nome" />
        <div class="partner-email">${p.email}</div>
      </div>
    </div>`).join('');
}

function renderSheetStatus() {
  const el = document.getElementById('sheet-status');
  if (!el) return;
  if (state.demoMode) {
    el.innerHTML = 'Modo demo — sem conta partilhada. Entra com Google para juntar as contas. 💛';
  } else if (state.coupleId) {
    const code = document.getElementById('share-link')?.value || '';
    el.innerHTML = `✅ Conta do casal ligada${code ? ` · Código: <b>${code}</b>` : ''} 🥰`;
  } else {
    el.innerHTML = 'Sem conta partilhada ligada.';
  }
}

const DRAG_HANDLE_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
  <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
  <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
  <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
</svg>`;

function renderCatBudgetList() {
  const total = state.totalBudget || 0;
  const list = document.getElementById('cat-budget-list');
  list.innerHTML = `
    <div class="cat-edit-item" style="border-bottom:1.5px solid var(--gold);padding-bottom:14px;margin-bottom:4px">
      <span class="cat-edit-emoji">💰</span>
      <span class="cat-edit-name" style="font-weight:700">Total do mês</span>
      <input class="cat-edit-budget" type="number" min="0" step="50"
             id="set-total-budget" value="${total}"
             oninput="onTotalBudgetInput(this.value)" />
    </div>
    <div id="budget-alloc-status"></div>
    <div id="cat-sortable-list">
      ${state.categories.map((cat, i) => `
        <div class="cat-edit-item" data-sort-idx="${i}" data-cat-id="${cat.id}">
          <div class="drag-handle" title="Arrastar">${DRAG_HANDLE_SVG}</div>
          <button class="cat-emoji-btn" onclick="openBudgetCatEmojiPicker('${cat.id}',this)" type="button">${cat.emoji}</button>
          <input class="cat-name-editable" type="text" value="${cat.name || ''}" placeholder="Nome"
                 oninput="updateBudgetCatName('${cat.id}',this.value)" />
          <input class="cat-edit-budget" type="number" min="0" step="10"
                 value="${cat.budget || 0}" data-cat="${cat.id}"
                 oninput="updateCatBudget('${cat.id}', this.value)" />
          <button class="event-cat-remove" onclick="removeBudgetCategory('${cat.id}')" type="button">✕</button>
        </div>`).join('')}
    </div>
    <button class="btn btn-secondary btn-sm" onclick="addBudgetCategory()"
            style="margin-top:10px;width:100%">+ Adicionar categoria</button>`;

  renderBudgetAllocStatus();

  const sortableEl = document.getElementById('cat-sortable-list');
  setupSortable(sortableEl, newOrder => {
    const old = [...state.categories];
    state.categories = newOrder.map(i => old[i]);
    saveState();
    renderCatBudgetList();
  });

  // Show events overlapping the current month
  const mk = currentMonthKey();
  const monthEvents = (state.events || []).filter(ev =>
    ev.startDate.slice(0, 7) <= mk && ev.endDate.slice(0, 7) >= mk
  );
  if (monthEvents.length) {
    list.innerHTML += `
      <div style="margin-top:18px;margin-bottom:8px;font-size:12px;font-weight:700;
                  color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px">
        Eventos do mês
      </div>
      ${monthEvents.map(ev => {
        const spent = spentOnEvent(ev.id);
        const pct   = ev.totalBudget ? Math.min((spent / ev.totalBudget) * 100, 100) : 0;
        const cls   = spent > ev.totalBudget ? 'progress-red' : spent / (ev.totalBudget || 1) > 0.75 ? 'progress-pink' : 'progress-gold';
        return `
          <div class="cat-edit-item" onclick="openEventDetail('${ev.id}')"
               style="cursor:pointer;flex-direction:column;align-items:stretch;gap:6px">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="cat-edit-emoji">${ev.emoji}</span>
              <span class="cat-edit-name">${ev.name}</span>
              <span style="font-size:13px;font-weight:600;color:var(--rose);margin-left:auto">
                ${formatCurrency(spent)} / ${formatCurrency(ev.totalBudget)}
              </span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${cls}" style="width:${pct}%"></div>
            </div>
          </div>`;
      }).join('')}`;
  }
}

function renderBudgetAllocStatus() {
  const el = document.getElementById('budget-alloc-status');
  if (!el) return;
  const total = state.totalBudget || 0;
  if (!total) { el.innerHTML = ''; return; }

  const allocated = totalAllocated();
  const remaining = total - allocated;
  const allocPct = Math.min((allocated / total) * 100, 100);
  const barCls = remaining < 0 ? 'progress-red' : remaining / total < 0.25 ? 'progress-pink' : 'progress-gold';
  const allocCls = remaining < 0 ? 'over' : remaining / total < 0.1 ? 'warn' : 'ok';

  el.innerHTML = `
    <div class="budget-alloc-box">
      <div class="budget-alloc-top">
        <span class="budget-alloc-label">Distribuído</span>
        <span class="budget-alloc-value ${allocCls}">${formatCurrency(allocated)} de ${formatCurrency(total)}</span>
      </div>
      <div class="progress-bar" style="margin-bottom:6px">
        <div class="progress-fill ${barCls}" style="width:${allocPct}%"></div>
      </div>
      <div style="font-size:12px;color:var(--text-muted)">
        ${remaining >= 0
          ? `Disponível para distribuir: <b style="color:var(--gold-dark)">${formatCurrency(remaining)}</b>`
          : `<span style="color:var(--danger)">⚠️ Excede em ${formatCurrency(-remaining)}</span>`}
      </div>
    </div>`;
}

function onTotalBudgetInput(value) {
  state.totalBudget = parseFloat(value) || 0;
  renderBudgetAllocStatus();
}

function updateCatBudget(id, value) {
  const cat = state.categories.find(c => c.id === id);
  if (cat) cat.budget = parseFloat(value) || 0;
  renderBudgetAllocStatus();
}

function updateBudgetCatName(catId, value) {
  const cat = state.categories.find(c => c.id === catId);
  if (cat) cat.name = value;
}

function addBudgetCategory() {
  state.categories.push({
    id: 'cat_' + generateId().slice(0, 8),
    name: '',
    emoji: '📦',
    budget: 0,
    color: '#6B7280',
  });
  renderCatBudgetList();
  setTimeout(() => {
    const inputs = document.querySelectorAll('#cat-sortable-list .cat-name-editable');
    inputs[inputs.length - 1]?.focus();
  }, 50);
}

function removeBudgetCategory(catId) {
  state.categories = state.categories.filter(c => c.id !== catId);
  saveState();
  renderCatBudgetList();
}

function saveSettings() {
  document.querySelectorAll('.partner-name-input').forEach(input => {
    const p = getPartner(input.dataset.email);
    if (p && input.value.trim()) p.name = input.value.trim();
  });

  saveState();

  if (!state.demoMode && state.coupleId) {
    state.partners.forEach(p => {
      if (p.id) updateProfileInDb({ id: p.id, name: p.name, photo: p.photo }).catch(() => {});
    });
  }

  showToast('Definições guardadas! 💛');
  showScreen('dashboard');
}

function saveBudgets() {
  const totalInput = document.getElementById('set-total-budget');
  if (totalInput) state.totalBudget = parseFloat(totalInput.value) || 0;

  if (state.totalBudget > 0) {
    const allocated = totalAllocated();
    if (allocated > state.totalBudget) {
      showToast(`⚠️ Categorias (${formatCurrency(allocated)}) excedem o total (${formatCurrency(state.totalBudget)})`);
      return;
    }
  }

  saveState();

  if (!state.demoMode && state.coupleId) {
    saveBudgetsToDb(state.coupleId, state.categories, state.totalBudget)
      .catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
  }

  showToast('Orçamentos guardados! 💰');
  showScreen('dashboard');
}

function handleOpenSheet() {
  if (!state.coupleId) { showToast('Sem conta partilhada ligada'); return; }
  getCurrentProfile().then(profile => {
    const code = profile?.couples?.invite_code;
    if (code) {
      navigator.clipboard?.writeText(code);
      showToast(`Código copiado: ${code} 💌`);
    } else {
      showToast('Código de convite não disponível');
    }
  }).catch(() => showToast('Erro ao obter o código de convite'));
}

function handleExportXlsx() {
  try {
    exportExpensesXlsx(state.expenses, state.categories, state.partners);
    showToast('Excel baixado! 📊');
  } catch (err) {
    showToast(err.message);
  }
}

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
