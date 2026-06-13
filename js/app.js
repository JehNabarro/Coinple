/* ── State ── */
const DEFAULT_CATEGORIES = [
  { id: 'lazer',        name: 'Lazer',        emoji: '🎉', budget: 200, color: '#EC4899' },
  { id: 'gasolina',     name: 'Gasolina',     emoji: '⛽', budget: 300, color: '#E0A82E' },
  { id: 'supermercado', name: 'Supermercado', emoji: '🛒', budget: 600, color: '#10B981' },
  { id: 'restaurantes', name: 'Restaurantes', emoji: '🍽️', budget: 250, color: '#F472B6' },
  { id: 'casa',         name: 'Casa',         emoji: '🏠', budget: 800, color: '#C28E1B' },
  { id: 'saude',        name: 'Saúde',        emoji: '💊', budget: 150, color: '#8B5CF6' },
  { id: 'outros',       name: 'Outros',       emoji: '📦', budget: 100, color: '#6B7280' },
];

let state = {
  user: null,                 // { email, name, picture }
  demoMode: false,
  spreadsheetId: null,
  partners: [],               // [{ email, name, photo }] — máx. 2
  categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
  expenses: [],               // { id, amount, description, category, payerEmail, payerName, date, createdAt }
  settings: { apiKey: '' },
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
        partners: parsed.partners || [],
        expenses: parsed.expenses || [],
        settings: { apiKey: '', ...(parsed.settings || {}) },
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getCategory(id) {
  return state.categories.find(c => c.id === id) || state.categories.find(c => c.id === 'outros') || state.categories[0];
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
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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
  document.getElementById(`tab-${id}`)?.classList.add('active');
  activeScreen = id;

  if (id === 'dashboard') renderDashboard();
  if (id === 'add')       resetAddForm();
  if (id === 'history')   renderHistory();
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
async function handleGoogleLogin() {
  if (window.location.protocol === 'file:') {
    document.getElementById('login-hint').innerHTML =
      '⚠️ <b>Erro:</b> O login do Google não funciona abrindo o ficheiro HTML diretamente (protocolo <code>file://</code>).<br>Tens de rodar um servidor local (ex: executando o comando <code>npx serve</code> como indicado no README.md).';
    return;
  }

  const clientId = getGoogleClientId();
  if (!clientId) {
    document.getElementById('login-hint').textContent =
      'Falta configurar o Google Client ID (botão abaixo). Vê o README.md para criar um grátis — ou experimenta o modo demo.';
    return;
  }
  
  try {
    // Clear hints before starting
    document.getElementById('login-hint').innerHTML = 'A abrir janela do Google...';
    
    await requestAccessToken();
    const profile = await fetchGoogleProfile();
    state.user = profile;
    state.demoMode = false;
    saveState();
    if (state.spreadsheetId) {
      await syncFromSheet({ quiet: true });
      showView('app');
    } else {
      showView('setup');
    }
  } catch (err) {
    let errMsg = err.message || 'Erro desconhecido';
    if (errMsg === 'popup_closed') {
      errMsg = 'Janela de login fechada antes de concluir.';
    }
    
    let advice = '';
    if (clientId === '871632126241-u203ascbj6hhb3dhpu21g2sn9caqcram.apps.googleusercontent.com') {
      advice = '<br>💡 <b>Dica:</b> Estás a usar o Client ID padrão. Precisas de criar o teu próprio Client ID no Google Cloud Console e configurá-lo no botão abaixo para que o login funcione no teu computador/servidor.';
    } else {
      advice = '<br>💡 Se vires "Acesso bloqueado: erro de autorização / no registered origin", verifica se adicionaste <code>' + window.location.origin + '</code> nas "Origens JavaScript autorizadas" do teu Client ID no Google Cloud Console.';
    }
    
    document.getElementById('login-hint').innerHTML = `Não deu certo: <b>${errMsg}</b>.${advice}`;
  }
}

function handleDemoLogin() {
  state.user = { email: 'eu@coinple.demo', name: 'Eu', picture: '' };
  state.demoMode = true;
  state.spreadsheetId = null;
  if (!state.partners.length) {
    state.partners = [
      { email: 'eu@coinple.demo', name: 'Eu', photo: '' },
      { email: 'par@coinple.demo', name: 'Meu Amor', photo: '' },
    ];
  }
  saveState();
  showView('app');
  showToast('Modo demo — os dados ficam só neste aparelho 💛');
}

function handleConfigClientId() {
  const current = getGoogleClientId();
  const id = prompt(
    'Cola aqui o teu Google OAuth Client ID (termina em .apps.googleusercontent.com).\nVê o README.md para criar um:',
    current
  );
  if (id !== null) {
    setGoogleClientId(id);
    document.getElementById('login-hint').textContent = id.trim()
      ? 'Client ID guardado! Agora toca em "Entrar com Google" 💛'
      : 'Client ID removido.';
  }
}

function handleLogout() {
  if (!confirm('Sair da Coinple neste aparelho?')) return;
  clearAuth();
  state.user = null;
  state.demoMode = false;
  saveState();
  closeModal('modal-settings');
  showView('login');
}

/* ── Setup (juntar as duas contas) ── */
function renderSetup() {
  const u = state.user || {};
  document.getElementById('setup-name').textContent = firstName(u.name);
  const av = document.getElementById('setup-avatar');
  if (u.picture) { av.src = u.picture; av.style.display = ''; }
  else av.style.display = 'none';
  document.getElementById('setup-share').style.display = 'none';
}

function ensureSelfInPartners() {
  const u = state.user;
  if (!u || getPartner(u.email)) return;
  if (state.partners.length >= 2) {
    throw new Error('Esta planilha já tem um casal completo 💔 Confirma o link com o teu par.');
  }
  state.partners.push({ email: u.email, name: u.name, photo: u.picture || '' });
}

async function handleCreateSheet() {
  const btn = document.getElementById('btn-create-sheet');
  btn.disabled = true; btn.textContent = 'A criar… 🪄';
  try {
    const id = await createCoupleSheet(state.categories);
    state.spreadsheetId = id;
    state.partners = [];
    ensureSelfInPartners();
    await savePartnersToSheet(id, state.partners);
    saveState();
    const link = spreadsheetUrl(id);
    document.getElementById('share-link').value = link;
    document.getElementById('setup-share').style.display = '';
    document.getElementById('setup-share').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast(`Erro: ${err.message}`);
  } finally {
    btn.disabled = false; btn.textContent = 'Criar a nossa planilha';
  }
}

async function handleJoinSheet() {
  const raw = document.getElementById('join-sheet-link').value;
  const id = extractSpreadsheetId(raw);
  if (!id) { showToast('Cola o link completo da planilha 💌'); return; }
  const btn = document.getElementById('btn-join-sheet');
  btn.disabled = true; btn.textContent = 'A juntar… 💞';
  try {
    state.spreadsheetId = id;
    await syncFromSheet({ quiet: true, register: true });
    saveState();
    showView('app');
    showToast('Contas juntas! Bem-vindos à Coinple 💛💗');
  } catch (err) {
    state.spreadsheetId = null;
    showToast(`Erro: ${err.message}`);
  } finally {
    btn.disabled = false; btn.textContent = 'Juntar as nossas contas';
  }
}

/* ── Sync com a planilha ── */
let syncing = false;

async function syncFromSheet({ quiet = false, register = false } = {}) {
  if (state.demoMode || !state.spreadsheetId) return;
  if (syncing) return;
  syncing = true;
  document.getElementById('btn-sync')?.classList.add('spinning');
  try {
    const { expenses, partners, budgets } = await loadCoupleSheet(state.spreadsheetId);
    state.expenses = expenses;
    state.partners = partners;
    state.categories.forEach(c => {
      if (budgets[c.id] !== undefined) c.budget = budgets[c.id];
    });

    if (register || (state.user && !getPartner(state.user.email))) {
      ensureSelfInPartners();
      await savePartnersToSheet(state.spreadsheetId, state.partners);
    }
    saveState();
    if (activeScreen === 'dashboard') renderDashboard();
    if (activeScreen === 'history')   renderHistory();
    if (!quiet) showToast('Sincronizado com a planilha 📊');
  } catch (err) {
    if (!quiet) showToast(`Erro ao sincronizar: ${err.message}`);
    if (register) throw err;
  } finally {
    syncing = false;
    document.getElementById('btn-sync')?.classList.remove('spinning');
  }
}

function pushExpensesAsync() {
  if (state.demoMode || !state.spreadsheetId) return;
  rewriteExpensesInSheet(state.spreadsheetId, state.expenses)
    .catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
}

function pushPartnersAsync() {
  if (state.demoMode || !state.spreadsheetId) return;
  savePartnersToSheet(state.spreadsheetId, state.partners)
    .catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
}

/* ── Dashboard ── */
function renderDashboard() {
  renderCoupleCard();
  renderCategoryCards(currentMonthKey());
  renderRecentExpenses(currentMonthKey());
}

function renderCoupleCard() {
  const photos = document.getElementById('couple-photos');
  const namesEl = document.getElementById('couple-names');
  const subEl = document.getElementById('couple-sub');

  const ps = state.partners;
  if (ps.length >= 2) {
    photos.innerHTML = `${avatarHtml(ps[0].email, 'avatar-xl')}<span class="couple-heart">💛💗</span>${avatarHtml(ps[1].email, 'avatar-xl')}`;
    namesEl.textContent = `${firstName(ps[0].name)} & ${firstName(ps[1].name)}`;
    subEl.textContent = state.demoMode ? 'Modo demo' : 'Contas juntas 🥰';
  } else if (ps.length === 1) {
    photos.innerHTML = `${avatarHtml(ps[0].email, 'avatar-xl')}<span class="couple-heart">💛💗</span><div class="avatar avatar-fallback avatar-xl tone-pink">?</div>`;
    namesEl.textContent = firstName(ps[0].name);
    subEl.textContent = 'À espera do teu par — partilha o link da planilha 💌';
  } else {
    photos.innerHTML = '<img src="assets/coinple-logo.png" alt="Coinple" style="height:44px;width:auto;object-fit:contain">';
    namesEl.textContent = 'Coinple';
    subEl.textContent = '';
  }
}

function renderCategoryCards(mk) {
  const grid = document.getElementById('categories-grid');
  grid.innerHTML = state.categories.map(cat => {
    const spent  = spentByCategory(cat.id, mk);
    const budget = cat.budget || 0;
    const pct    = budget ? Math.min((spent / budget) * 100, 100) : 0;
    const cls    = progressClass(spent, budget);
    return `
      <div class="cat-card" onclick="filterHistoryByCat('${cat.id}')">
        <div class="cat-header">
          <div class="cat-icon" style="background:${cat.color}22">${cat.emoji}</div>
          <span class="cat-name">${cat.name}</span>
        </div>
        <div class="cat-amounts">
          <span class="cat-spent">${formatCurrency(spent)}</span>
          <span class="cat-budget">de ${formatCurrency(budget)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${cls}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
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
    return `
      <div class="expense-item" onclick="openExpenseDetail('${e.id}')">
        <div class="expense-icon" style="background:${cat.color}22">${cat.emoji}</div>
        <div class="expense-info">
          <div class="expense-desc">${e.description || cat.name}</div>
          <div class="expense-meta">
            ${avatarHtml(e.payerEmail, 'avatar-xs')}
            <span class="expense-person">${payerLabel(e)}</span>
            <span>${formatDate(e.date)}</span>
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
  receiptBase64: null,
  receiptMediaType: null,
};

function resetAddForm() {
  addFormState = {
    payerEmail: state.user?.email || state.partners[0]?.email || null,
    selectedCategory: null,
    receiptBase64: null,
    receiptMediaType: null,
  };

  document.getElementById('expense-amount').value   = '';
  document.getElementById('expense-desc').value     = '';
  document.getElementById('expense-date').value     = todayISO();
  document.getElementById('receipt-preview').style.display = 'none';
  document.getElementById('upload-placeholder').style.display = 'block';
  document.getElementById('ai-analyzing').classList.remove('visible');
  document.getElementById('ai-suggestion').classList.remove('visible');
  document.getElementById('receipt-file').value = '';

  const btn = document.getElementById('btn-submit-expense');
  btn.textContent = 'Guardar Despesa';
  btn.onclick = submitExpense;

  renderPersonButtons();
  renderCategoryPills();
}

function renderPersonButtons() {
  const container = document.getElementById('person-selector');
  if (!state.partners.length) {
    container.innerHTML = '<p class="text-muted" style="font-size:13px">Liga a planilha do casal nas definições 💌</p>';
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
  const container = document.getElementById('category-pills');
  container.innerHTML = state.categories.map(cat => `
    <button class="cat-pill ${addFormState.selectedCategory === cat.id ? 'selected' : ''}"
            onclick="selectCategory('${cat.id}')">
      ${cat.emoji} ${cat.name}
    </button>`).join('');
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

  const payer = getPartner(addFormState.payerEmail);
  const expense = {
    id:          generateId(),
    amount:      form.amount,
    description: form.desc || getCategory(addFormState.selectedCategory).name,
    category:    addFormState.selectedCategory,
    payerEmail:  addFormState.payerEmail,
    payerName:   payer?.name || '',
    date:        form.date,
    createdAt:   Date.now(),
  };

  state.expenses.push(expense);
  saveState();

  if (!state.demoMode && state.spreadsheetId) {
    appendExpenseToSheet(state.spreadsheetId, expense)
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
        return `
          <div class="history-item" onclick="openExpenseDetail('${e.id}')">
            <div class="expense-icon" style="background:${cat.color}22">${cat.emoji}</div>
            <div class="history-info">
              <div class="history-desc">${e.description}</div>
              <div class="history-meta">
                ${avatarHtml(e.payerEmail, 'avatar-xs')}
                <span class="expense-person">${payerLabel(e)}</span>
                <span class="history-cat">${cat.name}</span>
              </div>
            </div>
            <div class="history-right">
              <div class="history-amount">${formatCurrency(e.amount)}</div>
              <div class="history-date">${formatDate(e.date)}</div>
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
  pushExpensesAsync();
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
    const payer = getPartner(addFormState.payerEmail);
    expense.amount      = form.amount;
    expense.description = form.desc || getCategory(addFormState.selectedCategory).name;
    expense.category    = addFormState.selectedCategory;
    expense.payerEmail  = addFormState.payerEmail;
    expense.payerName   = payer?.name || '';
    expense.date        = form.date;
    saveState();
    pushExpensesAsync();
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
      pushPartnersAsync();
      renderPartnerList();
      renderCoupleCard();
      showToast('Fotinho atualizada! 📸💕');
    }
  } catch (err) {
    showToast(`Erro: ${err.message}`);
  }
}

/* ── Settings Modal ── */
function openSettings() {
  document.getElementById('set-apikey').value = state.settings.apiKey;
  renderPartnerList();
  renderSheetStatus();
  renderCatBudgetList();
  openModal('modal-settings');
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
  if (state.demoMode) {
    el.innerHTML = 'Modo demo — sem planilha ligada. Entra com Google para juntar as contas. 💛';
  } else if (state.spreadsheetId) {
    el.innerHTML = '✅ Planilha ligada — as despesas dos dois ficam gravadas no Excel do casal.';
  } else {
    el.innerHTML = 'Sem planilha ligada.';
  }
}

function renderCatBudgetList() {
  const list = document.getElementById('cat-budget-list');
  list.innerHTML = state.categories.map(cat => `
    <div class="cat-edit-item">
      <span class="cat-edit-emoji">${cat.emoji}</span>
      <span class="cat-edit-name">${cat.name}</span>
      <input class="cat-edit-budget" type="number" min="0" step="10"
             value="${cat.budget || 0}" data-cat="${cat.id}"
             onchange="updateCatBudget('${cat.id}', this.value)" />
    </div>`).join('');
}

function updateCatBudget(id, value) {
  const cat = state.categories.find(c => c.id === id);
  if (cat) cat.budget = parseFloat(value) || 0;
}

function saveSettings() {
  state.settings.apiKey = document.getElementById('set-apikey').value.trim();

  document.querySelectorAll('.partner-name-input').forEach(input => {
    const p = getPartner(input.dataset.email);
    if (p && input.value.trim()) p.name = input.value.trim();
  });

  saveState();
  pushPartnersAsync();
  if (!state.demoMode && state.spreadsheetId) {
    saveBudgetsToSheet(state.spreadsheetId, state.categories)
      .catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
  }
  closeModal('modal-settings');
  showToast('Definições guardadas! 💛');
  renderDashboard();
}

function handleOpenSheet() {
  if (!state.spreadsheetId) { showToast('Sem planilha ligada'); return; }
  window.open(spreadsheetUrl(state.spreadsheetId), '_blank');
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
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Login / setup
  document.getElementById('btn-google-login').addEventListener('click', handleGoogleLogin);
  document.getElementById('btn-create-sheet').addEventListener('click', handleCreateSheet);
  document.getElementById('btn-join-sheet').addEventListener('click', handleJoinSheet);
  document.getElementById('btn-setup-done').addEventListener('click', () => { showView('app'); });
  document.getElementById('btn-setup-logout').addEventListener('click', () => {
    clearAuth(); state.user = null; saveState(); showView('login');
  });
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const input = document.getElementById('share-link');
    input.select();
    navigator.clipboard?.writeText(input.value);
    showToast('Link copiado! 💌');
  });

  // App
  document.getElementById('tab-dashboard').addEventListener('click', () => showScreen('dashboard'));
  document.getElementById('tab-add').addEventListener('click',       () => showScreen('add'));
  document.getElementById('tab-history').addEventListener('click',   () => showScreen('history'));

  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-sync').addEventListener('click', () => syncFromSheet());
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  document.getElementById('receipt-file').addEventListener('change', handleReceiptUpload);
  document.getElementById('partner-photo-file').addEventListener('change', handlePartnerPhotoChange);
  // O clique do botão "Guardar Despesa" é definido em resetAddForm/editExpense (onclick),
  // para alternar entre criar e atualizar sem duplicar handlers.

  document.getElementById('btn-open-sheet').addEventListener('click', handleOpenSheet);
  document.getElementById('btn-export-xlsx').addEventListener('click', handleExportXlsx);

  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.closeModal));
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  // Decide vista inicial
  if (state.user && (state.demoMode || state.spreadsheetId)) {
    showView('app');
    if (!state.demoMode) syncFromSheet({ quiet: true }).catch(() => {});
  } else if (state.user && !state.demoMode) {
    showView('setup');
  } else {
    showView('login');
  }

  // Re-sincroniza quando a app volta ao primeiro plano
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.user && !state.demoMode && state.spreadsheetId) {
      syncFromSheet({ quiet: true }).catch(() => {});
    }
  });

  // Auto-sincroniza a cada 30 segundos se a app estiver ativa no browser
  setInterval(() => {
    if (!document.hidden && state.user && !state.demoMode && state.spreadsheetId) {
      syncFromSheet({ quiet: true }).catch(() => {});
    }
  }, 30000);
});
