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
  for (const p of ['/privacy/', '/terms/', '/accessibility/', '/work-with-us/', '/contact/', '/account/', '/account/login/', '/account/register/', '/account/new/', '/gallery/']) assert.strictEqual((await fetch(base + p)).status, 200, p);
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

test('admin portal API: access control, placeholders, uploads, review moderation, forum and contacts', async () => {
  // Public pages and static forum articles
  assert.match(await (await fetch(base + '/forum/toilet-overflowing-what-to-do-right-now-step-by-step/')).text(), /"@type":"Article"/);
  assert.match(await (await fetch(base + '/admin/')).text(), /noindex/);
  assert.doesNotMatch(await (await fetch(base + '/sitemap.xml')).text(), /\/admin\//);

  // Admin routes need an admin session
  for (const p of ['/api/admin/stats', '/api/admin/media', '/api/admin/contacts']) assert.strictEqual((await fetch(base + p)).status, 401);
  await post('/api/auth/register', { name: 'Casey', email: 'portal-casey@example.test', phone: '', password: 'correct horse battery', consent: true });
  await post('/api/auth/verify', { token: tokenFrom(sent.at(-1), 'verify') });
  const user = (await post('/api/auth/login', { email: 'portal-casey@example.test', password: 'correct horse battery' })).headers.get('set-cookie').split(';')[0];
  assert.strictEqual((await fetch(base + '/api/admin/stats', { headers: { Cookie: user } })).status, 403);

  await post('/api/auth/register', { name: 'Owner', email: 'owner@example.test', phone: '', password: 'correct horse battery', consent: true }).catch(() => {});
  const login = await post('/api/auth/login', { email: 'owner@example.test', password: 'correct horse battery' });
  let admin;
  if (login.status === 200) admin = login.headers.get('set-cookie').split(';')[0];
  else { await post('/api/auth/verify', { token: tokenFrom(sent.at(-1), 'verify') }); admin = (await post('/api/auth/login', { email: 'owner@example.test', password: 'correct horse battery' })).headers.get('set-cookie').split(';')[0]; }
  const get = async p => (await fetch(base + p, { headers: { Cookie: admin } })).json();

  // Placeholder, then upload replaces it, then reset restores it
  const ph = await fetch(base + '/media/community-banner');
  assert.match(ph.headers.get('content-type'), /svg/);
  const slots = (await get('/api/admin/media')).slots;
  assert.ok(slots.find(s => s.slot === 'community-banner' && !s.custom));
  assert.strictEqual((await fetch(base + '/api/admin/media/community-banner', { method: 'POST', headers: { Cookie: admin, 'Content-Type': 'image/png', Origin: base }, body: Buffer.from('not an image') })).status, 415);
  assert.strictEqual((await fetch(base + '/api/admin/media/community-banner', { method: 'POST', headers: { Cookie: admin, 'Content-Type': 'image/png', Origin: base }, body: png })).status, 201);
  assert.match((await fetch(base + '/media/community-banner')).headers.get('content-type'), /png/);
  assert.strictEqual((await fetch(base + '/api/admin/media/community-banner', { method: 'DELETE', headers: { Cookie: admin, Origin: base } })).status, 200);
  assert.match((await fetch(base + '/media/community-banner')).headers.get('content-type'), /svg/);

  // Reviews are held for moderation, then published by the admin
  assert.strictEqual((await post('/api/reviews', { name: 'Dana', town: 'Geneva', rating: 5, text: 'Great tile work on our shower.' })).status, 201);
  const pending = (await get('/api/admin/reviews')).reviews.find(r => r.name === 'Dana');
  assert.strictEqual(pending.status, 'pending');
  assert.ok(!(await (await fetch(base + '/api/public/portfolio')).text()).includes('Great tile work'));
  assert.strictEqual((await post(`/api/admin/reviews/${pending.id}`, { status: 'published' }, admin)).status, 200);
  assert.ok((await (await fetch(base + '/api/public/portfolio')).text()).includes('Great tile work'));

  // Forum: starter topics exist, the Team can post, hiding removes from public list
  const topics = await (await fetch(base + '/api/forum/threads')).json();
  assert.ok(topics.total > 0);
  const created = await post('/api/forum/threads', { title: 'Welcome from the team', body: 'A short test post.', category: (await get('/api/admin/forum')).categories[0].slug, asTeam: true }, admin);
  assert.strictEqual(created.status, 201);
  const { id: tid } = await created.json();
  assert.strictEqual((await post(`/api/admin/forum/threads/${tid}`, { status: 'hidden' }, admin)).status, 200);
  assert.strictEqual((await fetch(`${base}/api/forum/threads/${tid}`)).status, 404);

  // Contacts and stats
  await post('/api/submissions', { type: 'project', name: 'Lee', email: 'lee@example.test', phone: '', location: 'Kane County', interest: 'Tile Installation', message: 'Hello', consent: true });
  const contacts = (await get('/api/admin/contacts')).contacts;
  const lee = contacts.find(c => c.email === 'lee@example.test');
  assert.strictEqual((await post(`/api/admin/contacts/${lee.id}`, { status: 'contacted', notes: 'Called back' }, admin)).status, 200);
  assert.strictEqual((await get('/api/admin/stats')).series.length, 30);

  // Visit tracking is off until the admin enables it
  assert.ok([200, 204].includes((await post('/api/track', { path: '/gallery/' })).status));
  assert.strictEqual((await get('/api/admin/stats')).month.views, 0);
  await post('/api/admin/settings', { banner: 'Spring special', bannerOn: true, analyticsOn: true }, admin);
  await post('/api/track', { path: '/gallery/' });
  assert.strictEqual((await get('/api/admin/stats')).month.views, 1);
  assert.strictEqual((await (await fetch(base + '/api/public/site')).json()).banner, 'Spring special');
});

test('appointments: staff schedule, customer gets confirmation with .ics, calendar feed, reschedule and cancel', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-a-'));
  const mails = [];
  const pushed = [];
  const gcal = { enabled: true, upsert: async e => { pushed.push(['upsert', e.appointment.status]); return 'g1'; }, remove: async id => { pushed.push(['remove', id]); } };
  const srv = createServer({ dataDir: dir, siteUrl: 'https://example.test', notifyEmail: 'owner@example.test', adminEmails: ['owner@example.test'], mailer: async m => { mails.push(m); }, gcal });
  await new Promise(resolve => srv.listen(0, resolve));
  const url = `http://localhost:${srv.address().port}`;
  const call = (p, body, cookie) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) });
  const get = (p, cookie) => fetch(url + p, { headers: cookie ? { Cookie: cookie } : {} });
  const tok = m => new URL(m.text.match(/https?:\/\/\S+/g).find(u => u.includes('verify'))).searchParams.get('token');
  const account = async (name, email) => {
    await call('/api/auth/register', { name, email, phone: '', password: 'correct horse battery', consent: true });
    await call('/api/auth/verify', { token: tok(mails.at(-1)) });
    return (await call('/api/auth/login', { email, password: 'correct horse battery' })).headers.get('set-cookie').split(';')[0];
  };
  try {
    const cust = await account('Casey', 'casey@example.test');
    const other = await account('Dana', 'dana@example.test');
    const owner = await account('Owner', 'owner@example.test');
    const { id } = await (await call('/api/requests', { title: 'Primary bath', projectType: 'Bathroom Remodeling', location: 'Kane County', description: 'Replace tub with walk-in shower.' }, cust)).json();
    await call(`/api/requests/${id}/submit`, {}, cust);
    const startsAt = new Date(Date.now() + 3 * 86400000).toISOString();
    const details = { startsAt, durationMin: 60, kind: 'in_home', location: '12 Oak St, Geneva, IL', notes: 'Please clear the vanity.' };

    assert.strictEqual((await call(`/api/requests/${id}/appointments`, details, cust)).status, 403);
    assert.strictEqual((await call(`/api/requests/${id}/appointments`, { ...details, startsAt: '2001-01-01T00:00:00Z' }, owner)).status, 400);
    mails.length = 0;
    const created = await call(`/api/requests/${id}/appointments`, details, owner);
    assert.strictEqual(created.status, 201);
    const appt = (await created.json()).appointment;
    assert.deepStrictEqual(mails.map(m => m.to), ['casey@example.test']);
    const ics = Buffer.from(mails[0].attachments[0].content, 'base64').toString().replace(/\r\n /g, '');
    assert.match(ics, /METHOD:REQUEST/);
    assert.match(ics, /ATTENDEE;[^\r\n]*mailto:casey@example\.test/);
    assert.match(mails[0].text, /calendar\.google\.com\/calendar\/render/);
    assert.deepStrictEqual(pushed.at(-1), ['upsert', 'scheduled']);

    assert.strictEqual((await get(`/api/appointments/${appt.id}/ics`, other)).status, 404);
    const download = await get(`/api/appointments/${appt.id}/ics`, cust);
    assert.match(download.headers.get('content-type'), /text\/calendar/);
    assert.match(await download.text(), /BEGIN:VEVENT[\s\S]*SUMMARY:In-home estimate/);
    assert.strictEqual((await (await get('/api/appointments', cust)).json()).appointments.length, 1);
    assert.strictEqual((await (await get('/api/appointments', other)).json()).appointments.length, 0);

    const { feedUrl } = await (await get('/api/calendar/info', owner)).json();
    assert.strictEqual((await get('/api/calendar/info', cust)).status, 403);
    assert.strictEqual((await fetch(feedUrl.replace('example.test', `localhost:${srv.address().port}`).replace('https', 'http'))).status, 200);
    assert.strictEqual((await get('/api/calendar/feed.ics?token=wrong')).status, 404);

    mails.length = 0;
    assert.strictEqual((await call(`/api/appointments/${appt.id}/reschedule`, details, cust)).status, 403);
    assert.strictEqual((await call(`/api/appointments/${appt.id}/reschedule`, { ...details, durationMin: 90 }, owner)).status, 200);
    assert.match(Buffer.from(mails[0].attachments[0].content, 'base64').toString(), /SEQUENCE:1/);

    mails.length = 0;
    assert.strictEqual((await call(`/api/appointments/${appt.id}/cancel`, {}, cust)).status, 200);
    assert.deepStrictEqual(mails.map(m => m.to).sort(), ['casey@example.test', 'owner@example.test']);
    assert.match(Buffer.from(mails.find(m => m.to === 'casey@example.test').attachments[0].content, 'base64').toString(), /METHOD:CANCEL/);
    assert.deepStrictEqual(pushed.at(-1), ['remove', 'g1']);
    const repeatedCancel = await call(`/api/appointments/${appt.id}/cancel`, {}, cust);
    assert.strictEqual(repeatedCancel.status, 200, await repeatedCancel.clone().text());
    assert.strictEqual((await repeatedCancel.json()).duplicate, true);
  } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('serves compressed, cacheable assets plus health, manifest and security.txt', async () => {
  const css = await fetch(base + '/vendor/bootstrap.min.css', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.strictEqual(css.headers.get('content-encoding'), 'gzip');
  assert.match(css.headers.get('cache-control'), /immutable/);
  const etag = css.headers.get('etag');
  assert.strictEqual((await fetch(base + '/vendor/bootstrap.min.css', { headers: { 'If-None-Match': etag } })).status, 304);
  assert.deepStrictEqual(await (await fetch(base + '/healthz')).json(), { status: 'ok' });
  assert.strictEqual((await fetch(base + '/site.webmanifest')).status, 200);
  assert.match(await (await fetch(base + '/.well-known/security.txt')).text(), /^Contact:/);
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/account\//);
});

test('landmarks, image hints and breadcrumbs are present', async () => {
  const guide = await (await fetch(base + '/homeowner-help/bathroom-remodel-cost-2026/')).text();
  assert.match(guide, /<nav class="col-6 col-lg-2" aria-label="Services">/);
  assert.match(guide, /"@type":"BreadcrumbList"/);
  assert.match(guide, /aria-current="page"/);
  assert.match(guide, /fetchpriority="high"/);
});

test('SEO audit: unique titles, one h1, valid JSON-LD, town and cost pages, llms.txt', async () => {
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  const urls = [...sitemap.matchAll(/<loc>https:\/\/budgetbathsolutions\.com([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(urls.length > 100);
  assert.ok(urls.includes('/service-areas/kane-county/aurora/') && urls.includes('/bathroom-remodel-cost/tile-installation-cost/') && urls.includes('/how-it-works/'));
  const titles = new Set();
  for (const u of urls) {
    const html = await (await fetch(base + u)).text();
    const title = html.match(/<title>([^<]+)<\/title>/)[1].replace(/&amp;/g, '&');
    assert.ok(!titles.has(title), `duplicate title ${title}`);
    titles.add(title);
    assert.ok(title.length <= 63, `title too long on ${u}`);
    const desc = html.match(/<meta name="description" content="([^"]*)">/)[1].replace(/&(amp|quot|#39|lt|gt);/g, '_');
    assert.ok(desc.length >= 20 && desc.length <= 160, `description length on ${u}`);
    assert.strictEqual((html.match(/<h1[ >]/g) || []).length, 1, `h1 count on ${u}`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)) JSON.parse(m[1]);
  }
  const llms = await fetch(base + '/llms.txt');
  assert.strictEqual(llms.status, 200);
  assert.match(await llms.text(), /Aurora, IL/);
});

test('SEO generator keeps lastmod stable until a page really changes and lists every indexed page', () => {
  const os = require('node:os'), fs = require('node:fs'), path = require('node:path');
  const { generateSeoFiles } = require('../lib/seo');
  const statePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seo-')), 'state.json');
  const site = { name: 'Test Co', url: 'https://example.com' };
  const make = (html, today) => generateSeoFiles({ site, statePath, today, intro: 'Intro', keyPages: ['/a/'], towns: [], pages: [{ url: '/', html: 'home' }, { url: '/a/', html }, { url: '/private/', html: 'x', noindex: true }] });
  const first = make('one', '2026-01-01');
  fs.writeFileSync(statePath, JSON.stringify(first.state));
  const same = make('one updated 2026-05-05', '2026-02-02');
  assert.equal(first.files['sitemap.xml'].includes('/private/'), false);
  assert.equal(first.files['llms.txt'].includes('https://example.com/a/'), true);
  assert.match(first.files['robots.txt'], /Sitemap: https:\/\/example.com\/sitemap.xml/);
  assert.equal(same.state['/'].lastmod, '2026-01-01');
  assert.equal(same.state['/a/'].lastmod, '2026-02-02');
});
