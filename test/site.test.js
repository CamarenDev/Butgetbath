const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

execFileSync('node', ['build.js'], { cwd: path.join(__dirname, '..') });
const { createServer } = require('../server');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-'));
const sent = [];
const server = createServer({ dataDir, siteUrl: 'https://example.test', notifyEmail: 'owner@example.test', adminEmails: ['owner@example.test'], mailer: async m => { sent.push(m); } });
let base;
test.before(() => new Promise(resolve => server.listen(0, () => { base = `http://localhost:${server.address().port}`; resolve(); })));
test.after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const post = (url, body, cookie) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) });
const tokenFrom = (message, kind) => new URL(message.text.match(/https?:\/\/\S+/g).find(u => u.includes(kind))).searchParams.get('token');
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

test('serves SEO essentials, legal pages and 404s', async () => {
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /<link rel="canonical" href="https:\/\/budgetbathsolutions\.com\/">/);
  assert.match(home, /application\/ld\+json/);
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), /service-areas\/kane-county/);
  assert.doesNotMatch(await (await fetch(base + '/sitemap.xml')).text(), /\/account\//);
  for (const p of ['/privacy/', '/terms/', '/accessibility/', '/work-with-us/', '/contact/', '/account/', '/account/login/', '/account/register/', '/account/new/']) assert.strictEqual((await fetch(base + p)).status, 200, p);
  assert.match(await (await fetch(base + '/account/login/')).text(), /noindex/);
  assert.strictEqual((await fetch(base + '/nope/')).status, 404);
  assert.strictEqual((await fetch(base + '/%2e%2e/package.json')).status, 404);
});

test('lead forms store the submission and send confirmation and alert emails', async () => {
  sent.length = 0;
  const lead = { type: 'project', name: 'Pat <b>', email: 'pat@example.test', phone: '', location: 'Kane County', interest: 'Tile Installation', message: 'Hi', consent: true };
  assert.strictEqual((await post('/api/submissions', lead)).status, 201);
  assert.deepStrictEqual(sent.map(m => m.to), ['pat@example.test', 'owner@example.test']);
  assert.strictEqual(sent[1].replyTo, 'pat@example.test');
  assert.doesNotMatch(sent[1].html, /Pat <b>/);
  assert.strictEqual((await post('/api/submissions', { ...lead, consent: false })).status, 400);
  assert.strictEqual((await post('/api/submissions', { ...lead, website: 'spam' })).status, 201);
  assert.strictEqual(sent.length, 2);
});

test('account flow: register, verify, sign in, request with photo, admin view, reset password', async () => {
  sent.length = 0;
  const creds = { name: 'Casey', email: 'casey@example.test', phone: '555', password: 'correct horse battery', consent: true };
  assert.strictEqual((await post('/api/auth/register', { ...creds, password: 'short' })).status, 400);
  assert.strictEqual((await post('/api/auth/register', creds)).status, 201);
  assert.match(sent[0].subject, /Confirm your email/);

  // Registering again reveals nothing and sends the "already registered" email instead.
  assert.strictEqual((await post('/api/auth/register', creds)).status, 201);
  assert.match(sent[1].subject, /already have an account/);

  const login = await post('/api/auth/login', creds);
  assert.strictEqual(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.strictEqual((await post('/api/auth/login', { ...creds, password: 'wrong password!' })).status, 401);

  // Unverified accounts cannot create requests.
  const body = { title: 'Primary bath', projectType: 'Bathroom Remodeling', location: 'Kane County', timeline: '', budget: '', description: 'Replace tub with a walk-in shower.' };
  assert.strictEqual((await post('/api/requests', body, cookie)).status, 403);
  assert.strictEqual((await post('/api/auth/verify', { token: 'bogus' })).status, 400);
  assert.strictEqual((await post('/api/auth/verify', { token: tokenFrom(sent[0], 'verify') })).status, 200);
  assert.match(sent[2].subject, /account is ready/);

  const created = await (await post('/api/requests', body, cookie)).json();
  const upload = (data, type = 'image/png') => fetch(`${base}/api/requests/${created.id}/photos`, { method: 'POST', headers: { 'Content-Type': type, 'X-Filename': 'tub.png', Cookie: cookie }, body: data });
  assert.strictEqual((await upload(Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml')).status, 415);
  const photo = await upload(png);
  assert.strictEqual(photo.status, 201);
  const { id: photoId } = await photo.json();

  sent.length = 0;
  assert.strictEqual((await post(`/api/requests/${created.id}/submit`, {}, cookie)).status, 200);
  assert.strictEqual((await post(`/api/requests/${created.id}/submit`, {}, cookie)).status, 200);
  assert.deepStrictEqual(sent.map(m => m.to), ['casey@example.test', 'owner@example.test']);
  assert.match(sent[1].text, /Photos: 1/);

  const mine = await (await fetch(`${base}/api/requests/${created.id}`, { headers: { Cookie: cookie } })).json();
  assert.strictEqual(mine.request.status, 'submitted');
  assert.strictEqual((await fetch(`${base}/api/photos/${photoId}`, { headers: { Cookie: cookie } })).headers.get('content-type'), 'image/png');
  assert.strictEqual((await fetch(`${base}/api/photos/${photoId}`)).status, 404);

  // Another customer cannot see these, and non-admins cannot list requests.
  await post('/api/auth/register', { ...creds, name: 'Sam', email: 'sam@example.test' });
  await post('/api/auth/verify', { token: tokenFrom(sent.at(-1), 'verify') });
  const other = (await post('/api/auth/login', { ...creds, email: 'sam@example.test' })).headers.get('set-cookie').split(';')[0];
  assert.strictEqual((await fetch(`${base}/api/photos/${photoId}`, { headers: { Cookie: other } })).status, 404);
  assert.strictEqual((await fetch(`${base}/api/requests/${created.id}`, { headers: { Cookie: other } })).status, 404);
  assert.strictEqual((await fetch(`${base}/api/admin/requests`, { headers: { Cookie: other } })).status, 403);

  // Cross-site writes are refused.
  const forged = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.test', Cookie: cookie }, body: '{}' });
  assert.strictEqual(forged.status, 403);

  // Password reset invalidates sessions.
  sent.length = 0;
  assert.strictEqual((await post('/api/auth/forgot', { email: 'casey@example.test' })).status, 200);
  assert.strictEqual((await post('/api/auth/forgot', { email: 'nobody@example.test' })).status, 200);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual((await post('/api/auth/reset', { token: tokenFrom(sent[0], 'reset'), password: 'a brand new password' })).status, 200);
  assert.strictEqual((await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
  assert.strictEqual((await post('/api/auth/login', { ...creds, password: 'a brand new password' })).status, 200);

  // The owner (an admin email) sees submitted requests with customer details.
  await post('/api/auth/register', { ...creds, name: 'Owner', email: 'owner@example.test' });
  await post('/api/auth/verify', { token: tokenFrom(sent.at(-1), 'verify') });
  const admin = (await post('/api/auth/login', { ...creds, email: 'owner@example.test' })).headers.get('set-cookie').split(';')[0];
  const listed = await (await fetch(`${base}/api/admin/requests`, { headers: { Cookie: admin } })).json();
  assert.strictEqual(listed.requests[0].customer.email, 'casey@example.test');
  assert.strictEqual((await fetch(`${base}/api/photos/${photoId}`, { headers: { Cookie: admin } })).status, 200);
});

test('tickets: threaded messages with captioned photos, staff replies, notifications and email replies', async () => {
  const crypto = require('node:crypto');
  const secretBytes = crypto.randomBytes(24);
  const webhookSecret = 'whsec_' + secretBytes.toString('base64');
  const inbox = new Map();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-t-'));
  const mails = [];
  const srv = createServer({ dataDir: dir, siteUrl: 'https://example.test', notifyEmail: 'owner@example.test', adminEmails: ['owner@example.test'], replyDomain: 'reply.example.test', webhookSecret, mailer: async m => { mails.push(m); }, receiver: { getEmail: async id => inbox.get(id), getAttachment: async () => png } });
  await new Promise(resolve => srv.listen(0, resolve));
  const url = `http://localhost:${srv.port ?? srv.address().port}`;
  const call = (p, body, cookie, init = {}) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body), ...init });
  const tok = (m, kind) => new URL(m.text.match(/https?:\/\/\S+/g).find(u => u.includes(kind))).searchParams.get('token');
  const account = async (name, email) => {
    await call('/api/auth/register', { name, email, phone: '', password: 'correct horse battery', consent: true });
    await call('/api/auth/verify', { token: tok(mails.at(-1), 'verify') });
    return (await call('/api/auth/login', { email, password: 'correct horse battery' })).headers.get('set-cookie').split(';')[0];
  };
  try {
    const cust = await account('Casey', 'casey@example.test');
    const owner = await account('Owner', 'owner@example.test');
    const { id } = await (await call('/api/requests', { title: 'Primary bath', projectType: 'Bathroom Remodeling', location: 'Kane County', description: 'Replace tub with walk-in shower.' }, cust)).json();
    assert.strictEqual((await call(`/api/requests/${id}/messages`, { body: 'hi' }, cust)).status, 400); // drafts cannot be messaged
    await call(`/api/requests/${id}/submit`, {}, cust);

    const upload = async (cookie, caption) => (await (await fetch(`${url}/api/requests/${id}/photos`, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Filename': 'a.png', 'X-Caption': encodeURIComponent(caption), Cookie: cookie }, body: png })).json()).id;
    mails.length = 0;
    const photo = await upload(cust, 'Crack behind the tub');
    assert.strictEqual((await call(`/api/requests/${id}/messages`, { body: 'See the photo', photoIds: [photo] }, cust)).status, 201);
    assert.deepStrictEqual(mails.map(m => m.to), ['owner@example.test']);
    assert.match(mails[0].replyTo, /^ticket-\d+-[a-f0-9]{16}@reply\.example\.test$/);
    assert.strictEqual((await call(`/api/requests/${id}/messages`, { body: 'x', photoIds: [photo] }, cust)).status, 400); // photo already attached

    // Staff sees it as unread, replies with a photo and an internal note.
    const inboxList = await (await fetch(`${url}/api/admin/requests`, { headers: { Cookie: owner } })).json();
    assert.strictEqual(inboxList.requests[0].unread, true);
    const view = await (await fetch(`${url}/api/requests/${id}`, { headers: { Cookie: owner } })).json();
    assert.strictEqual(view.staff, true);
    assert.strictEqual(view.request.messages.at(-1).photos[0].caption, 'Crack behind the tub');
    mails.length = 0;
    await call(`/api/requests/${id}/messages`, { body: 'Internal: quote high', internal: true }, owner);
    assert.strictEqual(mails.length, 0);
    const staffPhoto = await upload(owner, 'Sample tile');
    await call(`/api/requests/${id}/messages`, { body: 'Thanks! We can look Tuesday.', photoIds: [staffPhoto] }, owner);
    assert.deepStrictEqual(mails.map(m => m.to), ['casey@example.test']);
    assert.match(mails[0].text, /Reply above this line/);

    const mine = await (await fetch(`${url}/api/requests/${id}`, { headers: { Cookie: cust } })).json();
    assert.strictEqual(mine.request.status, 'awaiting_customer');
    assert.ok(!mine.request.messages.some(m => m.internal));
    assert.strictEqual((await fetch(`${url}/api/photos/${staffPhoto}`, { headers: { Cookie: cust } })).status, 200);
    assert.strictEqual((await call(`/api/requests/${id}/status`, { status: 'in_progress' }, cust)).status, 400);

    // Email reply from the customer arrives through the signed webhook.
    const replyTo = mails[0].replyTo;
    inbox.set('em_1', { text: 'Tuesday works!\n\nOn Mon, Owner wrote:\n> Thanks!\n', html: '' });
    const hook = (data, tamper) => {
      const raw = JSON.stringify({ type: 'email.received', data });
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac('sha256', secretBytes).update(`msg_1.${ts}.${raw}`).digest('base64');
      return fetch(url + '/api/webhooks/resend', { method: 'POST', headers: { 'Content-Type': 'application/json', 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': `v1,${tamper ? 'AAAA' : sig}` }, body: raw });
    };
    const data = { email_id: 'em_1', from: 'casey@example.test', to: [replyTo], attachments: [{ id: 'a1', filename: 'tub.png', content_type: 'image/png', content_disposition: 'attachment' }] };
    assert.strictEqual((await hook(data, true)).status, 401);
    mails.length = 0;
    assert.strictEqual((await (await hook(data)).json()).result, 'ok');
    assert.strictEqual((await (await hook(data)).json()).result, 'duplicate');
    assert.deepStrictEqual(mails.map(m => m.to), ['owner@example.test']);
    assert.strictEqual((await (await hook({ ...data, email_id: 'em_2', from: 'stranger@example.test' })).json()).result, 'unknown-sender');
    assert.strictEqual((await (await hook({ ...data, email_id: 'em_3', to: ['ticket-1-0000000000000000@reply.example.test'] })).json()).result, 'no-ticket');
    const after = (await (await fetch(`${url}/api/requests/${id}`, { headers: { Cookie: cust } })).json()).request;
    const last = after.messages.filter(m => m.kind === 'message').at(-1);
    assert.strictEqual(last.body, 'Tuesday works!');
    assert.strictEqual(last.source, 'email');
    assert.strictEqual(last.photos.length, 1);
    assert.strictEqual(after.status, 'submitted'); // customer reply reopens the conversation

    // Staff status change emails the customer; the customer can close.
    mails.length = 0;
    await call(`/api/requests/${id}/status`, { status: 'resolved' }, owner);
    assert.deepStrictEqual(mails.map(m => m.to), ['casey@example.test']);
    await call('/api/auth/preferences', { notifyEmail: false }, cust);
    mails.length = 0;
    await call(`/api/requests/${id}/messages`, { body: 'Anything else?' }, owner);
    assert.strictEqual(mails.length, 0);
    assert.strictEqual((await call(`/api/requests/${id}/status`, { status: 'closed' }, cust)).status, 200);
  } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
