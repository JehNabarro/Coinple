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

function selectBudgetMonth(mk) {
  state.viewingMonth = mk;
  monthBudget(mk); // garante que o mês existe (semente a partir do anterior)
  renderCatBudgetList();
}

function renderCatBudgetList() {
  // Por omissão mostra o mês real; o seletor permite saltar para o mês seguinte.
  if (!state.viewingMonth) state.viewingMonth = realMonthKey();
  const mk = currentMonthKey();
  // Materializa a lista de categorias dos dois meses visíveis como cópias
  // independentes, para que adicionar/remover num mês não afete o outro.
  ensureMonthMembership(realMonthKey());
  ensureMonthMembership(nextMonthKey());

  const cats = monthCategories(mk);
  const total = monthTotal(mk);
  const list = document.getElementById('cat-budget-list');

  const curMk = realMonthKey();
  const nxtMk = nextMonthKey();
  const monthTab = (key, label) => `
    <button class="scope-tab ${mk === key ? 'active' : ''}"
            onclick="selectBudgetMonth('${key}')" type="button">${label}</button>`;

  list.innerHTML = `
    <div class="expense-scope-tabs" style="margin-bottom:14px">
      ${monthTab(curMk, '📅 ' + monthName(curMk))}
      ${monthTab(nxtMk, '➡️ ' + monthName(nxtMk))}
    </div>
    <div class="cat-edit-item" style="border-bottom:1.5px solid var(--gold);padding-bottom:14px;margin-bottom:4px">
      <span class="cat-edit-emoji">💰</span>
      <span class="cat-edit-name" style="font-weight:700">Total de ${monthName(mk)}</span>
      <input class="cat-edit-budget" type="number" min="0" step="50"
             id="set-total-budget" value="${total}"
             oninput="onTotalBudgetInput(this.value)" />
    </div>
    <div id="budget-alloc-status"></div>
    <div id="cat-sortable-list">
      ${cats.map((cat, i) => `
        <div class="cat-edit-item" data-sort-idx="${i}" data-cat-id="${cat.id}">
          <div class="drag-handle" title="Arrastar">${DRAG_HANDLE_SVG}</div>
          <button class="cat-emoji-btn" onclick="openBudgetCatEmojiPicker('${cat.id}',this)" type="button">${cat.emoji}</button>
          <input class="cat-name-editable" type="text" value="${cat.name || ''}" placeholder="Nome"
                 oninput="updateBudgetCatName('${cat.id}',this.value)" />
          <input class="cat-edit-budget" type="number" min="0" step="10"
                 value="${catBudget(cat.id, mk)}" data-cat="${cat.id}"
                 oninput="updateCatBudget('${cat.id}', this.value)" />
          <button class="event-cat-remove" onclick="removeBudgetCategory('${cat.id}')" type="button">✕</button>
        </div>`).join('')}
    </div>
    <button class="btn btn-secondary btn-sm" onclick="addBudgetCategory()"
            style="margin-top:10px;width:100%">+ Adicionar categoria</button>`;

  renderBudgetAllocStatus();

  const sortableEl = document.getElementById('cat-sortable-list');
  setupSortable(sortableEl, newOrder => {
    // Reordena as categorias do mês visível e reflete a ordem no catálogo,
    // mantendo no fim quaisquer categorias que não pertençam a este mês.
    const shown = monthCategories(mk);
    const reordered = newOrder.map(i => shown[i]);
    const shownIds = new Set(shown.map(c => c.id));
    state.categories = [...reordered, ...state.categories.filter(c => !shownIds.has(c.id))];
    saveState();
    renderCatBudgetList();
  });

  // Eventos do mês visto (um evento pertence só ao mês em que começa).
  // Os passados ficam só de leitura; os ativos/futuros são editáveis.
  const monthEvents = eventsForMonth(mk);
  const editableSet = monthEvents.filter(ev => getEventStatus(ev) !== 'past');
  const pastSet     = monthEvents.filter(ev => getEventStatus(ev) === 'past');

  const allRelevant = [...editableSet, ...pastSet];

  if (allRelevant.length) {
    const renderEventRow = (ev) => {
      const spent  = spentOnEvent(ev.id);
      const status = getEventStatus(ev);
      const isPast = status === 'past';
      const pct    = ev.totalBudget ? Math.min((spent / ev.totalBudget) * 100, 100) : 0;
      const cls    = spent > ev.totalBudget ? 'progress-red' : spent / (ev.totalBudget || 1) > 0.75 ? 'progress-pink' : 'progress-gold';

      return `
        <div class="cat-edit-item" style="flex-direction:column;align-items:stretch;gap:6px${isPast ? ';opacity:0.75' : ''}">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="cat-edit-emoji" style="cursor:pointer" onclick="openEventDetail('${ev.id}')">${ev.emoji}</span>
            <span class="cat-edit-name" style="flex:1;cursor:pointer" onclick="openEventDetail('${ev.id}')">${ev.name}</span>
            ${isPast
              ? `<span class="event-past-spent">${formatCurrency(spent)}</span>
                 <span class="past-badge">passado</span>`
              : `<input class="cat-edit-budget" type="number" min="0" step="10"
                        value="${ev.totalBudget || 0}"
                        oninput="updateEventBudgetInBudgets('${ev.id}', this.value)" />`}
          </div>
          ${!isPast && status !== 'upcoming' ? `
          <div class="progress-bar">
            <div class="progress-fill ${cls}" style="width:${pct}%"></div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);text-align:right">${formatCurrency(spent)} gastos</div>` : ''}
          ${isPast ? `
          <div class="progress-bar">
            <div class="progress-fill ${cls}" style="width:${pct}%"></div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);text-align:right">gasto real · orçamento era ${formatCurrency(ev.totalBudget || 0)}</div>` : ''}
        </div>`;
    };

    list.innerHTML += `
      <div style="margin-top:18px;margin-bottom:8px;font-size:12px;font-weight:700;
                  color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px">
        Eventos
      </div>
      ${editableSet.map(renderEventRow).join('')}
      ${pastSet.length ? `
        <div style="margin-top:10px;margin-bottom:4px;font-size:11px;font-weight:700;
                    color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px">
          Passados (este mês)
        </div>
        ${pastSet.map(renderEventRow).join('')}` : ''}`;
  }
}

function updateEventBudgetInBudgets(evId, value) {
  const ev = (state.events || []).find(e => e.id === evId);
  if (ev) ev.totalBudget = parseFloat(value) || 0;
  renderBudgetAllocStatus();
}

function renderBudgetAllocStatus() {
  const el = document.getElementById('budget-alloc-status');
  if (!el) return;
  const mk = currentMonthKey();
  el.innerHTML = allocStatusHtml({
    total: monthTotal(mk),
    allocated: totalAllocated(mk),
    remainingLabel: 'Disponível para distribuir',
  });
}

function onTotalBudgetInput(value) {
  monthBudget(currentMonthKey()).total = parseFloat(value) || 0;
  renderBudgetAllocStatus();
}

function updateCatBudget(id, value) {
  monthBudget(currentMonthKey()).categoryBudgets[id] = parseFloat(value) || 0;
  renderBudgetAllocStatus();
}

function updateBudgetCatName(catId, value) {
  const cat = state.categories.find(c => c.id === catId);
  if (cat) cat.name = value;
}

function addBudgetCategory() {
  const mk = currentMonthKey();
  const mb = ensureMonthMembership(mk); // materializa este mês antes de mexer
  const id = 'cat_' + generateId().slice(0, 8);
  state.categories.push({ id, name: '', emoji: '📦', budget: 0, color: '#6B7280' });
  mb.categoryBudgets[id] = 0; // pertence só a este mês
  saveState();
  renderCatBudgetList();
  setTimeout(() => {
    const inputs = document.querySelectorAll('#cat-sortable-list .cat-name-editable');
    inputs[inputs.length - 1]?.focus();
  }, 50);
}

function removeBudgetCategory(catId) {
  confirmAction('Remover esta categoria deste mês?', () => {
    const mk = currentMonthKey();
    const mb = ensureMonthMembership(mk); // materializa este mês antes de remover
    delete mb.categoryBudgets[catId]; // remove só deste mês
    // Se já não for usada em nenhum mês, sai também do catálogo global.
    const usedAnywhere = Object.values(state.monthlyBudgets)
      .some(m => m.categoryBudgets && Object.prototype.hasOwnProperty.call(m.categoryBudgets, catId));
    if (!usedAnywhere) state.categories = state.categories.filter(c => c.id !== catId);
    saveState();
    renderCatBudgetList();
  });
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
  const mk = currentMonthKey();
  const mb = monthBudget(mk);

  const totalInput = document.getElementById('set-total-budget');
  if (totalInput) mb.total = parseFloat(totalInput.value) || 0;

  if (mb.total > 0) {
    const allocated = totalAllocated(mk);
    if (allocated > mb.total) {
      showToast(`⚠️ Categorias (${formatCurrency(allocated)}) excedem o total (${formatCurrency(mb.total)})`);
      return;
    }
  }

  saveState();

  if (!state.demoMode && state.coupleId) {
    saveBudgetsToDb(state.coupleId, monthCategories(mk), mk, mb.total, mb.categoryBudgets)
      .catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
    // Sincroniza orçamentos de eventos editados neste ecrã (só os deste mês).
    eventsForMonth(mk)
      .filter(ev => getEventStatus(ev) !== 'past')
      .forEach(ev => saveEventToDb(state.coupleId, ev).catch(() => {}));
  }

  showToast('Orçamentos guardados! 💰');
  state.viewingMonth = null;
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

