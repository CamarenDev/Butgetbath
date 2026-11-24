const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');
const { openDb } = require('../lib/db');

async function boot(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoho-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: 'admin@example.com', mailer: async m => { sent.push(m); }, gcal: { enabled: false, calendarId: '', clientEmail: '', privateKey: '' }, receiver: null });
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  t.after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const call = async (cookie, method, url, body) => {
    const r = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const login = async email => {
    await call('', 'POST', '/api/auth/register', { name: 'Test User', email, password: 'correct-horse-1', consent: true });
    const tk = sent.filter(m => m.to === email).at(-1).text.match(/token=([\w-]+)/)[1];
    await call('', 'POST', '/api/auth/verify', { token: tk });
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'correct-horse-1' }) });
    return r.headers.get('set-cookie').split(';')[0];
  };
  return { call, login, dataDir };
}

test('Zoho Books plugin connects, syncs idempotently and hides secrets', async t => {
  const { call, login, dataDir } = await boot(t);
  const admin = await login('admin@example.com'), user = await login('user@example.com');
  assert.equal((await call('', 'GET', '/api/admin/zoho/status')).status, 401);
  assert.equal((await call(user, 'GET', '/api/admin/zoho/status')).status, 403);

  assert.equal((await call(admin, 'GET', '/api/admin/zoho/status')).body.enabled, false);
  assert.equal((await call(admin, 'POST', '/api/admin/zoho/sync', {})).status, 409);
  assert.equal((await call(admin, 'POST', '/api/admin/zoho/enable', { enabled: true })).body.enabled, true);

  const real = globalThis.fetch, calls = [];
  t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === 'localhost') return real(url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method || 'GET', path: u.pathname, host: u.hostname, q: Object.fromEntries(u.searchParams), auth: init.headers?.Authorization, body });
    const ok = data => new Response(JSON.stringify({ code: 0, message: 'success', ...data }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/oauth/v2/token') return ok({ access_token: 'at-1', refresh_token: 'rt-secret', expires_in: 3600 });
    if (u.pathname === '/books/v3/organizations') return ok({ organizations: [{ organization_id: '1234567', name: 'Budget Bath', country_code: 'US' }] });
    if (u.pathname === '/books/v3/contacts' && init.method === 'POST') return ok({ contact: { contact_id: body.contact_type === 'vendor' ? 'v1' : 'c1' } });
    if (u.pathname === '/books/v3/invoices') return ok({ invoice: { invoice_id: 'i1' } });
    if (u.pathname.endsWith('/status/sent')) return ok({});
    if (u.pathname === '/books/v3/customerpayments') return ok({ payment: { payment_id: 'p1' } });
    if (u.pathname === '/books/v3/expenses') return ok({ expense: { expense_id: 'x1' } });
    if (u.pathname === '/books/v3/chartofaccounts') return ok({ chartofaccounts: [{ account_id: 'a1', account_name: 'Supplies', account_type: 'expense' }] });
    if (u.pathname === '/books/v3/reports/profitandloss') return ok({ profit_and_loss: [{ name: 'Income', total: 100, account_transactions: [{ name: 'Sales', total: '100.00' }] }] });
    return new Response('{}', { status: 404 });
  };

  assert.equal((await call(admin, 'POST', '/api/admin/zoho/settings', { clientId: 'cid', clientSecret: 'csecret', dc: 'eu', expenseAccount: 'a1', paidThrough: 'b1', depositAccount: 'b1', since: '' })).status, 200);
  const conn = await call(admin, 'POST', '/api/admin/zoho/connect', { code: '1000.abcdef1234567890' });
  assert.equal(conn.status, 200);
  assert.equal(conn.body.connected, true);
  assert.match(calls[0].host, /accounts\.zoho\.eu/);
  const blob = JSON.stringify((await call(admin, 'GET', '/api/admin/zoho/status')).body);
  assert.ok(!blob.includes('rt-secret') && !blob.includes('csecret'));

  const db = openDb(dataDir);
  const now = new Date().toISOString();
  const cid = db.prepare("INSERT INTO customers (name, email, phone, address, status, notes, created_at, updated_at) VALUES ('Pat Smith', 'pat@example.com', '555', '1 Main', 'active', '', ?, ?)").run(now, now).lastInsertRowid;
  const eid = db.prepare("INSERT INTO estimates (number, kind, customer_id, title, status, signed_at, created_at, updated_at) VALUES ('EST-1', 'estimate', ?, 'Bath', 'accepted', ?, ?, ?)").run(cid, now, now, now).lastInsertRowid;
  db.prepare("INSERT INTO estimate_items (estimate_id, section, kind, name, qty, unit, cost_cents, waste_bp, optional, accepted, sort) VALUES (?, 'Demo', 'labor', 'Demo tub', 1, 'ea', 50000, 0, 0, 1, 1)").run(eid);
  db.prepare("INSERT INTO estimate_payments (estimate_id, amount_cents, method, memo, paid_on, created_at) VALUES (?, 10000, 'card', '', ?, ?)").run(eid, now.slice(0, 10), now);
  db.prepare("INSERT INTO expenses (spent_on, vendor, category, amount_cents, created_at) VALUES (?, 'Home Depot', 'supplies', 2500, ?)").run(now.slice(0, 10), now);
  db.close();

  const first = (await call(admin, 'POST', '/api/admin/zoho/sync', {})).body.result;
  assert.deepEqual([first.customers, first.invoices, first.payments, first.expenses, first.errors], [1, 1, 1, 1, 0]);
  const inv = calls.find(c => c.path === '/books/v3/invoices');
  assert.equal(inv.q.organization_id, '1234567');
  assert.equal(inv.auth, 'Zoho-oauthtoken at-1');
  assert.equal(inv.body.customer_id, 'c1');
  assert.equal(calls.find(c => c.path === '/books/v3/customerpayments').body.invoices[0].invoice_id, 'i1');
  assert.equal(calls.find(c => c.path === '/books/v3/expenses').body.account_id, 'a1');

  const before = calls.length;
  const second = (await call(admin, 'POST', '/api/admin/zoho/sync', {})).body.result;
  assert.deepEqual([second.invoices, second.payments, second.expenses], [0, 0, 0]);
  assert.equal(calls.length, before);

  const rep = await call(admin, 'GET', '/api/admin/zoho/reports/profitandloss');
  assert.ok(rep.body.rows.some(r => r.name === 'Sales' && r.total === 100));
  await call(admin, 'POST', '/api/admin/zoho/enable', { enabled: false });
  const n = calls.length;
  assert.equal((await call(admin, 'POST', '/api/admin/zoho/sync', {})).status, 409);
  assert.equal((await call(admin, 'GET', '/api/admin/zoho/reports/profitandloss')).status, 409);
  assert.equal(calls.length, n);
  await call(admin, 'POST', '/api/admin/zoho/enable', { enabled: true });
  assert.equal((await call(admin, 'POST', '/api/admin/zoho/disconnect', {})).body.connected, false);
});
