// Optional Zoho Books plugin: OAuth 2.0 connection, two-way sync with the estimates, payments, expenses and
// contractor-pay records, and report pulls (P&L, balance sheet, trial balance, chart of accounts).
const crypto = require('node:crypto');
const { readBounded } = require('./mailer');

const DCS = { com: 'US', eu: 'Europe', in: 'India', 'com.au': 'Australia', jp: 'Japan', ca: 'Canada', sa: 'Saudi Arabia', 'com.cn': 'China' };
const SCOPE = 'ZohoBooks.fullaccess.all';
const RUN_LIMIT = 90; // Zoho allows about 100 calls a minute per organization
const MODES = { cash: 'cash', check: 'check', cheque: 'check', card: 'creditcard', credit: 'creditcard', stripe: 'creditcard', ach: 'banktransfer', transfer: 'banktransfer', wire: 'banktransfer', zelle: 'banktransfer', remittance: 'bankremittance' };
const REPORTS = { profitandloss: 'Profit and loss', balancesheet: 'Balance sheet', trialbalance: 'Trial balance' };

class ZohoError extends Error {
  constructor(message, status = 0, code = 0) { super(message); this.status = status; this.code = code; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ymd = d => new Date(d).toISOString().slice(0, 10);
const dollars = c => Math.round(c) / 100;
const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

function createZoho({ db, siteUrl, estimates, json, fail, readJson, currentUser, isAdmin, text, env = process.env, fetchImpl = (...args) => fetch(...args) }) {
  const q = sql => db.prepare(sql);
  const getSetting = (k, d = '') => q('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? d;
  const setSetting = (k, v) => q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const nowIso = () => new Date().toISOString();

  const clientId = () => env.ZOHO_CLIENT_ID || getSetting('zoho_client_id');
  const clientSecret = () => env.ZOHO_CLIENT_SECRET || getSetting('zoho_client_secret');
  const dc = () => { const v = env.ZOHO_DC || getSetting('zoho_dc', 'com'); return DCS[v] ? v : 'com'; };
  const accountsUrl = () => `https://accounts.zoho.${dc()}`;
  const apiUrl = () => `https://www.zohoapis.${dc()}/books/v3`;
  const redirectUri = () => `${siteUrl.replace(/\/$/, '')}/api/admin/zoho/callback`;
  const refreshToken = () => getSetting('zoho_refresh');
  const orgId = () => getSetting('zoho_org');
  const enabled = () => getSetting('zoho_enabled', '0') === '1';
  const connected = () => Boolean(refreshToken() && orgId());
  const capability = () => {
    if (!enabled()) return { state: 'disabled', reason: 'Zoho Books is turned off', retryable: false };
    const missing = [!clientId() && 'client id', !clientSecret() && 'client secret', !refreshToken() && 'OAuth connection', !orgId() && 'organization'].filter(Boolean);
    return missing.length
      ? { state: 'degraded', reason: `Missing ${missing.join(', ')}`, retryable: true }
      : { state: 'available', reason: '', retryable: false };
  };

  let cache = { token: '', exp: 0 }, refreshing = null, running = false;

  const log = (kind, localId, ok, message) => {
    q('INSERT INTO zoho_log (at, kind, local_id, ok, message) VALUES (?, ?, ?, ?, ?)').run(nowIso(), kind, String(localId ?? ''), ok ? 1 : 0, String(message || '').slice(0, 400));
    q('DELETE FROM zoho_log WHERE id <= (SELECT MAX(id) FROM zoho_log) - 500').run();
  };

  async function tokenCall(params) {
    let res, data;
    try {
      res = await fetchImpl(`${accountsUrl()}/oauth/v2/token?${new URLSearchParams(params)}`, { method: 'POST', signal: AbortSignal.timeout(20000) });
      data = JSON.parse((await readBounded(res, 128 * 1024)).toString('utf8'));
    } catch { throw new ZohoError('Could not reach Zoho. Check the data center and try again.', 502); }
    if (!res.ok || data.error || !data.access_token && !data.refresh_token) throw new ZohoError(`Zoho refused the sign-in (${String(data.error || res.status).replace(/[^\w ._-]/g, '').slice(0, 60)}).`, 401);
    return data;
  }

  async function accessToken(force = false) {
    if (!force && cache.token && Date.now() < cache.exp - 60000) return cache.token;
    if (!refreshToken()) throw new ZohoError('Zoho Books is not connected.', 409);
    refreshing ||= tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken(), client_id: clientId(), client_secret: clientSecret() })
      .then(d => { cache = { token: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 }; return cache.token; })
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  async function exchange(params) {
    const d = await tokenCall({ ...params, client_id: clientId(), client_secret: clientSecret() });
    if (!d.refresh_token) throw new ZohoError('Zoho did not return a refresh token. Generate a new code and try again.', 400);
    setSetting('zoho_refresh', d.refresh_token);
    cache = { token: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  }

  // Calls the Books API. Retries once on an expired token and backs off when rate limited.
  async function zoho(method, path, { query = {}, body, org = true } = {}, attempt = 0) {
    const url = new URL(`${apiUrl()}${path}`);
    if (org) url.searchParams.set('organization_id', orgId());
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
    let res, data = {};
    try {
      const payload = body ? JSON.stringify(body) : undefined;
      if (payload && Buffer.byteLength(payload) > 256 * 1024) throw new ZohoError('Zoho request payload is too large.', 400);
      res = await fetchImpl(url, { method, headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json;charset=UTF-8' } : {}) }, body: payload, signal: AbortSignal.timeout(30000) });
      const raw = await readBounded(res, 512 * 1024);
      data = raw.length ? JSON.parse(raw.toString('utf8')) : {};
    } catch (error) { if (error instanceof ZohoError) throw error; throw new ZohoError('Could not reach Zoho.', 502); }
    if (res.status === 401 && attempt < 1) { cache = { token: '', exp: 0 }; return zoho(method, path, { query, body, org }, attempt + 1); }
    const daily = res.status === 429 && Number(data.code) === 45; // daily plan cap: retrying today is pointless
    if (res.status === 429 && !daily && attempt < 3) {
      const retry = res.headers.get('retry-after');
      const seconds = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry) - Date.now()) / 1000 : 2 * (attempt + 1);
      await sleep(Math.min(Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : 2000), 15000));
      return zoho(method, path, { query, body, org }, attempt + 1);
    }
    if (!res.ok || (data.code !== undefined && data.code !== 0)) throw new ZohoError(String(data.message || `Zoho returned ${res.status}.`).slice(0, 300), res.status, data.code || 0);
    return data;
  }

  // Link map: local record -> Zoho id, with a hash so edits are pushed once.
  const linkOf = (kind, id) => q('SELECT zoho_id, hash FROM zoho_links WHERE kind = ? AND local_id = ?').get(kind, String(id));
  const link = (kind, id, zid, hash = '') => q('INSERT INTO zoho_links (kind, local_id, zoho_id, hash, synced_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, local_id) DO UPDATE SET zoho_id = excluded.zoho_id, hash = excluded.hash, synced_at = excluded.synced_at').run(kind, String(id), String(zid), hash, nowIso());
  const hashOf = v => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');

  async function contact(kind, key, payload) {
    const h = hashOf(payload), l = linkOf(kind, key);
    if (l?.hash === h) return l.zoho_id;
    if (l) { await zoho('PUT', `/contacts/${l.zoho_id}`, { body: payload }); link(kind, key, l.zoho_id, h); return l.zoho_id; }
    try {
      const r = await zoho('POST', '/contacts', { body: payload });
      link(kind, key, r.contact.contact_id, h); return r.contact.contact_id;
    } catch (error) {
      if (error.code !== 3062) throw error; // a contact with this name already exists, so reuse it
      const found = (await zoho('GET', '/contacts', { query: { contact_name: payload.contact_name } })).contacts?.find(c => c.contact_name.toLowerCase() === payload.contact_name.toLowerCase());
      if (!found) throw error;
      link(kind, key, found.contact_id, ''); return found.contact_id;
    }
  }

  const customerContact = c => contact('customer', c.id, {
    contact_name: c.name, contact_type: 'customer', ...(c.address ? { billing_address: { address: c.address } } : {}),
    contact_persons: c.email || c.phone ? [{ first_name: c.name.split(' ')[0].slice(0, 50), last_name: c.name.split(' ').slice(1).join(' ').slice(0, 50), email: c.email || undefined, phone: c.phone || undefined, is_primary_contact: true }] : []
  });
  const vendorContact = name => contact('vendor', name.toLowerCase(), { contact_name: name.slice(0, 100), contact_type: 'vendor' });

  function invoicePayload(est, customerZid) {
    const { lines, totals } = estimates.calc(est);
    const account = getSetting('zoho_income_account');
    const items = lines.filter(l => l.included).map(l => ({ name: String(l.name).slice(0, 100), description: String(l.section || '').slice(0, 200), quantity: 1, rate: dollars(l.price), ...(account ? { account_id: account } : {}) }));
    if (totals.contingencyCents) items.push({ name: 'Contingency', quantity: 1, rate: dollars(totals.contingencyCents), ...(account ? { account_id: account } : {}) });
    if (totals.taxCents) items.push({ name: 'Sales tax', quantity: 1, rate: dollars(totals.taxCents), ...(account ? { account_id: account } : {}) });
    return { customer_id: customerZid, reference_number: est.number, date: ymd(est.signed_at || est.updated_at || Date.now()), notes: String(est.title || '').slice(0, 500), line_items: items, ...(totals.discountCents ? { discount: dollars(totals.discountCents), discount_type: 'entity_level', is_discount_before_tax: false } : {}), _total: totals.totalCents };
  }

  const since = () => (dateOk(getSetting('zoho_since')) ? getSetting('zoho_since') : '0000-00-00');

  async function accountFor(category) {
    let accounts = JSON.parse(getSetting('zoho_accounts_cache', '[]'));
    if (!accounts.length) {
      accounts = ((await zoho('GET', '/chartofaccounts', { query: { filter_by: 'AccountType.Expenses', per_page: 200 } })).chartofaccounts || []).map(a => ({ id: a.account_id, name: a.account_name }));
      setSetting('zoho_accounts_cache', JSON.stringify(accounts));
    }
    const want = String(category || '').toLowerCase().replace(/[_-]/g, ' ');
    return accounts.find(a => a.name.toLowerCase() === want)?.id || accounts.find(a => want && a.name.toLowerCase().includes(want))?.id || getSetting('zoho_expense_account');
  }

  async function postExpense(kind, id, { date, vendor, category, amountCents, memo, ref }) {
    const paidThrough = getSetting('zoho_paid_through'), account = await accountFor(category);
    if (!paidThrough || !account) throw new ZohoError('Choose a default expense account and a paid-through account first.', 400);
    const vendorId = vendor ? await vendorContact(vendor) : undefined;
    const r = await zoho('POST', '/expenses', { body: { account_id: account, paid_through_account_id: paidThrough, date, amount: dollars(amountCents), vendor_id: vendorId, description: String(memo || category || '').slice(0, 500), reference_number: ref } });
    link(kind, id, r.expense.expense_id);
  }

  async function sync(scope = 'all') {
    if (!enabled()) throw new ZohoError('The Zoho Books plugin is turned off.', 409);
    if (!connected()) throw new ZohoError('Zoho Books is not connected.', 409);
    if (running) throw new ZohoError('A sync is already running.', 409);
    running = true;
    const out = { customers: 0, invoices: 0, payments: 0, expenses: 0, payroll: 0, errors: 0, more: false };
    let budget = RUN_LIMIT;
    const run = async (kind, id, fn, counter) => {
      if (budget <= 0) { out.more = true; return false; }
      budget -= 1;
      try { await fn(); out[counter] += 1; log(kind, id, true, 'Synced'); } catch (error) {
        out.errors += 1; log(kind, id, false, error.message);
        if ([401, 429, 502].includes(error.status)) throw error;
      }
      return true;
    };
    const want = k => scope === 'all' || scope === k;
    try {
      const from = since();
      if (want('invoices') || want('customers')) {
        const ests = q("SELECT * FROM estimates WHERE status = 'accepted' AND customer_id IS NOT NULL AND substr(COALESCE(signed_at, updated_at, ''), 1, 10) >= ? ORDER BY id").all(from === '0000-00-00' ? '' : from);
        for (const est of ests) {
          const c = q('SELECT * FROM customers WHERE id = ?').get(est.customer_id);
          if (!c) continue;
          const body = invoicePayload(est, null), h = hashOf({ ...body, c: [c.name, c.email, c.phone, c.address] });
          const il = linkOf('invoice', est.id);
          if (linkOf('customer', c.id)?.hash && il?.hash === h) continue;
          await run('customer', c.id, async () => { await customerContact(c); }, 'customers');
          if (!want('invoices')) continue;
          await run('invoice', est.number, async () => {
            const cz = linkOf('customer', c.id)?.zoho_id; if (!cz) throw new ZohoError('Customer is not in Zoho yet.', 400);
            const { _total, ...payload } = invoicePayload(est, cz);
            if (il) {
              await zoho('PUT', `/invoices/${il.zoho_id}`, { body: payload });
              await zoho('POST', `/invoices/${il.zoho_id}/status/sent`);
              link('invoice', est.id, il.zoho_id, h);
              return;
            }
            const r = await zoho('POST', '/invoices', { body: payload });
            if (!r.invoice?.invoice_id) throw new ZohoError('Zoho did not return an invoice id.', 502);
            link('invoice', est.id, r.invoice.invoice_id, '');
            await zoho('POST', `/invoices/${r.invoice.invoice_id}/status/sent`);
            link('invoice', est.id, r.invoice.invoice_id, h);
          }, 'invoices');
        }
      }
      if (want('payments')) {
        const pays = q("SELECT p.*, e.customer_id FROM estimate_payments p JOIN estimates e ON e.id = p.estimate_id WHERE p.paid_on >= ? ORDER BY p.id").all(from);
        for (const p of pays) {
          if (linkOf('payment', p.id)) continue;
          const inv = linkOf('invoice', p.estimate_id), cust = p.customer_id && linkOf('customer', p.customer_id);
          if (!inv?.hash || !cust) continue; // pushed only after the invoice was successfully sent
          await run('payment', p.id, async () => {
            const deposit = getSetting('zoho_deposit_account');
            const r = await zoho('POST', '/customerpayments', { body: { customer_id: cust.zoho_id, payment_mode: MODES[String(p.method).toLowerCase().split(/[\s_-]/)[0]] || 'others', amount: dollars(p.amount_cents), date: p.paid_on, reference_number: String(p.provider_ref || `BBS-PAY-${p.id}`).slice(0, 100), description: String(p.memo || '').slice(0, 200), ...(deposit ? { account_id: deposit } : {}), invoices: [{ invoice_id: inv.zoho_id, amount_applied: dollars(p.amount_cents) }] } });
            link('payment', p.id, r.payment.payment_id);
          }, 'payments');
        }
      }
      if (want('expenses')) {
        for (const x of q('SELECT * FROM expenses WHERE spent_on >= ? ORDER BY id').all(from)) {
          if (linkOf('expense', x.id)) continue;
          await run('expense', x.id, () => postExpense('expense', x.id, { date: x.spent_on, vendor: x.vendor, category: x.category, amountCents: x.amount_cents, memo: x.memo || x.category, ref: `BBS-EXP-${x.id}` }), 'expenses');
        }
        for (const p of q("SELECT p.*, u.name FROM payments p JOIN employees e ON e.id = p.employee_id JOIN users u ON u.id = e.user_id WHERE p.paid_on >= ? ORDER BY p.id").all(from)) {
          if (linkOf('payroll', p.id)) continue;
          await run('payroll', p.id, () => postExpense('payroll', p.id, { date: p.paid_on, vendor: p.name, category: 'labor', amountCents: p.amount_cents, memo: p.memo || 'Labor payment', ref: `BBS-PAY-OUT-${p.id}` }), 'payroll');
        }
      }
      if (out.errors === 0 && !out.more) setSetting('zoho_last_sync', nowIso());
      out.ok = out.errors === 0 && !out.more;
      out.capability = out.ok ? capability() : { state: 'degraded', reason: out.errors ? 'Zoho sync completed with errors' : 'Zoho sync stopped at its request limit', retryable: true };
      return out;
    } finally { running = false; }
  }

  const rowsOf = (node, depth = 0, rows = []) => {
    if (Array.isArray(node)) { for (const n of node) rowsOf(n, depth, rows); return rows; }
    if (!node || typeof node !== 'object' || depth > 8) return rows;
    const total = node.total ?? node.balance ?? node.amount;
    const named = typeof (node.name ?? node.account_name) === 'string';
    if (named && total !== undefined && !Array.isArray(total)) rows.push({ depth, name: node.name ?? node.account_name, total: Number(total) || 0 });
    for (const v of Object.values(node)) if (v && typeof v === 'object') rowsOf(v, depth + (named ? 1 : 0), rows);
    return rows;
  };

  async function report(name, from, to) {
    const r = await zoho('GET', `/reports/${name}`, { query: { from_date: from, to_date: to, date: to } });
    return { name, title: REPORTS[name], from, to, rows: rowsOf(r[name] ?? r.profit_and_loss ?? r.balance_sheet ?? r.trial_balance ?? r).slice(0, 400) };
  }

  function status() {
    const pending = {
      invoices: q("SELECT COUNT(*) c FROM estimates e WHERE status = 'accepted' AND customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM zoho_links l WHERE l.kind = 'invoice' AND l.local_id = CAST(e.id AS TEXT))").get().c,
      payments: q("SELECT COUNT(*) c FROM estimate_payments p WHERE NOT EXISTS (SELECT 1 FROM zoho_links l WHERE l.kind = 'payment' AND l.local_id = CAST(p.id AS TEXT))").get().c,
      expenses: q("SELECT COUNT(*) c FROM expenses x WHERE NOT EXISTS (SELECT 1 FROM zoho_links l WHERE l.kind = 'expense' AND l.local_id = CAST(x.id AS TEXT))").get().c + q("SELECT COUNT(*) c FROM payments p WHERE NOT EXISTS (SELECT 1 FROM zoho_links l WHERE l.kind = 'payroll' AND l.local_id = CAST(p.id AS TEXT))").get().c
    };
    return {
      clientId: clientId(), hasSecret: Boolean(clientSecret()), credentialsFromEnv: Boolean(env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET), dc: dc(), dcs: DCS, enabled: enabled(), connected: connected(), hasToken: Boolean(refreshToken()), capability: capability(),
      orgId: orgId(), orgName: getSetting('zoho_org_name'), auto: getSetting('zoho_auto', '0') === '1', since: getSetting('zoho_since'), lastSync: getSetting('zoho_last_sync'),
      expenseAccount: getSetting('zoho_expense_account'), paidThrough: getSetting('zoho_paid_through'), depositAccount: getSetting('zoho_deposit_account'), incomeAccount: getSetting('zoho_income_account'),
      redirectUri: redirectUri(), scope: SCOPE, pending, reports: REPORTS,
      links: Object.fromEntries(q('SELECT kind, COUNT(*) c FROM zoho_links GROUP BY kind').all().map(r => [r.kind, r.c])),
      log: q('SELECT at, kind, local_id, ok, message FROM zoho_log ORDER BY id DESC LIMIT 40').all()
    };
  }

  function start() {
    const every = Math.max(Number(env.ZOHO_SYNC_MINUTES) || 30, 5) * 60000;
    const timer = setInterval(() => { if (enabled() && getSetting('zoho_auto', '0') === '1' && connected()) sync().catch(error => log('auto', '', false, error.message)); }, every);
    timer.unref();
    return () => clearInterval(timer);
  }

  const go = (res, status, to) => { res.writeHead(status, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };
  const safe = async (res, fn) => {
    try { return await fn(); } catch (error) {
      if (error instanceof ZohoError) return fail(res, error.status === 401 ? 400 : error.status >= 400 && error.status < 600 ? error.status : 502, error.message);
      throw error;
    }
  };

  async function pickOrg() {
    const orgs = (await zoho('GET', '/organizations', { org: false })).organizations || [];
    if (orgs.length === 1) { setSetting('zoho_org', orgs[0].organization_id); setSetting('zoho_org_name', orgs[0].name); }
    return orgs.map(o => ({ id: o.organization_id, name: o.name, country: o.country_code || '' }));
  }

  async function handle(req, res, pathname, method) {
    if (!pathname.startsWith('/api/admin/zoho/')) return false;
    const route = pathname.slice('/api/admin/zoho/'.length);
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Please sign in.'), true;
    if (!isAdmin(user)) return fail(res, 403, 'Admin access required.'), true;
    const url = new URL(req.url, 'http://x');

    if (method === 'GET' && route === 'status') return json(res, 200, status()), true;
    const open = ['enable', 'disconnect', 'settings'].includes(route);
    if (!enabled() && !open) return fail(res, 409, 'The Zoho Books plugin is turned off.'), true;
    if (method === 'GET' && route === 'authorize') {
      if (!clientId() || !clientSecret()) return fail(res, 400, 'Save the client ID and secret first.'), true;
      const state = crypto.randomBytes(16).toString('hex');
      setSetting('zoho_state', `${state}.${Date.now()}`);
      const p = new URLSearchParams({ client_id: clientId(), response_type: 'code', redirect_uri: redirectUri(), scope: SCOPE, access_type: 'offline', prompt: 'consent', state });
      return json(res, 200, { url: `${accountsUrl()}/oauth/v2/auth?${p}` }), true;
    }
    if (method === 'GET' && route === 'callback') {
      const [saved, at] = getSetting('zoho_state').split('.'), code = url.searchParams.get('code') || '', state = url.searchParams.get('state') || '';
      setSetting('zoho_state', '');
      const good = saved && state.length === saved.length && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(saved)) && Date.now() - Number(at) < 600000;
      if (!good || !code) return go(res, 302, '/admin/#zoho?error=state'), true;
      try { await exchange({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() }); await pickOrg(); } catch { return go(res, 302, '/admin/#zoho?error=exchange'), true; }
      return go(res, 302, '/admin/#zoho'), true;
    }
    if (method === 'GET' && route === 'organizations') return safe(res, async () => json(res, 200, { organizations: await pickOrg(), selected: orgId() })), true;
    if (method === 'GET' && route === 'accounts') {
      return safe(res, async () => {
        const [coa, banks] = await Promise.all([zoho('GET', '/chartofaccounts', { query: { per_page: 200 } }), zoho('GET', '/bankaccounts', { query: { per_page: 200 } })]);
        const map = a => ({ id: a.account_id, name: a.account_name, type: a.account_type });
        const accounts = (coa.chartofaccounts || []).map(map);
        setSetting('zoho_accounts_cache', JSON.stringify(accounts.filter(a => /expense|cost/i.test(a.type)).map(a => ({ id: a.id, name: a.name }))));
        json(res, 200, { accounts, banks: (banks.bankaccounts || []).map(map) });
      }), true;
    }
    if (method === 'GET' && route.startsWith('reports/')) {
      const name = route.slice(8), year = new Date().getFullYear();
      if (!REPORTS[name]) return fail(res, 404, 'Unknown report.'), true;
      const from = url.searchParams.get('from') || `${year}-01-01`, to = url.searchParams.get('to') || ymd(Date.now());
      if (!dateOk(from) || !dateOk(to)) return fail(res, 400, 'Use dates like 2026-01-31.'), true;
      return safe(res, async () => json(res, 200, await report(name, from, to))), true;
    }
    if (method !== 'POST') return fail(res, 405, 'Method not allowed.'), true;
    const parsed = await readJson(req);
    if (parsed.error) return fail(res, 400, 'Please check the form and try again.'), true;
    const body = parsed.body;
    const idOf = v => { const s = String(v ?? '').trim(); return /^[\w-]{0,40}$/.test(s) ? s : null; };

    if (route === 'enable') { setSetting('zoho_enabled', body.enabled ? '1' : '0'); return json(res, 200, status()), true; }
    if (route === 'settings') {
      const f = ['expenseAccount', 'paidThrough', 'depositAccount', 'incomeAccount'].map(k => [k, idOf(body[k])]);
      if (f.some(([, v]) => v === null) || (body.dc && !DCS[body.dc]) || (body.since && !dateOk(body.since))) return fail(res, 400, 'Check the data center, date and account ids.'), true;
      if (!env.ZOHO_CLIENT_ID) { const id = text(body.clientId ?? '', 120); if (id === null) return fail(res, 400, 'The client ID is too long.'), true; setSetting('zoho_client_id', id.trim()); }
      if (!env.ZOHO_CLIENT_SECRET && body.clientSecret) { const s = text(body.clientSecret, 120); if (s === null) return fail(res, 400, 'The client secret is too long.'), true; setSetting('zoho_client_secret', s.trim()); }
      if (body.dc && !env.ZOHO_DC && body.dc !== getSetting('zoho_dc', 'com')) { setSetting('zoho_dc', body.dc); setSetting('zoho_refresh', ''); setSetting('zoho_org', ''); cache = { token: '', exp: 0 }; }
      setSetting('zoho_auto', body.auto ? '1' : '0'); setSetting('zoho_since', body.since || '');
      for (const [k, v] of f) setSetting({ expenseAccount: 'zoho_expense_account', paidThrough: 'zoho_paid_through', depositAccount: 'zoho_deposit_account', incomeAccount: 'zoho_income_account' }[k], v);
      setSetting('zoho_accounts_cache', '[]');
      return json(res, 200, status()), true;
    }
    if (route === 'connect') {
      const code = String(body.code || '').trim();
      if (!/^[\w.-]{10,200}$/.test(code)) return fail(res, 400, 'Paste the grant code from the Zoho API console.'), true;
      if (!clientId() || !clientSecret()) return fail(res, 400, 'Save the client ID and secret first.'), true;
      return safe(res, async () => { await exchange({ grant_type: 'authorization_code', code }); const organizations = await pickOrg(); json(res, 200, { ...status(), organizations }); }), true;
    }
    if (route === 'organization') {
      const id = String(body.id || '');
      if (!/^\d{4,25}$/.test(id) || !refreshToken()) return fail(res, 400, 'Choose an organization.'), true;
      return safe(res, async () => {
        const org = (await pickOrg()).find(o => o.id === id);
        if (!org) return fail(res, 404, 'That organization is not on this Zoho account.');
        setSetting('zoho_org', org.id); setSetting('zoho_org_name', org.name);
        json(res, 200, status());
      }), true;
    }
    if (route === 'sync') {
      const scope = ['all', 'invoices', 'payments', 'expenses'].includes(body.scope) ? body.scope : 'all';
      return safe(res, async () => {
        const result = await sync(scope);
        json(res, result.ok ? 200 : 207, { ok: result.ok, result, status: status() });
      }), true;
    }
    if (route === 'disconnect') {
      const tok = refreshToken();
      if (tok) await fetchImpl(`${accountsUrl()}/oauth/v2/token/revoke?${new URLSearchParams({ token: tok })}`, { method: 'POST', signal: AbortSignal.timeout(10000) }).catch(() => {});
      for (const k of ['zoho_refresh', 'zoho_org', 'zoho_org_name', 'zoho_accounts_cache']) setSetting(k, '');
      cache = { token: '', exp: 0 };
      return json(res, 200, status()), true;
    }
    if (route === 'reset-links') { q('DELETE FROM zoho_links').run(); return json(res, 200, status()), true; }
    return fail(res, 404, 'Not found.'), true;
  }

  return { handle, start, sync, status, capability };
}

module.exports = { createZoho, DCS };
