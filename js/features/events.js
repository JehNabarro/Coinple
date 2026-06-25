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
  eventFormState.categories    = ev
    ? JSON.parse(JSON.stringify(ev.categories || []))
    : DEFAULT_CATEGORIES.map(c => ({ ...c, id: 'ev-cat-' + generateId() }));
  showScreen('event-form');
}

function renderEventFormScreen() {
  const ev = eventFormState.editingId ? (state.events || []).find(e => e.id === eventFormState.editingId) : null;
  const isPast = ev ? getEventStatus(ev) === 'past' : false;

  document.getElementById('event-form-screen-title').textContent = ev ? 'Editar Evento' : 'Novo Evento';
  document.getElementById('event-name').value   = ev?.name      || '';
  document.getElementById('event-start').value  = ev?.startDate || todayISO();
  document.getElementById('event-end').value    = ev?.endDate   || '';
  document.getElementById('btn-save-event').textContent = ev ? 'Guardar' : 'Criar Evento';

  const budgetInput = document.getElementById('event-budget');
  if (budgetInput) {
    budgetInput.value    = eventFormState.totalBudget || '';
    budgetInput.disabled = isPast;
    budgetInput.title    = isPast ? 'Orçamento bloqueado — evento já passou' : '';
    budgetInput.style.opacity = isPast ? '0.55' : '';
  }

  // Show past notice
  const noticeId = 'event-past-notice';
  document.getElementById(noticeId)?.remove();
  if (isPast) {
    const notice = document.createElement('div');
    notice.id = noticeId;
    notice.style.cssText = 'font-size:12px;color:var(--text-muted);background:var(--bg-elev);border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin-bottom:10px';
    notice.textContent = '⏳ Evento passado — o orçamento não pode ser alterado. Conta o que foi gasto.';
    budgetInput?.closest('.form-group')?.after(notice);
  }

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
  el.innerHTML = allocStatusHtml({
    total: eventFormState.totalBudget || 0,
    allocated: eventFormState.categories.reduce((s, c) => s + (c.budget || 0), 0),
    remainingLabel: 'Por distribuir',
    marginBottom: 12,
  });
}

function removeEventCategory(idx) {
  confirmAction('Remover esta categoria do evento?', () => {
    eventFormState.categories.splice(idx, 1);
    renderEventCategoryEditor();
    renderEventBudgetAllocStatus();
  });
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
      const existing = state.events[idx];
      // Past events: preserve the original budget — it cannot be changed
      const finalBudget = getEventStatus(existing) === 'past' ? existing.totalBudget : totalBudget;
      state.events[idx] = { ...existing, name, emoji, totalBudget: finalBudget, startDate, endDate, categories: validCats };
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
  confirmAction('Eliminar este evento?', () => {
    state.events = (state.events || []).filter(e => e.id !== eventId);
    saveState();
    if (!state.demoMode && state.coupleId) {
      deleteEventFromDb(eventId).catch(err => showToast(`Aviso: não sincronizou (${err.message})`));
    }
    closeModal('modal-event-detail');
    renderEventsScreen();
    renderDashboard();
    showToast('Evento eliminado');
  });
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

