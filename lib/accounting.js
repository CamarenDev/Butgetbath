// Built-in bookkeeping: income, expenses, payroll and contractor reports, job costing, tax estimates, deadlines,
// a legal and compliance register, and year-end exports (CSV files and a ZIP "accountant packet").
// Cash basis, money in cents. It prepares and organizes the numbers; it does not file anything, and filing
// decisions (and payroll withholding) should be confirmed with a CPA.
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const zlib = require('node:zlib');
const { detectFile } = require('./customers');
const { Pdf } = require('./pdf');

const COMPANY = 'Budget Bath Solutions';
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Expense categories mapped to the IRS Schedule C line they normally land on (sole proprietor or single-member LLC).
const CATEGORIES = {
  materials: ['Materials and supplies for jobs', 'Part III, line 36 (purchases)', 100],
  subcontractors: ['Subcontractors and contract labor', 'Line 11', 100],
  dump_fees: ['Dumpsters, dump fees and hauling', 'Line 27a (other)', 100],
  tools: ['Small tools and equipment', 'Line 22 (supplies) or line 13 (depreciation)', 100],
  equipment_rental: ['Equipment and truck rental', 'Line 20a', 100],
  vehicle: ['Vehicle: fuel, repairs, tolls, parking', 'Line 9', 100],
  mileage: ['Business mileage (standard rate)', 'Line 9', 100],
  insurance: ['Insurance (liability, workers comp, auto)', 'Line 15', 100],
  licenses: ['Licenses, permits and bonds', 'Line 23', 100],
  legal_prof: ['Legal and accounting fees', 'Line 17', 100],
  advertising: ['Advertising and marketing', 'Line 8', 100],
  software: ['Software and subscriptions', 'Line 18 or 27a', 100],
  office: ['Office expense', 'Line 18', 100],
  phone_utilities: ['Phone and utilities', 'Line 25', 100],
  rent: ['Shop or storage rent', 'Line 20b', 100],
  fees: ['Bank and payment processing fees', 'Line 10 or 27a', 100],
  training: ['Training and certifications', 'Line 27a', 100],
  travel: ['Business travel', 'Line 24a', 100],
  meals: ['Business meals (50% deductible)', 'Line 24b', 50],
  interest: ['Business loan interest', 'Line 16b', 100],
  other: ['Other business expense', 'Line 27a', 100]
};
const PAY_METHODS = ['card', 'check', 'cash', 'bank', 'other'];
const WORKER_TYPES = { employee: 'Employee (W-2)', contractor: 'Independent contractor (1099)' };
const ENTITIES = { sole_prop: 'Sole proprietor / single-member LLC (Schedule C)', partnership: 'Partnership / multi-member LLC (1065)', s_corp: 'S corporation (1120-S)', c_corp: 'C corporation (1120)' };
const DOC_KINDS = {
  formation: 'Business formation (articles, certificate)', ein: 'EIN letter (IRS CP 575)', operating: 'Operating agreement / bylaws', license: 'Contractor, trade or city license',
  insurance_gl: 'General liability insurance', insurance_wc: 'Workers compensation insurance', insurance_auto: 'Commercial auto insurance', bond: 'License or surety bond',
  epa_rrp: 'EPA Lead-Safe (RRP) firm certification', registration: 'State or city business registration', tax_registration: 'State tax registration (payroll, sales and use)',
  contract_template: 'Customer contract template', lien_waiver: 'Lien waiver forms', warranty: 'Warranty policy', handbook: 'Employee handbook', safety: 'Safety program (OSHA)', other: 'Other'
};
// What a remodeling contractor normally keeps on file. Status comes from the register below; edit the register to match your jurisdictions.
const REQUIRED_DOCS = [
  ['formation', 'Business formation filed with the state'], ['ein', 'EIN letter from the IRS'], ['registration', 'City / county business registration'], ['license', 'Contractor and trade licenses for your city and state'],
  ['insurance_gl', 'General liability insurance certificate'], ['insurance_wc', 'Workers compensation insurance (or exemption)'], ['insurance_auto', 'Commercial auto insurance'], ['epa_rrp', 'EPA Lead-Safe (RRP) certification for pre-1978 homes'],
  ['tax_registration', 'State payroll and sales/use tax registration'], ['contract_template', 'Customer contract with required notices'], ['lien_waiver', 'Lien waiver forms'], ['warranty', 'Written warranty policy'], ['safety', 'OSHA safety program and training records']
];
const DEFAULTS = { business_name: COMPANY, ein: '', entity: 'sole_prop', income_tax_pct: '15', payroll_tax_pct: '7.65', mileage_rate: '0.725', state: 'IL', fiscal_year_start: '01' };

const dollars = c => (c / 100).toFixed(2);
const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (heads, rows) => `\ufeff${[heads, ...rows].map(r => r.map(cell).join(',')).join('\r\n')}\r\n`;
const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const cents = v => { const n = Number(v); return v !== '' && v !== null && Number.isFinite(n) && n >= 0 && n <= 10000000 ? Math.round(n * 100) : null; };

// Minimal ZIP writer (stored, no compression) so the packet needs no dependency.
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name), body = Buffer.isBuffer(data) ? data : Buffer.from(data), crc = zlib.crc32(body);
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(0, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(body.length, 22); head.writeUInt16LE(nameBuf.length, 26);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(body.length, 20); dir.writeUInt32LE(body.length, 24); dir.writeUInt16LE(nameBuf.length, 28); dir.writeUInt32LE(offset, 42);
    parts.push(head, nameBuf, body); central.push(dir, nameBuf);
    offset += head.length + nameBuf.length + body.length;
  }
  const dirBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dirBuf, end]);
}

function createAccounting({ db, dataDir, estimates, json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text }) {
  const q = sql => db.prepare(sql);
  const nowIso = () => new Date().toISOString();
  const cfg = () => ({ ...DEFAULTS, ...Object.fromEntries(q("SELECT key, value FROM settings WHERE key LIKE 'acct_%'").all().map(r => [r.key.slice(5), r.value])) });
  const yearOf = raw => { const y = Number(raw); return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear(); };
  const inYear = (col, y) => `${col} >= '${y}-01-01' AND ${col} <= '${y}-12-31'`;
  const pct = (n, p) => Math.round(n * p / 100);

  // ---------- Income
  function incomeRows(y) {
    const rows = q(`SELECT p.id, p.estimate_id, p.amount_cents, p.method, p.memo, p.paid_on, e.number, e.title, e.job_id, e.customer_id, c.name AS customer FROM estimate_payments p JOIN estimates e ON e.id = p.estimate_id LEFT JOIN customers c ON c.id = e.customer_id WHERE ${inYear('p.paid_on', y)} ORDER BY p.paid_on, p.id`).all();
    const ratio = new Map();
    return rows.map(r => {
      if (!ratio.has(r.estimate_id)) {
        const est = q('SELECT * FROM estimates WHERE id = ?').get(r.estimate_id), t = est && estimates.calc(est).totals;
        ratio.set(r.estimate_id, t && t.totalCents > 0 ? t.taxCents / t.totalCents : 0);
      }
      const tax = Math.round(r.amount_cents * ratio.get(r.estimate_id));
      return { ...r, taxCents: tax, netCents: r.amount_cents - tax };
    });
  }

  // ---------- Expenses, payroll and contractors
  const expenseRows = y => q(`SELECT x.*, j.title AS job_title FROM expenses x LEFT JOIN jobs j ON j.id = x.job_id WHERE ${inYear('x.spent_on', y)} ORDER BY x.spent_on, x.id`).all();
  const deductible = x => pct(x.amount_cents, x.deductible_pct);
  const workerPay = y => q(`SELECT e.id, u.name, u.email, e.worker_type, e.tax_id_last4, e.w9_on, e.w4_on, e.i9_on, SUM(p.amount_cents) AS paid, COUNT(p.id) AS n FROM employees e JOIN users u ON u.id = e.user_id LEFT JOIN payments p ON p.employee_id = e.id AND ${inYear('p.paid_on', y)} GROUP BY e.id ORDER BY u.name`).all();
  const threshold1099 = y => y >= 2026 ? 200000 : 60000;

  function summary(y) {
    const s = cfg(), inc = incomeRows(y), exp = expenseRows(y), workers = workerPay(y);
    const gross = inc.reduce((n, r) => n + r.amount_cents, 0), salesTax = inc.reduce((n, r) => n + r.taxCents, 0), revenue = gross - salesTax;
    const byCat = {};
    for (const x of exp) { const c = byCat[x.category] ||= { spent: 0, deductible: 0, n: 0 }; c.spent += x.amount_cents; c.deductible += deductible(x); c.n++; }
    const wages = workers.filter(w => w.worker_type === 'employee').reduce((n, w) => n + (w.paid || 0), 0);
    const contractors = workers.filter(w => w.worker_type === 'contractor').reduce((n, w) => n + (w.paid || 0), 0);
    const employerTax = pct(wages, Number(s.payroll_tax_pct) || 0);
    const expenseTotal = Object.values(byCat).reduce((n, c) => n + c.deductible, 0);
    const totalExpenses = expenseTotal + wages + contractors + employerTax;
    const net = revenue - totalExpenses;
    const pass = ['sole_prop', 'partnership'].includes(s.entity);
    // Self-employment tax: 92.35% of net, 12.4% Social Security up to the wage base plus 2.9% Medicare.
    const seBase = pass ? Math.max(0, Math.round(net * 0.9235)) : 0, ssBase = 184500 * 100;
    const seTax = Math.round(Math.min(seBase, ssBase) * 0.124 + seBase * 0.029);
    const taxable = Math.max(0, net - Math.round(seTax / 2));
    const incomeTax = pct(taxable, Number(s.income_tax_pct) || 0);
    const owed = seTax + incomeTax;
    const months = Array.from({ length: 12 }, (_, i) => {
      const k = `${y}-${String(i + 1).padStart(2, '0')}`;
      const rev = inc.filter(r => r.paid_on.startsWith(k)).reduce((n, r) => n + r.netCents, 0);
      const out = exp.filter(r => r.spent_on.startsWith(k)).reduce((n, r) => n + deductible(r), 0)
        + q(`SELECT COALESCE(SUM(amount_cents), 0) AS c FROM payments WHERE paid_on LIKE ?`).get(`${k}%`).c;
      return { month: k, revenueCents: rev, expenseCents: out, profitCents: rev - out };
    });
    return {
      year: y, basis: 'cash', grossReceiptsCents: gross, salesTaxCollectedCents: salesTax, revenueCents: revenue,
      expenses: Object.entries(byCat).map(([k, v]) => ({ category: k, label: CATEGORIES[k]?.[0] || k, scheduleC: CATEGORIES[k]?.[1] || '', spentCents: v.spent, deductibleCents: v.deductible, count: v.n })).sort((a, b) => b.deductibleCents - a.deductibleCents),
      wagesCents: wages, contractorCents: contractors, employerTaxCents: employerTax, expenseTotalCents: totalExpenses, netProfitCents: net,
      tax: { entity: s.entity, selfEmploymentCents: seTax, incomeTaxCents: incomeTax, totalCents: owed, quarterlyCents: Math.round(owed / 4), note: pass ? 'Estimate only: uses your effective income-tax rate from settings.' : 'This entity type does not pay self-employment tax on profit; owners are paid by wages or distributions. Ask your CPA for estimated payments.' },
      months
    };
  }

  function jobCosts(y) {
    const jobs = q(`SELECT DISTINCT j.id, j.title, j.status, j.address FROM jobs j WHERE j.id IN (SELECT job_id FROM estimates WHERE job_id IS NOT NULL) OR j.id IN (SELECT job_id FROM expenses WHERE job_id IS NOT NULL) OR j.id IN (SELECT job_id FROM time_entries WHERE job_id IS NOT NULL) ORDER BY j.id DESC`).all();
    return jobs.map(j => {
      const ests = q("SELECT * FROM estimates WHERE job_id = ? AND status != 'void' AND status != 'declined'").all(j.id);
      let contract = 0, taxTotal = 0; const ids = ests.map(e => e.id);
      for (const e of ests) { const t = estimates.calc(e).totals; contract += t.totalCents; taxTotal += t.taxCents; }
      const paid = ids.length ? q(`SELECT COALESCE(SUM(amount_cents), 0) AS c FROM estimate_payments WHERE estimate_id IN (${ids.join(',')})`).get().c : 0;
      const labor = q("SELECT COALESCE(SUM(minutes * CASE WHEN t.rate_cents > 0 THEN t.rate_cents ELSE e.rate_cents END / 60.0), 0) AS c, COALESCE(SUM(minutes), 0) AS m FROM time_entries t JOIN employees e ON e.id = t.employee_id WHERE t.job_id = ? AND t.status = 'approved'").get(j.id);
      const costs = q('SELECT amount_cents, deductible_pct FROM expenses WHERE job_id = ?').all(j.id).reduce((n, x) => n + x.amount_cents, 0);
      const revenue = contract - taxTotal, profit = revenue - Math.round(labor.c) - costs;
      return { id: j.id, title: j.title, status: j.status, contractCents: contract, salesTaxCents: taxTotal, paidCents: paid, balanceCents: Math.max(0, contract - paid), laborMinutes: labor.m, laborCents: Math.round(labor.c), costCents: costs, profitCents: profit, marginPct: revenue > 0 ? Math.round(profit / revenue * 1000) / 10 : null };
    });
  }

  function contractors1099(y) {
    const min = threshold1099(y);
    return workerPay(y).filter(w => w.worker_type === 'contractor').map(w => ({ id: w.id, name: w.name, paidCents: w.paid || 0, thresholdCents: min, needs1099: (w.paid || 0) >= min, w9: Boolean(w.w9_on), taxIdLast4: w.tax_id_last4 }));
  }

  // ---------- Deadlines and alerts
  function deadlines(y) {
    // Due dates that land on a weekend (or Jan 15 on Martin Luther King Jr. Day) move to the next business day.
    const due = iso => { let t = Date.parse(`${iso}T12:00:00Z`); const k = new Date(t); if (k.getUTCDay() === 1 && iso.endsWith('-01-15')) t += 864e5; while ([0, 6].includes(new Date(t).getUTCDay())) t += 864e5; return new Date(t).toISOString().slice(0, 10); };
    const d = (date, name, note) => ({ date: due(date), name, note });
    return [
      d(`${y}-01-15`, 'Q4 estimated tax payment (prior year)', 'Form 1040-ES, for sole proprietors and members of pass-through entities.'),
      d(`${y}-01-31`, 'W-2s, 1099-NEC, and Form 940 / Q4 Form 941', 'Give W-2s to employees, file W-2/W-3, and send 1099-NEC to contractors and the IRS.'),
      d(`${y}-03-15`, 'S corporation and partnership returns (1120-S, 1065)', 'Due March 15 (next business day if it falls on a weekend); extension available with Form 7004.'),
      d(`${y}-04-15`, 'Individual or C-corp return and Q1 estimated tax', 'Form 1040 with Schedule C and SE, or 1120. Extension with Form 4868.'),
      d(`${y}-04-30`, 'Q1 payroll tax return (Form 941)', 'Also state payroll returns and unemployment filings.'),
      d(`${y}-06-15`, 'Q2 estimated tax payment', 'Form 1040-ES.'),
      d(`${y}-07-31`, 'Q2 payroll tax return (Form 941)', ''),
      d(`${y}-09-15`, 'Q3 estimated tax payment', 'Form 1040-ES.'),
      d(`${y}-10-31`, 'Q3 payroll tax return (Form 941)', ''),
      d(`${y}-12-31`, 'Year-end: collect W-9s, review mileage log, buy and place equipment in service', 'Make sure every contractor you will pay $2,000 or more has a W-9.')
    ];
  }

  function register() {
    const docs = q('SELECT * FROM business_docs ORDER BY kind, id').all().map(d => ({ id: d.id, kind: d.kind, kindLabel: DOC_KINDS[d.kind] || d.kind, title: d.title, number: d.number, authority: d.authority, issuedOn: d.issued_on, expiresOn: d.expires_on, notes: d.notes, hasFile: Boolean(d.file) }));
    const today = nowIso().slice(0, 10), soon = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    const state = d => !d.expiresOn ? 'ok' : d.expiresOn < today ? 'expired' : d.expiresOn <= soon ? 'expiring' : 'ok';
    const checklist = REQUIRED_DOCS.map(([kind, label]) => {
      const have = docs.filter(d => d.kind === kind);
      const bad = have.find(d => state(d) === 'expired'), warn = have.find(d => state(d) === 'expiring');
      return { kind, label, status: !have.length ? 'missing' : bad ? 'expired' : warn ? 'expiring' : 'on file', count: have.length };
    });
    return { docs: docs.map(d => ({ ...d, state: state(d) })), checklist };
  }

  function alerts(y, sum, reg) {
    const out = [];
    const add = (level, message) => out.push({ level, message });
    for (const c of reg.checklist) if (c.status !== 'on file') add(c.status === 'missing' ? 'warning' : 'danger', `${c.label}: ${c.status}.`);
    for (const c of contractors1099(y)) {
      if (!c.w9) add('warning', `${c.name} is set as a contractor but has no W-9 on file.`);
      if (c.needs1099) add('info', `${c.name} was paid ${'$' + dollars(c.paidCents)}: a 1099-NEC is required by January 31.`);
    }
    for (const w of workerPay(y)) if (w.worker_type === 'employee' && (!w.w4_on || !w.i9_on)) add('warning', `${w.name} is missing ${[!w.w4_on && 'a W-4', !w.i9_on && 'an I-9'].filter(Boolean).join(' and ')}.`);
    const noReceipt = q(`SELECT COUNT(*) AS n FROM expenses WHERE ${inYear('spent_on', y)} AND receipt_file = '' AND amount_cents >= 7500`).get().n;
    if (noReceipt) add('warning', `${noReceipt} expense${noReceipt === 1 ? '' : 's'} of $75 or more has no receipt attached (the IRS expects one).`);
    const unpaid = q("SELECT COUNT(*) AS n FROM time_entries WHERE status = 'approved'").get().n && q('SELECT COALESCE(SUM(minutes * CASE WHEN t.rate_cents > 0 THEN t.rate_cents ELSE e.rate_cents END / 60.0), 0) AS c FROM time_entries t JOIN employees e ON e.id = t.employee_id WHERE t.status = \'approved\'').get().c;
    const paidAll = q('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM payments').get().c;
    if (unpaid - paidAll > 10000) add('info', `Approved labor exceeds payments recorded by about $${dollars(Math.round(unpaid - paidAll))}. Record payments so payroll totals are right.`);
    if (!cfg().ein) add('info', 'Add your EIN in the accounting settings so it appears on exports.');
    if (sum.netProfitCents > 0) add('info', `Set aside about $${dollars(sum.tax.quarterlyCents)} each quarter for estimated taxes.`);
    const next = deadlines(y).find(d => d.date >= nowIso().slice(0, 10));
    if (next) add('info', `Next deadline: ${next.name} on ${next.date}.`);
    return out;
  }

  // ---------- Exports
  function exportFiles(y) {
    const s = cfg(), sum = summary(y), inc = incomeRows(y), exp = expenseRows(y), reg = register();
    const files = {};
    files['income.csv'] = csv(['Date', 'Estimate', 'Customer', 'Description', 'Method', 'Gross received', 'Sales tax collected', 'Net revenue', 'Memo'], inc.map(r => [r.paid_on, r.number, r.customer, r.title, r.method, dollars(r.amount_cents), dollars(r.taxCents), dollars(r.netCents), r.memo]));
    files['expenses.csv'] = csv(['Date', 'Vendor', 'Category', 'Schedule C line', 'Job', 'Payment method', 'Amount', 'Deductible %', 'Deductible amount', 'Miles', 'Receipt on file', 'Memo'], exp.map(x => [x.spent_on, x.vendor, CATEGORIES[x.category]?.[0] || x.category, CATEGORIES[x.category]?.[1] || '', x.job_title || '', x.payment_method, dollars(x.amount_cents), x.deductible_pct, dollars(deductible(x)), x.miles || '', x.receipt_file ? 'yes' : 'no', x.memo]));
    files['mileage-log.csv'] = csv(['Date', 'Purpose', 'Job', 'Miles', 'Rate', 'Deduction'], exp.filter(x => x.miles > 0).map(x => [x.spent_on, x.vendor || x.memo, x.job_title || '', x.miles, s.mileage_rate, dollars(x.amount_cents)]));
    files['payroll-and-contractor-payments.csv'] = csv(['Date', 'Name', 'Type', 'Amount', 'Method', 'Memo'], q(`SELECT p.paid_on, u.name, e.worker_type, p.amount_cents, p.method, p.memo FROM payments p JOIN employees e ON e.id = p.employee_id JOIN users u ON u.id = e.user_id WHERE ${inYear('p.paid_on', y)} ORDER BY p.paid_on, p.id`).all().map(r => [r.paid_on, r.name, WORKER_TYPES[r.worker_type], dollars(r.amount_cents), r.method, r.memo]));
    files['w2-wage-summary.csv'] = csv(['Employee', 'Gross wages paid', 'W-4 on file', 'I-9 on file', 'SSN/TIN last 4', 'Note'], workerPay(y).filter(w => w.worker_type === 'employee').map(w => [w.name, dollars(w.paid || 0), w.w4_on || 'MISSING', w.i9_on || 'MISSING', w.tax_id_last4, 'Gross only. Withholding and employer taxes come from your payroll provider.']));
    files['1099-nec-worksheet.csv'] = csv(['Contractor', 'Paid in year', 'Threshold', '1099-NEC required', 'W-9 on file', 'TIN last 4'], contractors1099(y).map(c => [c.name, dollars(c.paidCents), dollars(c.thresholdCents), c.needs1099 ? 'YES' : 'no', c.w9 ? 'yes' : 'MISSING', c.taxIdLast4]));
    files['jobs.csv'] = csv(['Job #', 'Title', 'Status', 'Contract total', 'Sales tax', 'Paid', 'Balance', 'Labor hours', 'Labor cost', 'Other job costs', 'Profit', 'Margin %'], jobCosts(y).map(j => [j.id, j.title, j.status, dollars(j.contractCents), dollars(j.salesTaxCents), dollars(j.paidCents), dollars(j.balanceCents), (j.laborMinutes / 60).toFixed(2), dollars(j.laborCents), dollars(j.costCents), dollars(j.profitCents), j.marginPct ?? '']));
    files['profit-and-loss.csv'] = csv(['Line', 'Amount'], [['Gross receipts', dollars(sum.grossReceiptsCents)], ['Less sales tax collected', dollars(sum.salesTaxCollectedCents)], ['Net revenue', dollars(sum.revenueCents)],
      ...sum.expenses.map(e => [`${e.label} (${e.scheduleC})`, dollars(e.deductibleCents)]), ['Employee wages paid', dollars(sum.wagesCents)], ['Contract labor paid', dollars(sum.contractorCents)], ['Employer payroll taxes (estimate)', dollars(sum.employerTaxCents)], ['Total expenses', dollars(sum.expenseTotalCents)], ['Net profit', dollars(sum.netProfitCents)]]);
    files['general-journal.csv'] = csv(['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit'], [
      ...inc.map(r => [r.paid_on, 'Income', r.number, `${r.customer || ''} ${r.title}`.trim(), dollars(r.amount_cents), '']),
      ...exp.map(x => [x.spent_on, 'Expense', x.vendor, CATEGORIES[x.category]?.[0] || x.category, '', dollars(x.amount_cents)]),
      ...q(`SELECT p.paid_on, u.name, p.amount_cents FROM payments p JOIN employees e ON e.id = p.employee_id JOIN users u ON u.id = e.user_id WHERE ${inYear('p.paid_on', y)}`).all().map(p => [p.paid_on, 'Labor', p.name, 'Labor payment', '', dollars(p.amount_cents)])].sort((a, b) => a[0].localeCompare(b[0])));
    files['legal-and-compliance-register.csv'] = csv(['Document', 'Kind', 'Number', 'Issued by', 'Issued', 'Expires', 'State', 'Notes'], reg.docs.map(d => [d.title, d.kindLabel, d.number, d.authority, d.issuedOn, d.expiresOn, d.state, d.notes]));
    files['compliance-checklist.csv'] = csv(['Requirement', 'Status'], reg.checklist.map(c => [c.label, c.status]));
    files['signed-agreements.csv'] = csv(['Estimate / contract', 'Title', 'Status', 'Signed by', 'Signed at', 'Signed total', 'Document hash'], q("SELECT number, title, status, signed_name, signed_at, signed_total_cents, signed_hash FROM estimates WHERE signed_at IS NOT NULL ORDER BY signed_at").all().map(e => [e.number, e.title, e.status, e.signed_name, e.signed_at, dollars(e.signed_total_cents || 0), e.signed_hash]));
    files['job-liability-records.csv'] = csv(['Job #', 'Date', 'Type', 'Homeowner', 'Agreed', 'Description', 'Reviewed by'], q('SELECT job_id, created_at, type, homeowner_name, consented, description, reviewed_by FROM job_liabilities ORDER BY created_at').all().map(l => [l.job_id, l.created_at, l.type, l.homeowner_name, l.consented ? 'yes' : 'NO', l.description, l.reviewed_by]));
    return { files, sum, s };
  }

  function summaryPdf(y, sum, s) {
    const m = c => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pdf = new Pdf({ title: `${y} Tax and accounting summary`, author: s.business_name, footer: `${s.business_name} \u00b7 ${y} accountant summary` });
    pdf.text(s.business_name, { size: 18, bold: true, gap: 0 });
    pdf.text(`${y} accountant summary \u00b7 cash basis${s.ein ? ` \u00b7 EIN ${s.ein}` : ''} \u00b7 ${ENTITIES[s.entity] || ''}`, { size: 11, gray: 0.35 });
    pdf.rule(0.3);
    pdf.heading('Profit and loss', 12);
    pdf.table([['Gross receipts', m(sum.grossReceiptsCents)], ['Sales tax collected', m(sum.salesTaxCollectedCents)], ['Net revenue', m(sum.revenueCents)], ...sum.expenses.map(e => [`${e.label} (${e.scheduleC})`, m(e.deductibleCents)]),
      ['Employee wages', m(sum.wagesCents)], ['Contract labor', m(sum.contractorCents)], ['Employer payroll taxes (estimate)', m(sum.employerTaxCents)], ['Total expenses', m(sum.expenseTotalCents)], ['Net profit', m(sum.netProfitCents)]]);
    pdf.heading('Estimated taxes', 12);
    pdf.table([['Self-employment tax', m(sum.tax.selfEmploymentCents)], ['Income tax (at your effective rate)', m(sum.tax.incomeTaxCents)], ['Total estimated', m(sum.tax.totalCents)], ['Per quarter', m(sum.tax.quarterlyCents)]]);
    pdf.text(`${sum.tax.note} These are planning estimates, not tax advice.`, { size: 9, italic: true, gray: 0.35 });
    pdf.heading('Contractors (1099-NEC)', 12);
    const c = contractors1099(y);
    pdf.table(c.length ? c.map(x => [x.name, m(x.paidCents), x.needs1099 ? '1099 required' : 'under threshold', x.w9 ? 'W-9 on file' : 'W-9 MISSING']) : [['None', '', '', '']]);
    return pdf.build();
  }

  // ---------- Files
  const fileDir = path.join(dataDir, 'uploads');
  async function storeFile(req, res) {
    const data = await readBuffer(req, MAX_FILE_BYTES);
    if (data === null) { fail(res, 413, 'Files must be 25 MB or smaller.'); return null; }
    const kind = detectFile(data);
    if (!kind) { fail(res, 415, 'Please upload a JPG, PNG, WebP or PDF file.'); return null; }
    const id = crypto.randomBytes(16).toString('hex') + kind.ext;
    await fs.writeFile(path.join(fileDir, id), data, { mode: 0o600 });
    return { file: id, mime: kind.mime };
  }

  async function handle(req, res, pathname, method) {
    if (!pathname.startsWith('/api/admin/accounting')) return false;
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    if (!isAdmin(user)) { fail(res, 403, 'Admin access required.'); return true; }
    const url = new URL(req.url, 'http://x'), y = yearOf(url.searchParams.get('year'));
    const sub = pathname.slice('/api/admin/accounting'.length);

    if (method === 'GET' && sub === '') {
      const sum = summary(y), reg = register();
      json(res, 200, {
        year: y, settings: cfg(), entities: ENTITIES, categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, { label: v[0], line: v[1], pct: v[2] }])), docKinds: DOC_KINDS, workerTypes: WORKER_TYPES, payMethods: PAY_METHODS,
        summary: sum, alerts: alerts(y, sum, reg), deadlines: deadlines(y), compliance: reg, jobs: jobCosts(y), contractors: contractors1099(y), workers: workerPay(y).map(w => ({ id: w.id, name: w.name, type: w.worker_type, paidCents: w.paid || 0, last4: w.tax_id_last4, w4: w.w4_on, w9: w.w9_on, i9: w.i9_on })),
        expenses: expenseRows(y).map(x => ({ id: x.id, date: x.spent_on, vendor: x.vendor, category: x.category, amountCents: x.amount_cents, deductiblePct: x.deductible_pct, jobId: x.job_id, jobTitle: x.job_title || '', method: x.payment_method, memo: x.memo, miles: x.miles, hasReceipt: Boolean(x.receipt_file) })),
        income: incomeRows(y).map(r => ({ id: r.id, date: r.paid_on, number: r.number, customer: r.customer || '', title: r.title, method: r.method, grossCents: r.amount_cents, taxCents: r.taxCents })),
        jobList: q('SELECT id, title FROM jobs ORDER BY id DESC LIMIT 300').all()
      });
      return true;
    }

    if (method === 'GET' && sub === '/export') {
      const type = url.searchParams.get('type') || 'packet', { files, sum, s } = exportFiles(y);
      const send = (body, name, mime) => { res.writeHead(200, { 'Content-Type': mime, 'Content-Length': Buffer.byteLength(body), 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' }); res.end(body); };
      if (type === 'packet') {
        const readme = `${s.business_name} accountant packet for ${y}\r\nPrepared ${nowIso().slice(0, 10)} (cash basis).\r\n\r\nContents: income, expenses, mileage, payroll, W-2 and 1099 worksheets, job profit, profit and loss, general journal, legal and compliance register, signed agreements and liability records, plus summary.pdf.\r\nThese are prepared records, not tax advice or filed returns. Payroll withholding and filings must be confirmed with your CPA or payroll provider.\r\n`;
        send(zip([['README.txt', readme], ['summary.pdf', summaryPdf(y, sum, s)], ...Object.entries(files)]), `accountant-packet-${y}.zip`, 'application/zip');
      } else if (type === 'summary') send(summaryPdf(y, sum, s), `summary-${y}.pdf`, 'application/pdf');
      else if (files[`${type}.csv`]) send(files[`${type}.csv`], `${type}-${y}.csv`, 'text/csv; charset=utf-8');
      else fail(res, 404, 'Unknown export.');
      return true;
    }

    let m = sub.match(/^\/file\/(expense|doc)\/(\d+)$/);
    if (m && method === 'GET') {
      const row = q(m[1] === 'expense' ? 'SELECT receipt_file AS file FROM expenses WHERE id = ?' : 'SELECT file FROM business_docs WHERE id = ?').get(Number(m[2]));
      const data = row?.file && await fs.readFile(path.join(fileDir, row.file)).catch(() => null);
      if (!data) { fail(res, 404, 'File not found.'); return true; }
      res.writeHead(200, { 'Content-Type': detectFile(data)?.mime || 'application/octet-stream', 'Content-Length': data.length, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' });
      res.end(data);
      return true;
    }
    m = sub.match(/^\/upload\/(expense|doc)\/(\d+)$/);
    if (m && method === 'POST') {
      if (limited(req, 'acct-upload', 120)) { fail(res, 429, 'Too many uploads. Please try again later.'); return true; }
      const table = m[1] === 'expense' ? 'expenses' : 'business_docs', col = m[1] === 'expense' ? 'receipt_file' : 'file';
      const old = q(`SELECT ${col} AS file FROM ${table} WHERE id = ?`).get(Number(m[2]));
      if (!old) { fail(res, 404, 'Record not found.'); return true; }
      const saved = await storeFile(req, res);
      if (!saved) return true;
      q(`UPDATE ${table} SET ${col} = ? WHERE id = ?`).run(saved.file, Number(m[2]));
      if (old.file) await fs.unlink(path.join(fileDir, old.file)).catch(() => {});
      json(res, 200, { ok: true });
      return true;
    }

    if (method !== 'POST') return false;
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { fail(res, 415, 'Please submit from the website.'); return true; }
    const parsed = await readJson(req, 20000);
    if (parsed.error) { fail(res, 400, 'Please check the form and try again.'); return true; }
    const body = parsed.body;
    const bad = message => { fail(res, 400, message); return true; };

    if (sub === '/settings') {
      const next = {};
      for (const [k, max] of [['business_name', 150], ['ein', 20], ['state', 20]]) { const v = text(body[k] ?? cfg()[k], max); if (v === null) return bad('Please check the settings.'); next[k] = v; }
      if (!ENTITIES[body.entity ?? cfg().entity]) return bad('Choose a business type.');
      next.entity = body.entity ?? cfg().entity;
      for (const k of ['income_tax_pct', 'payroll_tax_pct', 'mileage_rate']) { const n = Number(body[k] ?? cfg()[k]); if (!Number.isFinite(n) || n < 0 || n > (k === 'mileage_rate' ? 5 : 60)) return bad('Please check the percentages and mileage rate.'); next[k] = String(n); }
      for (const [k, v] of Object.entries(next)) q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(`acct_${k}`, v);
      json(res, 200, { ok: true });
      return true;
    }

    if (sub === '/expenses' || (m = sub.match(/^\/expenses\/(\d+)(\/delete)?$/))) {
      const id = m ? Number(m[1]) : null;
      if (m?.[2]) { const old = q('SELECT receipt_file FROM expenses WHERE id = ?').get(id); q('DELETE FROM expenses WHERE id = ?').run(id); if (old?.receipt_file) await fs.unlink(path.join(fileDir, old.receipt_file)).catch(() => {}); json(res, 200, { ok: true }); return true; }
      const category = String(body.category || 'other'), vendor = text(body.vendor ?? '', 150), memo = text(body.memo ?? '', 500), miles = Number(body.miles || 0);
      let amount = cents(body.amount);
      if (!CATEGORIES[category] || vendor === null || memo === null || !validDate(body.date) || body.date > `${new Date().getFullYear() + 1}-12-31` || !(miles >= 0 && miles <= 5000)) return bad('Check the date, category and amounts.');
      if (category === 'mileage' || miles > 0) amount = Math.round(miles * Number(cfg().mileage_rate) * 100);
      if (amount === null || (!amount && !miles)) return bad('Enter the amount spent.');
      const deductiblePct = body.deductiblePct === undefined || body.deductiblePct === '' ? CATEGORIES[category][2] : Math.round(Number(body.deductiblePct));
      const method = PAY_METHODS.includes(body.method) ? body.method : 'card';
      const jobId = body.jobId ? Number(body.jobId) : null;
      if (!(deductiblePct >= 0 && deductiblePct <= 100) || (jobId && !q('SELECT 1 FROM jobs WHERE id = ?').get(jobId))) return bad('Check the deductible percent and job.');
      if (id) {
        if (!q('SELECT 1 FROM expenses WHERE id = ?').get(id)) { fail(res, 404, 'Expense not found.'); return true; }
        q('UPDATE expenses SET spent_on = ?, vendor = ?, category = ?, amount_cents = ?, deductible_pct = ?, job_id = ?, payment_method = ?, memo = ?, miles = ? WHERE id = ?').run(body.date, vendor, category, amount, deductiblePct, jobId, method, memo, miles, id);
        json(res, 200, { id });
      } else {
        const r = q('INSERT INTO expenses (spent_on, vendor, category, amount_cents, deductible_pct, job_id, payment_method, memo, miles, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(body.date, vendor, category, amount, deductiblePct, jobId, method, memo, miles, user.name, nowIso());
        json(res, 201, { id: Number(r.lastInsertRowid) });
      }
      return true;
    }

    if (sub === '/docs' || (m = sub.match(/^\/docs\/(\d+)(\/delete)?$/))) {
      const id = m ? Number(m[1]) : null;
      if (m?.[2]) { const old = q('SELECT file FROM business_docs WHERE id = ?').get(id); q('DELETE FROM business_docs WHERE id = ?').run(id); if (old?.file) await fs.unlink(path.join(fileDir, old.file)).catch(() => {}); json(res, 200, { ok: true }); return true; }
      const title = text(body.title, 200), number = text(body.number ?? '', 100), authority = text(body.authority ?? '', 150), notes = text(body.notes ?? '', 1000);
      const issued = body.issuedOn || '', expires = body.expiresOn || '';
      if (!title || number === null || authority === null || notes === null || !DOC_KINDS[body.kind] || (issued && !validDate(issued)) || (expires && !validDate(expires))) return bad('Choose a type, enter a title, and check the dates.');
      if (id) { q('UPDATE business_docs SET kind = ?, title = ?, number = ?, authority = ?, issued_on = ?, expires_on = ?, notes = ? WHERE id = ?').run(body.kind, title, number, authority, issued, expires, notes, id); json(res, 200, { id }); }
      else { const r = q('INSERT INTO business_docs (kind, title, number, authority, issued_on, expires_on, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(body.kind, title, number, authority, issued, expires, notes, nowIso()); json(res, 201, { id: Number(r.lastInsertRowid) }); }
      return true;
    }

    m = sub.match(/^\/workers\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      if (!q('SELECT 1 FROM employees WHERE id = ?').get(id)) { fail(res, 404, 'Employee not found.'); return true; }
      const last4 = String(body.last4 ?? '').trim();
      const dates = ['w4', 'w9', 'i9'].map(k => body[k] || '');
      if (!WORKER_TYPES[body.type] || (last4 && !/^\d{4}$/.test(last4)) || dates.some(d => d && !validDate(d))) return bad('Check the worker type, last four digits and dates.');
      q('UPDATE employees SET worker_type = ?, tax_id_last4 = ?, w4_on = ?, w9_on = ?, i9_on = ? WHERE id = ?').run(body.type, last4, ...dates, id);
      json(res, 200, { ok: true });
      return true;
    }
    return false;
  }

  return { handle, summary, exportFiles };
}

module.exports = { createAccounting, CATEGORIES, zip, csv };
