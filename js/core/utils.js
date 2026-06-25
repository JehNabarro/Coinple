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

// Mês real de hoje, independente do mês que está a ser visto no ecrã de orçamentos.
function realMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Mês seguinte (em 'YYYY-MM') a partir de um month_key dado (ou do mês real).
function addMonthKey(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonthKey() {
  return addMonthKey(realMonthKey(), 1);
}

// Mês "ativo" para leitura. No ecrã de orçamentos pode ser o mês seguinte
// (state.viewingMonth); em todo o resto cai no mês real de hoje.
function currentMonthKey() {
  return state.viewingMonth || realMonthKey();
}

// Só o mês atual e o mês seguinte são editáveis. Meses anteriores ficam
// congelados; meses mais à frente ainda não existem no planeamento.
function isMonthEditable(mk) {
  return mk === realMonthKey() || mk === nextMonthKey();
}

// Devolve o objeto de orçamento de um mês, criando-o (semente) se necessário.
function monthBudget(mk) {
  if (!state.monthlyBudgets[mk]) {
    // Semente: copia do mês existente mais recente anterior a mk. Se não houver
    // nenhum, arranca com os orçamentos padrão das categorias.
    const prior = Object.keys(state.monthlyBudgets).filter(k => k < mk).sort().pop();
    const src = prior ? state.monthlyBudgets[prior] : null;
    if (src) {
      state.monthlyBudgets[mk] = { total: src.total, categoryBudgets: { ...src.categoryBudgets } };
    } else {
      const categoryBudgets = {};
      state.categories.forEach(c => { categoryBudgets[c.id] = c.budget || 0; });
      state.monthlyBudgets[mk] = {
        total: state.categories.reduce((s, c) => s + (c.budget || 0), 0),
        categoryBudgets,
      };
    }
  }
  return state.monthlyBudgets[mk];
}

// Orçamento de uma categoria nesse mês.
function catBudget(catId, mk) {
  return state.monthlyBudgets[mk]?.categoryBudgets?.[catId] || 0;
}

// Orçamento total definido para esse mês.
function monthTotal(mk) {
  return state.monthlyBudgets[mk]?.total || 0;
}

// Um evento pertence só ao mês em que começa (start_date).
function eventsForMonth(mk) {
  return (state.events || []).filter(ev => ev.startDate.slice(0, 7) === mk);
}

function eventEmojiFor(expense) {
  if (!expense.eventId) return '';
  return (state.events || []).find(ev => ev.id === expense.eventId)?.emoji || '';
}

function totalAllocated(mk) {
  const catTotal = state.categories.reduce((s, c) => s + catBudget(c.id, mk), 0);
  const eventTotal = eventsForMonth(mk)
    .reduce((s, ev) => {
      // Eventos passados contam o gasto real — o orçamento está congelado.
      return s + (getEventStatus(ev) === 'past' ? spentOnEvent(ev.id) : (ev.totalBudget || 0));
    }, 0);
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
    .filter(e => e.category === catId && !e.eventId)
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

