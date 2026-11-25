const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');
const { createServer } = require('../server');
const { openDb } = require('../lib/db');
const { createGoogleCalendar } = require('../lib/gcal');
const { createMailer } = require('../lib/mailer');

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

  const disabledStatus = (await call(admin, 'GET', '/api/admin/zoho/status')).body;
  assert.equal(disabledStatus.enabled, false);
  assert.equal(disabledStatus.capability.state, 'disabled');
  assert.equal((await call(admin, 'POST', '/api/admin/zoho/sync', {})).status, 409);
  assert.equal((await call(admin, 'POST', '/api/admin/zoho/enable', { enabled: true })).body.enabled, true);
  assert.equal((await call(admin, 'GET', '/api/admin/zoho/status')).body.capability.state, 'degraded');

  const real = globalThis.fetch, calls = [];
  let failSent = false, rateOnce = false, expenseAttempts = 0;
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
    if (u.pathname === '/books/v3/invoices' || (u.pathname.startsWith('/books/v3/invoices/') && init.method === 'PUT')) return ok({ invoice: { invoice_id: 'i1' } });
    if (u.pathname.endsWith('/status/sent')) return failSent ? new Response(JSON.stringify({ code: 5001, message: 'fixture send failed' }), { status: 500, headers: { 'content-type': 'application/json' } }) : ok({});
    if (u.pathname === '/books/v3/customerpayments') return ok({ payment: { payment_id: 'p1' } });
    if (u.pathname === '/books/v3/expenses') {
      expenseAttempts++;
      if (rateOnce) {
        rateOnce = false;
        return new Response(JSON.stringify({ code: 44, message: 'fixture rate limit' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '0' } });
      }
      return ok({ expense: { expense_id: `x${expenseAttempts}` } });
    }
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

  const retryDb = openDb(dataDir);
  retryDb.prepare("INSERT INTO expenses (spent_on, vendor, category, amount_cents, created_at) VALUES (?, 'Fixture Supply', 'supplies', 100, ?)").run(now.slice(0, 10), now);
  retryDb.close();
  rateOnce = true;
  const retried = await call(admin, 'POST', '/api/admin/zoho/sync', { scope: 'expenses' });
  assert.equal(retried.status, 200);
  assert.equal(retried.body.result.expenses, 1);
  assert.equal(calls.filter(c => c.path === '/books/v3/expenses').length, 3);

  const rep = await call(admin, 'GET', '/api/admin/zoho/reports/profitandloss');
  assert.ok(rep.body.rows.some(r => r.name === 'Sales' && r.total === 100));
  await call(admin, 'POST', '/api/admin/zoho/enable', { enabled: false });
  const n = calls.length;
  assert.equal((await call(admin, 'POST', '/api/admin/zoho/sync', {})).status, 409);
  assert.equal((await call(admin, 'GET', '/api/admin/zoho/reports/profitandloss')).status, 409);
  assert.equal(calls.length, n);
  await call(admin, 'POST', '/api/admin/zoho/enable', { enabled: true });
  assert.equal((await call(admin, 'POST', '/api/admin/zoho/disconnect', {})).body.connected, false);

  // An incomplete provider acknowledgement is not success and retries do not create a duplicate invoice.
  const retryStatusDb = openDb(dataDir);
  const incomplete = retryStatusDb.prepare("INSERT INTO estimates (number, kind, customer_id, title, status, signed_at, created_at, updated_at) VALUES ('EST-2', 'estimate', ?, 'Incomplete invoice', 'accepted', ?, ?, ?)").run(cid, now, now, now).lastInsertRowid;
  retryStatusDb.prepare("INSERT INTO estimate_items (estimate_id, section, kind, name, qty, unit, cost_cents, waste_bp, optional, accepted, sort) VALUES (?, 'Demo', 'labor', 'More work', 1, 'ea', 10000, 0, 0, 1, 1)").run(incomplete);
  retryStatusDb.close();
  failSent = true;
  await call(admin, 'POST', '/api/admin/zoho/enable', { enabled: true });
  await call(admin, 'POST', '/api/admin/zoho/disconnect', {});
  await call(admin, 'POST', '/api/admin/zoho/settings', { clientId: 'cid', clientSecret: 'csecret', dc: 'eu', expenseAccount: 'a1', paidThrough: 'b1', depositAccount: 'b1', since: '' });
  await call(admin, 'POST', '/api/admin/zoho/connect', { code: '1000.retryfixture1' });
  const incompleteSync = await call(admin, 'POST', '/api/admin/zoho/sync', { scope: 'invoices' });
  assert.equal(incompleteSync.status, 207);
  assert.equal(incompleteSync.body.result.ok, false);
  assert.equal(incompleteSync.body.result.errors, 1);
  failSent = false;
  const beforeRetryPosts = calls.filter(c => c.path === '/books/v3/invoices' && c.method === 'POST').length;
  assert.equal((await call(admin, 'POST', '/api/admin/zoho/sync', { scope: 'invoices' })).status, 200);
  assert.equal(calls.filter(c => c.path === '/books/v3/invoices' && c.method === 'POST').length, beforeRetryPosts);
});

test('Google Calendar contract validates provider acknowledgement', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const requests = [];
  const calendar = createGoogleCalendar({
    calendarId: 'calendar@example.com',
    credentials: { client_email: 'service@example.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) },
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'fixture-token', expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ id: 'event-123', kind: 'calendar#event' }), { status: 200 });
    }
  });
  assert.deepEqual(calendar.capability(), { state: 'available', reason: '', retryable: false });
  const id = await calendar.upsert({
    appointment: { starts_at: '2026-12-01T16:00:00.000Z', duration_min: 30, google_event_id: null },
    summary: 'Estimate', description: 'Fixture event'
  });
  assert.equal(id, 'event-123');
  const eventRequest = requests.find(x => x.url.includes('/calendar/v3/calendars/'));
  assert.equal(eventRequest.init.headers.Authorization, 'Bearer fixture-token');
  assert.equal(JSON.parse(eventRequest.init.body).summary, 'Estimate');
});

const live = process.env.RUN_LIVE_INTEGRATION_SMOKE === '1';

test('live Resend smoke', { skip: !live || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.LIVE_RESEND_TO }, async () => {
  const mailer = createMailer();
  const result = await mailer({ to: process.env.LIVE_RESEND_TO, subject: 'Budget Bath integration smoke test', text: `Opt-in smoke test ${new Date().toISOString()}` });
  assert.equal(result.ok, true);
});

test('live Google Calendar smoke', { skip: !live || !process.env.GOOGLE_CALENDAR_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON }, async () => {
  const calendar = createGoogleCalendar();
  const starts = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const id = await calendar.upsert({ appointment: { starts_at: starts, duration_min: 15, google_event_id: null }, summary: 'Budget Bath integration smoke test', description: 'Created by an explicitly enabled integration smoke test.' });
  assert.ok(id);
  await calendar.remove(id);
});

test('live Zoho Books read-only smoke', { skip: !live || !process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET || !process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_ORG_ID }, async () => {
  const dc = process.env.ZOHO_DC || 'com';
  const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token?${new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET
  })}`, { method: 'POST', signal: AbortSignal.timeout(20000) });
  assert.equal(tokenResponse.ok, true);
  const token = (await tokenResponse.json()).access_token;
  assert.ok(token);
  const response = await fetch(`https://www.zohoapis.${dc}/books/v3/organizations?organization_id=${encodeURIComponent(process.env.ZOHO_ORG_ID)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(20000)
  });
  const body = await response.json();
  assert.equal(response.ok, true);
  assert.ok(Array.isArray(body.organizations) && body.organizations.length);
});
