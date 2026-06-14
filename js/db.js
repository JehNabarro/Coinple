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
async function createCouple(categories, totalBudget) {
  const { data: couple, error } = await _supabase
    .rpc('fn_create_couple', { p_total_budget: totalBudget || 0 });
  if (error) throw error;

  if (categories.length) {
    const { error: budErr } = await _supabase.from('budgets').insert(
      categories.map(c => ({ couple_id: couple.id, category: c.id, amount: c.budget || 0 }))
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
  if (!profile?.couple_id) return { expenses: [], partners: [], budgets: {}, totalBudget: 0 };

  const coupleId = profile.couple_id;

  const [{ data: partnerRows }, { data: expenseRows }, { data: budgetRows }] = await Promise.all([
    _supabase.from('profiles').select('id, name, email, photo_url').eq('couple_id', coupleId),
    _supabase.from('expenses').select('*').eq('couple_id', coupleId).order('date', { ascending: false }),
    _supabase.from('budgets').select('*').eq('couple_id', coupleId),
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
  }));

  const budgets = {};
  (budgetRows || []).forEach(r => { budgets[r.category] = parseFloat(r.amount); });

  const totalBudget = parseFloat(profile.couples?.total_budget || 0);

  return { expenses, partners, budgets, totalBudget };
}

/* ── Despesas ── */
async function appendExpenseToDb(coupleId, expense, payerId) {
  const { error } = await _supabase.from('expenses').insert({
    id:          expense.id,
    couple_id:   coupleId,
    amount:      expense.amount,
    description: expense.description,
    category:    expense.category,
    payer_id:    payerId,
    payer_name:  expense.payerName,
    date:        expense.date,
  });
  if (error) throw error;
}

async function updateExpenseInDb(expense, payerId) {
  const { error } = await _supabase.from('expenses').update({
    amount:      expense.amount,
    description: expense.description,
    category:    expense.category,
    payer_id:    payerId,
    payer_name:  expense.payerName,
    date:        expense.date,
  }).eq('id', expense.id);
  if (error) throw error;
}

async function deleteExpenseFromDb(expenseId) {
  const { error } = await _supabase.from('expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

/* ── Orçamentos ── */
async function saveBudgetsToDb(coupleId, categories, totalBudget) {
  const rows = categories.map(c => ({ couple_id: coupleId, category: c.id, amount: c.budget || 0 }));
  const { error: budErr } = await _supabase
    .from('budgets')
    .upsert(rows, { onConflict: 'couple_id,category' });
  if (budErr) throw budErr;

  const { error: coupleErr } = await _supabase
    .from('couples')
    .update({ total_budget: totalBudget || 0 })
    .eq('id', coupleId);
  if (coupleErr) throw coupleErr;
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
      event: '*', schema: 'public', table: 'profiles',
      filter: `couple_id=eq.${coupleId}`,
    }, onChange)
    .subscribe();
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
