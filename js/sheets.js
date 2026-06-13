/* ── Planilha partilhada do casal (Google Sheets = "Excel" online) ──
 * Estrutura da planilha:
 *   Despesas:   ID | Data | Descrição | Categoria | Valor | EmailPagador | NomePagador | CriadoEm
 *   Casal:      Email | Nome | Foto
 *   Orçamentos: Categoria | Orçamento
 */

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

const EXPENSE_HEADER = ['ID', 'Data', 'Descrição', 'Categoria', 'Valor', 'EmailPagador', 'NomePagador', 'CriadoEm'];

async function sheetsFetch(path, options = {}) {
  const token = await getValidToken();
  const res = await fetch(`${SHEETS_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erro Google Sheets (${res.status})`);
  }
  return res.json();
}

function extractSpreadsheetId(linkOrId) {
  if (!linkOrId) return null;
  const m = linkOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(linkOrId.trim())) return linkOrId.trim();
  return null;
}

function spreadsheetUrl(id) {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

async function createCoupleSheet(categories) {
  const data = await sheetsFetch('', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'Coinple 🪙💕 Finanças do Casal' },
      sheets: [
        { properties: { title: 'Despesas' } },
        { properties: { title: 'Casal' } },
        { properties: { title: 'Orçamentos' } },
      ],
    }),
  });
  const id = data.spreadsheetId;
  await sheetsFetch(`/${id}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        { range: 'Despesas!A1:H1', values: [EXPENSE_HEADER] },
        { range: 'Casal!A1:C1', values: [['Email', 'Nome', 'Foto']] },
        { range: 'Orçamentos!A1:B1', values: [['Categoria', 'Orçamento']] },
        { range: 'Orçamentos!A2', values: categories.map((c) => [c.id, c.budget || 0]) },
      ],
    }),
  });
  return id;
}

async function loadCoupleSheet(id) {
  const ranges = ['Despesas!A2:H', 'Casal!A2:C', 'Orçamentos!A2:B']
    .map((r) => `ranges=${encodeURIComponent(r)}`)
    .join('&');
  const data = await sheetsFetch(`/${id}/values:batchGet?${ranges}`);
  const [expRows, partnerRows, budgetRows] = (data.valueRanges || []).map((v) => v.values || []);

  const expenses = (expRows || [])
    .filter((r) => r[0])
    .map((r) => ({
      id: String(r[0]),
      date: String(r[1] || ''),
      description: String(r[2] || ''),
      category: String(r[3] || 'outros'),
      amount: parseFloat(String(r[4]).replace(',', '.')) || 0,
      payerEmail: String(r[5] || ''),
      payerName: String(r[6] || ''),
      createdAt: Number(r[7]) || 0,
    }));

  const partners = (partnerRows || [])
    .filter((r) => r[0])
    .map((r) => ({ email: String(r[0]), name: String(r[1] || r[0]), photo: String(r[2] || '') }));

  const budgets = {};
  (budgetRows || []).forEach((r) => {
    if (r[0]) budgets[String(r[0])] = parseFloat(String(r[1]).replace(',', '.')) || 0;
  });

  return { expenses, partners, budgets };
}

function expenseToRow(e) {
  return [e.id, e.date, e.description, e.category, e.amount, e.payerEmail, e.payerName, e.createdAt];
}

async function appendExpenseToSheet(id, expense) {
  await sheetsFetch(`/${id}/values/${encodeURIComponent('Despesas!A:H')}:append?valueInputOption=RAW`, {
    method: 'POST',
    body: JSON.stringify({ values: [expenseToRow(expense)] }),
  });
}

async function rewriteExpensesInSheet(id, expenses) {
  await sheetsFetch(`/${id}/values/${encodeURIComponent('Despesas!A2:H')}:clear`, { method: 'POST' });
  if (expenses.length) {
    await sheetsFetch(`/${id}/values/${encodeURIComponent('Despesas!A2')}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: expenses.map(expenseToRow) }),
    });
  }
}

async function savePartnersToSheet(id, partners) {
  await sheetsFetch(`/${id}/values/${encodeURIComponent('Casal!A2:C')}:clear`, { method: 'POST' });
  if (partners.length) {
    await sheetsFetch(`/${id}/values/${encodeURIComponent('Casal!A2')}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: partners.map((p) => [p.email, p.name, p.photo || '']) }),
    });
  }
}

async function saveBudgetsToSheet(id, categories) {
  await sheetsFetch(`/${id}/values/${encodeURIComponent('Orçamentos!A2:B')}:clear`, { method: 'POST' });
  await sheetsFetch(`/${id}/values/${encodeURIComponent('Orçamentos!A2')}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: categories.map((c) => [c.id, c.budget || 0]) }),
  });
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
      Data: e.date,
      'Descrição': e.description,
      Categoria: catName(e.category),
      'Valor (€)': e.amount,
      'Pago por': e.payerName || e.payerEmail,
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
