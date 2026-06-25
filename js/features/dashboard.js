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
  // O total disponível do mês é só o orçamento total definido para o mês.
  // O orçamento de um evento já é dinheiro reservado DENTRO deste total, e as
  // despesas do evento entram em totalSpentThisMonth — por isso não se soma nada
  // aqui (senão criar um evento aumentava o "disponível" em vez de o reduzir).
  const total = monthTotal(mk);
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

  const card = (cat, isBig) => categoryCardHtml({
    emoji: cat.emoji, color: cat.color, isBig, title: cat.name,
    spent: spentOnEventCategory(ev.id, cat.id), budget: cat.budget || 0,
    onclick: `openAddWithCategory('${cat.id}')`,
  });

  const big   = cats.slice(0, 3);
  const small = cats.slice(3);
  grid.innerHTML = `
    <div class="cat-row-big">${big.map(c => card(c, true)).join('')}</div>
    ${small.length ? `<div class="cat-row-small">${small.map(c => card(c, false)).join('')}</div>` : ''}`;
}

function renderCategoryCards(mk) {
  const grid = document.getElementById('categories-grid');
  const cats = monthCategories(mk);
  const big = cats.slice(0, 3);
  const small = cats.slice(3);

  const card = (cat, isBig) => categoryCardHtml({
    emoji: cat.emoji, color: cat.color, isBig, title: cat.name,
    spent: spentByCategory(cat.id, mk), budget: catBudget(cat.id, mk),
    onclick: `filterHistoryByCat('${cat.id}')`,
  });

  // Upcoming events (starting after today)
  const today = todayISO();
  const upcomingEvents = (state.events || [])
    .filter(ev => ev.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 4);

  let upcomingHtml = '';
  if (upcomingEvents.length) {
    const eventCards = upcomingEvents.map(ev => {
      const daysUntil = Math.max(1, Math.ceil((new Date(ev.startDate) - new Date()) / 86400000));
      const label = ev.name.length > 8 ? ev.name.slice(0, 7) + '…' : ev.name;
      return `
        <div class="cat-card small" style="background:color-mix(in srgb,#C28E1B 16%,#fff)"
             onclick="openEventDetail('${ev.id}')" title="${ev.name}">
          <div class="cat-icon-wrap">${ev.emoji}</div>
          <div class="cat-avail" style="color:var(--gold-dark);font-size:12px">${label}</div>
          <div class="cat-avail-label">em ${daysUntil}d</div>
        </div>`;
    }).join('');
    upcomingHtml = `
      <div class="upcoming-events-section">
        <div class="upcoming-events-label">Próximos eventos</div>
        <div class="cat-row-small">${eventCards}</div>
      </div>`;
  }

  grid.innerHTML = `
    <div class="cat-row-big">${big.map(c => card(c, true)).join('')}</div>
    <div class="cat-row-small">${small.map(c => card(c, false)).join('')}</div>
    ${upcomingHtml}`;
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

  list.innerHTML = recent.map(e => expenseRowHtml(e, { card: false })).join('');
}

