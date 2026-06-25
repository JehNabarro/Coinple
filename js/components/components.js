/* ── Componentes de UI reutilizáveis ──
 * Funções puras que devolvem HTML. Partilhadas por vários ecrãs para garantir
 * que elementos com a mesma função têm sempre o mesmo desenho.
 * Dependem de helpers globais (formatCurrency, getCategory, avatarHtml…).
 */

/* Linha de despesa — usada na dashboard (lista compacta) e no relatório (cartões).
 * variant.card = true  → cada linha é um cartão (ecrã Relatório)
 * variant.card = false → lista plana com divisória (dashboard) */
function expenseRowHtml(e, { card = false } = {}) {
  const cat = getCategory(e.category);
  const evEmoji = eventEmojiFor(e);
  const time = formatTime(e.createdAt) ? ' · ' + formatTime(e.createdAt) : '';
  return `
    <div class="expense-item${card ? ' is-card' : ''}" onclick="openExpenseDetail('${e.id}')">
      <div class="expense-icon" style="background:${cat.color}22">${cat.emoji}</div>
      <div class="expense-info">
        <div class="expense-desc">
          <span>${e.description || cat.name}</span>
          ${evEmoji ? `<span class="expense-event-tag">${evEmoji}</span>` : ''}
        </div>
        <div class="expense-meta">
          ${avatarHtml(e.payerEmail, 'avatar-xs')}
          <span>${cat.name} · ${formatDate(e.date)}${time}</span>
        </div>
      </div>
      <div class="expense-amount">${formatCurrency(e.amount)}</div>
    </div>`;
}

/* Cartão de categoria do grid da dashboard (mensal ou de evento).
 * isBig controla o tamanho; onclick é a ação ao tocar. */
function categoryCardHtml({ emoji, color, spent, budget, isBig, onclick, title }) {
  const avail = budget - spent;
  const pct = budget ? Math.min((spent / budget) * 100, 100) : 0;
  const tint = `color-mix(in srgb, ${color || '#EC4899'} 16%, #fff)`;
  const bar = `<div class="cat-progress"><div class="cat-progress-fill" style="width:${pct}%"></div></div>`;
  if (isBig) {
    return `
      <div class="cat-card big" style="background:${tint}" onclick="${onclick}" title="${title}">
        <div class="cat-icon-wrap">${emoji}</div>
        <div class="cat-avail ${avail < 0 ? 'neg' : ''}">${formatCurrency(avail)}</div>
        <div class="cat-avail-label">disponível</div>
        ${bar}
        <div class="cat-budget-line">de ${formatCurrency(budget)}</div>
      </div>`;
  }
  return `
    <div class="cat-card small" style="background:${tint}" onclick="${onclick}" title="${title}">
      <div class="cat-icon-wrap">${emoji}</div>
      ${bar}
      <div class="cat-avail ${avail < 0 ? 'neg' : ''}">${formatCurrency(avail)}</div>
    </div>`;
}

/* Caixa "Distribuído X de Y" — usada no ecrã de Orçamentos e no formulário de Evento. */
function allocStatusHtml({ total, allocated, remainingLabel = 'Disponível para distribuir', marginBottom = 0 }) {
  if (!total) return '';
  const remaining = total - allocated;
  const pct = Math.min((allocated / total) * 100, 100);
  const barCls = remaining < 0 ? 'progress-red' : remaining / total < 0.25 ? 'progress-pink' : 'progress-gold';
  const valCls = remaining < 0 ? 'over' : remaining / total < 0.1 ? 'warn' : 'ok';
  const mb = marginBottom ? ` style="margin-bottom:${marginBottom}px"` : '';
  return `
    <div class="budget-alloc-box"${mb}>
      <div class="budget-alloc-top">
        <span class="budget-alloc-label">Distribuído</span>
        <span class="budget-alloc-value ${valCls}">${formatCurrency(allocated)} de ${formatCurrency(total)}</span>
      </div>
      <div class="progress-bar" style="margin-bottom:6px">
        <div class="progress-fill ${barCls}" style="width:${pct}%"></div>
      </div>
      <div style="font-size:12px;color:var(--text-muted)">
        ${remaining >= 0
          ? `${remainingLabel}: <b style="color:var(--gold-dark)">${formatCurrency(remaining)}</b>`
          : `<span style="color:var(--danger)">⚠️ Excede em ${formatCurrency(-remaining)}</span>`}
      </div>
    </div>`;
}
