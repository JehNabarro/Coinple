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
  // Orçamentos por mês: { 'YYYY-MM': { total, categoryBudgets: { catId: valor } } }
  // Cada mês tem o seu próprio total e a sua própria lista de orçamentos por categoria.
  monthlyBudgets: {},
  viewingMonth: null,         // mês selecionado no ecrã de orçamentos (null = mês real de hoje)
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
        monthlyBudgets: parsed.monthlyBudgets || {},
        viewingMonth:   null,
        theme:       parsed.theme       || 'dark',
        coupleId:    parsed.coupleId    || null,
        // compatibilidade: migra spreadsheetId → coupleId
        ...(parsed.spreadsheetId && !parsed.coupleId ? { spreadsheetId: undefined } : {}),
      };
      // Migração de localStorage antigo: total/categorias globais → mês atual
      migrateLegacyBudgets(parsed);
    }
  } catch (e) { /* usa defaults */ }
}

// Copia o orçamento global antigo (state.totalBudget + cat.budget) para o mês
// atual, caso ainda não exista nenhum orçamento mensal guardado.
function migrateLegacyBudgets(parsed) {
  if (Object.keys(state.monthlyBudgets).length) return;
  const legacyTotal = parsed?.totalBudget || 0;
  const cats = parsed?.categories || state.categories;
  const hasLegacy = legacyTotal > 0 || cats.some(c => (c.budget || 0) > 0);
  if (!hasLegacy) return;
  const categoryBudgets = {};
  cats.forEach(c => { categoryBudgets[c.id] = c.budget || 0; });
  state.monthlyBudgets[realMonthKey()] = { total: legacyTotal, categoryBudgets };
}

function saveState() {
  localStorage.setItem('coinple-state', JSON.stringify(state));
}

