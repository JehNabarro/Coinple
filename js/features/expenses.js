/* ── Add Expense ── */
let addFormState = {
  payerEmail: null,
  selectedCategory: null,
  scope: 'month',
  eventId: null,
  receiptBase64: null,
  receiptMediaType: null,
};

function resetAddForm() {
  // Por defeito sugere o evento em curso (se houver), mas qualquer evento pode
  // ser escolhido — a data da despesa é que decide a que mês ela pertence.
  const active = getActiveEvent();
  addFormState = {
    payerEmail: state.user?.email || state.partners[0]?.email || null,
    selectedCategory: null,
    scope: active ? 'event' : 'month',
    eventId: active?.id || null,
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
  // Qualquer evento pode receber despesas — passados, atuais ou futuros.
  const events = [...(state.events || [])].sort((a, b) => b.startDate.localeCompare(a.startDate));

  if (events.length && scopeTabsEl) {
    scopeTabsEl.style.display = 'flex';
    scopeTabsEl.innerHTML = `
      <button class="scope-tab ${addFormState.scope === 'month' ? 'active' : ''}"
              onclick="selectExpenseScope('month')">📅 Mês</button>
      <button class="scope-tab ${addFormState.scope === 'event' ? 'active' : ''}"
              onclick="selectExpenseScope('event')">🎉 Evento</button>`;
  } else {
    if (scopeTabsEl) scopeTabsEl.style.display = 'none';
    addFormState.scope = 'month';
  }

  const useEvent = addFormState.scope === 'event' && events.length;

  // No modo evento mostra um seletor de qual evento e usa as categorias dele.
  let eventPickerHtml = '';
  let activeEvent = null;
  if (useEvent) {
    if (!addFormState.eventId || !events.some(e => e.id === addFormState.eventId)) {
      addFormState.eventId = events[0].id;
    }
    activeEvent = events.find(e => e.id === addFormState.eventId);
    eventPickerHtml = `
      <select class="event-picker-select" onchange="selectExpenseEvent(this.value)"
              style="width:100%;margin-bottom:12px;padding:10px;border-radius:12px;
                     border:1.5px solid var(--gold);background:var(--bg-elev);color:var(--text);font-size:14px">
        ${events.map(ev => {
          const st = getEventStatus(ev);
          const tag = st === 'past' ? ' · passado' : st === 'upcoming' ? ' · futuro' : ' · a decorrer';
          return `<option value="${ev.id}" ${ev.id === addFormState.eventId ? 'selected' : ''}>${ev.emoji} ${ev.name}${tag}</option>`;
        }).join('')}
      </select>`;
  }

  const cats = useEvent ? (activeEvent?.categories || []) : state.categories;

  container.innerHTML = eventPickerHtml + `<div class="cat-grid">${cats.map(cat => `
    <button class="cat-grid-item ${addFormState.selectedCategory === cat.id ? 'selected' : ''}"
            onclick="selectCategory('${cat.id}')">
      <span class="cat-grid-emoji">${cat.emoji}</span>
      <span class="cat-grid-name">${cat.name}</span>
    </button>`).join('')}</div>`;
}

function selectExpenseEvent(eventId) {
  addFormState.eventId = eventId;
  addFormState.selectedCategory = null;
  renderCategoryPills();
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

  const payer = getPartner(addFormState.payerEmail);
  // A despesa pode ser associada a qualquer evento; o mês a que pertence vem
  // da data da despesa, não da data do evento.
  const tagEvent = addFormState.scope === 'event' && addFormState.eventId;
  const expense = {
    id:          generateId(),
    amount:      form.amount,
    description: form.desc || getCategory(addFormState.selectedCategory).name,
    category:    addFormState.selectedCategory,
    payerEmail:  addFormState.payerEmail,
    payerName:   payer?.name || '',
    date:        form.date,
    createdAt:   Date.now(),
    ...(tagEvent ? { eventId: addFormState.eventId } : {}),
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
let historyFilters = { categories: [], people: [], events: [] }; // empty = all
let reportTab = 'dashboard'; // 'dashboard' | 'expenses'

function switchReportTab(tab) {
  reportTab = tab;
  document.querySelectorAll('.report-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  const filterBtn = document.getElementById('history-filter-btn');
  if (filterBtn) filterBtn.style.visibility = tab === 'expenses' ? '' : 'hidden';
  const filterTags = document.getElementById('history-active-filter-tags');
  if (filterTags) filterTags.style.display = tab === 'expenses' ? '' : 'none';
  document.getElementById('history-chart').style.display = tab === 'dashboard' ? '' : 'none';
  document.getElementById('history-list').style.display  = tab === 'expenses'  ? '' : 'none';
}

function filterHistoryByCat(catId) {
  historyFilters.categories = [catId];
  showScreen('history');
}

function clearHistoryFilters() {
  historyFilters = { categories: [], people: [], events: [] };
  closeModal('modal-history-filter');
  renderHistory();
}

function toggleFilterItem(key, value) {
  const arr = historyFilters[key];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
  document.querySelectorAll(`[data-fkey="${key}"][data-fval="${value}"]`)
    .forEach(el => el.classList.toggle('on', historyFilters[key].includes(value)));
  _updateFilterBadge();
}

function _updateFilterBadge() {
  const count = historyFilters.categories.length + historyFilters.people.length + historyFilters.events.length;
  const badge = document.getElementById('filter-count-badge');
  if (badge) { badge.style.display = count ? 'inline-flex' : 'none'; badge.textContent = count; }
}

function openHistoryFilter() {
  renderFilterSheet();
  openModal('modal-history-filter');
}

function renderFilterSheet() {
  const el = document.getElementById('filter-sheet-content');
  if (!el) return;

  const chip = (key, val, label) => {
    const on = historyFilters[key].includes(val) ? 'on' : '';
    return `<button class="filter-chip-sel ${on}" data-fkey="${key}" data-fval="${val}"
             onclick="toggleFilterItem('${key}','${val}')">${label}</button>`;
  };

  let html = '';

  if (state.partners.length) {
    html += `<div class="filter-section-title">Pessoas</div><div class="filter-chip-row">`;
    state.partners.forEach(p => { html += chip('people', p.email, avatarHtml(p.email,'avatar-xs') + ' ' + firstName(p.name)); });
    html += `</div>`;
  }

  html += `<div class="filter-section-title">Categorias</div><div class="filter-chip-row">`;
  state.categories.forEach(c => { html += chip('categories', c.id, c.emoji + ' ' + c.name); });
  html += `</div>`;

  if ((state.events || []).length) {
    html += `<div class="filter-section-title">Eventos</div><div class="filter-chip-row">`;
    (state.events || []).forEach(ev => {
      const on = historyFilters.events.includes(ev.id) ? 'on' : '';
      html += `<button class="filter-chip-sel ${on}" onclick="toggleFilterEvent('${ev.id}')">${ev.emoji} ${ev.name}</button>`;
    });
    html += `</div>`;

    // Para cada evento selecionado, mostra as categorias desse evento logo abaixo.
    (state.events || [])
      .filter(ev => historyFilters.events.includes(ev.id) && (ev.categories || []).length)
      .forEach(ev => {
        html += `<div class="filter-section-title">${ev.emoji} Categorias de ${ev.name}</div><div class="filter-chip-row">`;
        ev.categories.forEach(c => { html += chip('categories', c.id, c.emoji + ' ' + c.name); });
        html += `</div>`;
      });
  }

  el.innerHTML = html;
}

// Alterna um evento no filtro. Ao ativar, junta automaticamente as categorias
// desse evento ao filtro de categorias; ao desativar, remove-as.
function toggleFilterEvent(eventId) {
  const ev = (state.events || []).find(e => e.id === eventId);
  const evCatIds = (ev?.categories || []).map(c => c.id);
  const i = historyFilters.events.indexOf(eventId);
  if (i >= 0) {
    historyFilters.events.splice(i, 1);
    historyFilters.categories = historyFilters.categories.filter(id => !evCatIds.includes(id));
  } else {
    historyFilters.events.push(eventId);
    evCatIds.forEach(id => { if (!historyFilters.categories.includes(id)) historyFilters.categories.push(id); });
  }
  _updateFilterBadge();
  renderFilterSheet();
}

function renderHistory() {
  _updateFilterBadge();

  // Apply tab visibility
  switchReportTab(reportTab);

  // Active filter tags
  const tagsEl = document.getElementById('history-active-filter-tags');
  if (tagsEl) {
    const tags = [
      ...historyFilters.categories.map(id => { const c = getCategory(id); return c ? `<span class="active-filter-tag">${c.emoji} ${c.name}</span>` : ''; }),
      ...historyFilters.people.map(email => { const p = state.partners.find(x=>x.email===email); return p ? `<span class="active-filter-tag">${firstName(p.name)}</span>` : ''; }),
      ...historyFilters.events.map(id => { const ev = (state.events||[]).find(x=>x.id===id); return ev ? `<span class="active-filter-tag">${ev.emoji} ${ev.name}</span>` : ''; }),
    ].filter(Boolean);
    tagsEl.innerHTML = tags.join('');
  }

  // Chart — always current month
  renderHistoryChart(currentMonthKey());

  let filtered = [...state.expenses];
  if (historyFilters.categories.length) filtered = filtered.filter(e => historyFilters.categories.includes(e.category));
  if (historyFilters.people.length)     filtered = filtered.filter(e => historyFilters.people.includes(e.payerEmail));
  if (historyFilters.events.length)     filtered = filtered.filter(e => historyFilters.events.includes(e.eventId));

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
      ${exps.map(e => expenseRowHtml(e, { card: true })).join('')}
    </div>`).join('');
}

function renderHistoryChart(mk) {
  const chartEl = document.getElementById('history-chart');
  if (!chartEl) return;

  const monthEvents = eventsForMonth(mk);

  const items = [
    ...monthCategories(mk).map(cat => ({
      name: cat.name, emoji: cat.emoji, color: cat.color || '#EC4899',
      budget: catBudget(cat.id, mk),
      spent: spentByCategory(cat.id, mk),
    })),
    ...monthEvents.map(ev => ({
      name: ev.name, emoji: ev.emoji, color: '#C28E1B',
      budget: ev.totalBudget || 0,
      spent: spentOnEvent(ev.id),
    })),
  ].filter(i => i.budget > 0);

  // Saldo do mês = total definido − tudo o que se gastou (eventos incluídos).
  // Não somar totalAllocated: o orçamento dos eventos já vive dentro do total.
  const totalBudget = monthTotal(mk);
  const totalSpent  = expensesForMonth(mk).reduce((s,e) => s + (e.amount||0), 0);
  const balance     = totalBudget - totalSpent;

  if (!items.length || !totalBudget) { chartEl.innerHTML = ''; return; }

  const totalAlloc = items.reduce((s,i) => s + i.budget, 0) || 1;
  const CX = 120, CY = 120, SIZE = 240;
  const R_B = 85, W_B = 24, R_S = 58, W_S = 18;
  const circB = 2 * Math.PI * R_B, circS = 2 * Math.PI * R_S;
  const GAP_B = circB * 0.012, GAP_S = circS * 0.012;

  let offB = 0, offS = 0;
  let budgetArcs = '', spentArcs = '';

  items.forEach(item => {
    const frac = item.budget / totalAlloc;
    const lenB = frac * circB;
    const drawB = Math.max(0, lenB - GAP_B);
    budgetArcs += `<circle cx="${CX}" cy="${CY}" r="${R_B}" fill="none" stroke="${item.color}"
      stroke-width="${W_B}" stroke-dasharray="${drawB.toFixed(2)} ${circB.toFixed(2)}"
      stroke-dashoffset="${(circB - offB).toFixed(2)}" transform="rotate(-90 ${CX} ${CY})"/>`;
    offB += lenB;

    const lenS = frac * circS;
    const spentFrac = item.budget ? Math.min(item.spent / item.budget, 1) : 0;
    const drawS = Math.max(0, lenS * spentFrac - GAP_S * 0.5);
    spentArcs += `<circle cx="${CX}" cy="${CY}" r="${R_S}" fill="none" stroke="${item.color}"
      stroke-width="${W_S}" stroke-opacity="0.38"
      stroke-dasharray="${drawS.toFixed(2)} ${circS.toFixed(2)}"
      stroke-dashoffset="${(circS - offS).toFixed(2)}" transform="rotate(-90 ${CX} ${CY})"/>`;
    offS += lenS;
  });

  const balColor  = balance >= 0 ? '#10B981' : '#EF4444';
  const balLabel  = balance >= 0 ? 'disponível' : 'excedido';
  const balAmt    = (balance < 0 ? '-' : '') + formatCurrency(Math.abs(balance));
  const monthTxt  = monthLabel(mk);

  const legend = items.map(i => `
    <div class="chart-legend-item">
      <span class="chart-legend-dot" style="background:${i.color}"></span>
      <span class="chart-legend-name">${i.emoji} ${i.name}</span>
      <span class="chart-legend-values">${formatCurrency(i.spent)} / <b>${formatCurrency(i.budget)}</b></span>
    </div>`).join('');

  chartEl.innerHTML = `
    <div class="history-chart-card">
      <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" style="display:block;margin:0 auto">
        <circle cx="${CX}" cy="${CY}" r="${R_B}" fill="none" stroke="var(--bg-elev)" stroke-width="${W_B}"/>
        <circle cx="${CX}" cy="${CY}" r="${R_S}" fill="none" stroke="var(--bg-elev)" stroke-width="${W_S}"/>
        ${budgetArcs}${spentArcs}
        <text x="${CX}" y="${CY - 12}" text-anchor="middle" font-size="14" font-weight="700"
              fill="${balColor}" font-family="Geist,sans-serif">${balAmt}</text>
        <text x="${CX}" y="${CY + 6}" text-anchor="middle" font-size="11" font-weight="600"
              fill="${balColor}" font-family="Geist,sans-serif">${balLabel}</text>
        <text x="${CX}" y="${CY + 22}" text-anchor="middle" font-size="10"
              fill="var(--text-muted)" font-family="Geist,sans-serif">${monthTxt}</text>
      </svg>
      <div class="chart-legend">${legend}</div>
    </div>`;
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

function confirmAction(message, onConfirm) {
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-ok').onclick = () => { closeModal('modal-confirm'); onConfirm(); };
  openModal('modal-confirm');
}

function deleteExpense(id) {
  confirmAction('Eliminar esta despesa?', () => {
    state.expenses = state.expenses.filter(e => e.id !== id);
    saveState();
    if (!state.demoMode && state.coupleId) {
      deleteExpenseFromDb(id).catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
    }
    closeModal('modal-expense-detail');
    showToast('Despesa eliminada');
    if (activeScreen === 'dashboard') renderDashboard();
    if (activeScreen === 'history')   renderHistory();
  });
}

function editExpense(id) {
  const expense = state.expenses.find(e => e.id === id);
  if (!expense) return;
  closeModal('modal-expense-detail');

  showScreen('add');
  addFormState.payerEmail       = expense.payerEmail;
  addFormState.selectedCategory = expense.category;
  addFormState.scope            = expense.eventId ? 'event' : 'month';
  addFormState.eventId          = expense.eventId || null;

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
    // Associa ao evento escolhido (qualquer evento), independente da data de hoje.
    expense.eventId = addFormState.scope === 'event' ? (addFormState.eventId || undefined) : undefined;
    saveState();
    if (!state.demoMode && state.coupleId) {
      updateExpenseInDb(expense, payer?.id || null, state.coupleId)
        .catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
    }
    showToast('Despesa atualizada! 💛');
    showScreen('dashboard');
  };
}

