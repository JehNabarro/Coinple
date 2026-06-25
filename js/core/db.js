/* ── Supabase client + operações de base de dados ── */

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* ── Perfil ── */
async function getCurrentProfile() {
  const { data: { user } } = await _supabase.auth.getUser();
  if (!user) return null;
  const { data } = await _supabase
    .from('profiles')
    .select('*, couples(*)')
    .eq('id', user.id)
    .single();
  return data;
}

/* ── Setup: criar casal ── */
async function createCouple(categories, monthKey, total, categoryBudgets) {
  const { data: couple, error } = await _supabase
    .rpc('fn_create_couple', { p_total_budget: total || 0 });
  if (error) throw error;

  // Orçamento total do mês atual
  await _supabase.from('monthly_budgets').upsert(
    { couple_id: couple.id, month_key: monthKey, total_budget: total || 0 },
    { onConflict: 'couple_id,month_key' }
  );

  if (categories.length) {
    const { error: budErr } = await _supabase.from('budgets').insert(
      categories.map(c => ({
        couple_id: couple.id,
        category:  c.id,
        month_key: monthKey,
        amount:    (categoryBudgets && categoryBudgets[c.id]) || 0,
      }))
    );
    if (budErr) throw budErr;
  }
  return couple;
}

/* ── Setup: juntar casal por código ── */
async function joinCouple(inviteCode) {
  const { data: couple, error } = await _supabase
    .rpc('fn_join_couple', { p_invite_code: inviteCode });
  if (error) throw new Error(error.message);
  return couple;
}

/* ── Carregar todos os dados do casal ── */
async function loadCoupleData() {
  const profile = await getCurrentProfile();
  if (!profile?.couple_id) return { expenses: [], partners: [], monthlyBudgets: {}, legacyTotalBudget: 0, events: [] };

  const coupleId = profile.couple_id;

  const [{ data: partnerRows }, { data: expenseRows }, { data: budgetRows }, monthlyResult, eventResult] = await Promise.all([
    _supabase.from('profiles').select('id, name, email, photo_url').eq('couple_id', coupleId),
    _supabase.from('expenses').select('*').eq('couple_id', coupleId).order('date', { ascending: false }),
    _supabase.from('budgets').select('*').eq('couple_id', coupleId),
    _supabase.from('monthly_budgets').select('*').eq('couple_id', coupleId)
      .then(r => r).catch(() => ({ data: [] })),
    _supabase.from('couple_events').select('*').eq('couple_id', coupleId).order('start_date', { ascending: true })
      .then(r => r).catch(() => ({ data: [] })),
  ]);

  const partners = (partnerRows || []).map(p => ({
    id:    p.id,
    email: p.email || '',
    name:  p.name  || p.email || '',
    photo: p.photo_url || '',
  }));

  const emailById = Object.fromEntries(partners.map(p => [p.id, p.email]));

  const expenses = (expenseRows || []).map(r => ({
    id:          r.id,
    amount:      parseFloat(r.amount),
    description: r.description || '',
    category:    r.category,
    payerEmail:  emailById[r.payer_id] || '',
    payerName:   r.payer_name || '',
    date:        r.date,
    createdAt:   new Date(r.created_at).getTime(),
    ...(r.event_id ? { eventId: r.event_id } : {}),
  }));

  // Orçamentos por mês: { 'YYYY-MM': { total, categoryBudgets: { catId: amount } } }
  const _now = new Date();
  const _fallbackMk = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyBudgets = {};
  const ensureMk = (mk) => (monthlyBudgets[mk] = monthlyBudgets[mk] || { total: 0, categoryBudgets: {} });

  (budgetRows || []).forEach(r => {
    const mk = r.month_key || _fallbackMk;
    ensureMk(mk).categoryBudgets[r.category] = parseFloat(r.amount) || 0;
  });
  (monthlyResult?.data || []).forEach(r => {
    ensureMk(r.month_key).total = parseFloat(r.total_budget) || 0;
  });

  // total_budget legado (em couples) — só para migração se não houver linha mensal ainda
  const legacyTotalBudget = parseFloat(profile.couples?.total_budget || 0);

  const events = ((eventResult?.data) || []).map(r => ({
    id:          r.id,
    name:        r.name,
    emoji:       r.emoji || '🎉',
    totalBudget: parseFloat(r.total_budget) || 0,
    startDate:   r.start_date,
    endDate:     r.end_date,
    categories:  Array.isArray(r.categories) ? r.categories : (typeof r.categories === 'string' ? JSON.parse(r.categories) : []),
    createdAt:   new Date(r.created_at).getTime(),
  }));

  return { expenses, partners, monthlyBudgets, legacyTotalBudget, events };
}

/* ── Despesas ── */

// Upsert com fallback progressivo para BDs com schema desatualizado:
// Tentativa 1: payload completo (event_id + payer_name)
// Tentativa 2: sem event_id (coluna pode não existir ou evento não sincronizado)
// Tentativa 3: sem event_id nem payer_name (schema muito antigo)
async function _upsertExpense(payload) {
  let { error } = await _supabase.from('expenses').upsert(payload);
  if (!error) return;

  const { event_id: _ev, ...noEvent } = payload;
  ({ error } = await _supabase.from('expenses').upsert(noEvent));
  if (!error) return;

  const { payer_name: _pn, ...minimal } = noEvent;
  ({ error } = await _supabase.from('expenses').upsert(minimal));
  if (error) {
    console.error('Supabase expense upsert failed:', error);
    throw error;
  }
}

async function appendExpenseToDb(coupleId, expense, payerId) {
  await _upsertExpense({
    id:          expense.id,
    couple_id:   coupleId,
    event_id:    expense.eventId || null,
    amount:      expense.amount,
    description: expense.description,
    category:    expense.category,
    payer_id:    payerId,
    payer_name:  expense.payerName,
    date:        expense.date,
  });
}

async function updateExpenseInDb(expense, payerId, coupleId) {
  await _upsertExpense({
    id:          expense.id,
    couple_id:   coupleId,
    event_id:    expense.eventId || null,
    amount:      expense.amount,
    description: expense.description,
    category:    expense.category,
    payer_id:    payerId,
    payer_name:  expense.payerName,
    date:        expense.date,
  });
}

async function deleteExpenseFromDb(expenseId) {
  const { error } = await _supabase.from('expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

/* ── Orçamentos (por mês) ── */
async function saveBudgetsToDb(coupleId, categories, monthKey, total, categoryBudgets) {
  const rows = categories.map(c => ({
    couple_id: coupleId,
    category:  c.id,
    month_key: monthKey,
    amount:    (categoryBudgets && categoryBudgets[c.id]) || 0,
  }));
  const { error: budErr } = await _supabase
    .from('budgets')
    .upsert(rows, { onConflict: 'couple_id,category,month_key' });
  if (budErr) throw budErr;

  const { error: totErr } = await _supabase
    .from('monthly_budgets')
    .upsert(
      { couple_id: coupleId, month_key: monthKey, total_budget: total || 0 },
      { onConflict: 'couple_id,month_key' }
    );
  if (totErr) throw totErr;
}

/* ── Perfil ── */
async function updateProfileInDb({ id, name, photo }) {
  const { error } = await _supabase
    .from('profiles')
    .update({ name, photo_url: photo })
    .eq('id', id);
  if (error) throw error;
}

/* ── Realtime ── */
function subscribeToCouple(coupleId, onChange) {
  return _supabase.channel(`couple-${coupleId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'expenses',
      filter: `couple_id=eq.${coupleId}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'budgets',
      filter: `couple_id=eq.${coupleId}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'monthly_budgets',
      filter: `couple_id=eq.${coupleId}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'profiles',
      filter: `couple_id=eq.${coupleId}`,
    }, onChange)
    .subscribe();
}

/* ── Eventos ── */
async function saveEventToDb(coupleId, event) {
  const { error } = await _supabase.from('couple_events').upsert({
    id:           event.id,
    couple_id:    coupleId,
    name:         event.name,
    emoji:        event.emoji || '🎉',
    total_budget: event.totalBudget || 0,
    start_date:   event.startDate,
    end_date:     event.endDate,
    categories:   event.categories || [],
  });
  if (error) throw error;
}

async function deleteEventFromDb(eventId) {
  const { error } = await _supabase.from('couple_events').delete().eq('id', eventId);
  if (error) throw error;
}

/* ── Exportar .xlsx (download local) ── */
function exportExpensesXlsx(expenses, categories, partners) {
  if (typeof XLSX === 'undefined') {
    throw new Error('Biblioteca Excel ainda a carregar, tenta de novo.');
  }
  const catName = (cid) => categories.find((c) => c.id === cid)?.name || cid;
  const rows = [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => ({
      Data:        e.date,
      'Descrição': e.description,
      Categoria:   catName(e.category),
      'Valor (€)': e.amount,
      'Pago por':  e.payerName || e.payerEmail,
    }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Despesas');

  const casalRows = partners.map((p) => ({ Nome: p.name, Email: p.email }));
  const ws2 = XLSX.utils.json_to_sheet(casalRows.length ? casalRows : [{ Nome: '', Email: '' }]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Casal');

  XLSX.writeFile(wb, 'Coinple.xlsx');
}
