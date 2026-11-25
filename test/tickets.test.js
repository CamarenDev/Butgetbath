const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createServer } = require('../server');
const { createMailer, createReceiver } = require('../lib/mailer');
const { createSeoSync } = require('../lib/seo-sync');
const { analyze } = require('../lib/vision');

async function start() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-tickets-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body, headers = {}) => {
    const isBin = Buffer.isBuffer(body);
    const res = await fetch(base + url, { method, headers: { ...(body && !isBin ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}), ...headers }, body: body ? (isBin ? body : JSON.stringify(body)) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { res, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  const signUp = async (who, email) => {
    await call(who, 'POST', '/api/auth/register', { name: who, email, password: 'correct-horse-1', consent: true });
    const link = sent.filter(m => m.to === email).map(m => (m.text || m.html || '')).join('\n').match(/token=([\w-]+)/);
    await call(who, 'POST', '/api/auth/verify', { token: link[1] });
    await call(who, 'POST', '/api/auth/login', { email, password: 'correct-horse-1' });
  };
  return { server, call, signUp, dataDir, close: () => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

test('tickets accept videos, serve ranges, track priority and show appointments', async () => {
  const t = await start();
  try {
    await t.signUp('cust', 'cust@example.com');
    await t.signUp('admin', 'admin@example.com');
    const created = await t.call('cust', 'POST', '/api/requests', { title: 'Tub to shower', projectType: 'Tub to shower', location: 'Bergen', description: 'Replace the old tub please.', category: 'Existing damage or leaks' });
    assert.equal(created.res.status, 201);
    const id = created.data.id;
    assert.equal((await t.call('cust', 'POST', '/api/requests', { title: 'x', projectType: 'x', location: 'x', description: 'long enough text', category: 'Nope' })).res.status, 400);

    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(200, 1)]);
    const up = await t.call('cust', 'POST', `/api/requests/${id}/photos`, mp4, { 'X-Filename': 'tour.mp4', 'X-Caption': 'Walkthrough' });
    assert.equal(up.res.status, 201);
    assert.equal((await t.call('cust', 'POST', `/api/requests/${id}/photos`, Buffer.alloc(300, 7))).res.status, 415);

    const range = await t.call('cust', 'GET', `/api/photos/${up.data.id}`, null, { Range: 'bytes=0-9' });
    assert.equal(range.res.status, 206);
    assert.equal(range.res.headers.get('content-type'), 'video/mp4');
    assert.equal(range.data.length, 10);

    await t.call('cust', 'POST', `/api/requests/${id}/submit`, {});
    const detail = await t.call('cust', 'GET', `/api/requests/${id}`);
    assert.equal(detail.data.request.photos[0].kind, 'video');
    assert.equal(detail.data.request.category, 'Existing damage or leaks');
    assert.deepEqual(detail.data.request.appointments, []);

    assert.equal((await t.call('cust', 'POST', `/api/requests/${id}/priority`, { priority: 'urgent' })).res.status, 404);
    assert.equal((await t.call('admin', 'POST', `/api/requests/${id}/priority`, { priority: 'urgent' })).res.status, 200);
    const list = await t.call('admin', 'GET', '/api/admin/requests');
    assert.equal(list.data.requests[0].priority, 'urgent');
    assert.equal(list.data.requests[0].nextAppointment, null);
  } finally { t.close(); }
});

test('email and AI integrations expose truthful bounded provider outcomes', async () => {
  const off = createMailer({ apiKey: '', from: '' });
  assert.equal(off.capability().state, 'disabled');
  assert.equal((await off({ to: 'x@example.com', subject: 'Test' })).ok, false);

  const calls = [];
  const mailer = createMailer({
    apiKey: 'test-key', from: 'Budget Bath <test@example.com>',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: 'resend-message-id' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const sent = await mailer({ to: 'customer@example.com', subject: 'Contract fixture', text: 'hello' });
  assert.equal(sent.ok, true);
  assert.equal(JSON.parse(calls[0].init.body).from, 'Budget Bath <test@example.com>');

  let attachmentUrl = 'https://attachments.resend.com/download/fixture';
  const receiver = createReceiver({
    apiKey: 'test-key',
    fetchImpl: async url => {
      if (String(url).includes('/attachments/')) return new Response(JSON.stringify({ download_url: attachmentUrl, content_type: 'image/png' }), { status: 200 });
      return new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { 'content-type': 'image/png', 'content-length': '4' } });
    }
  });
  assert.equal((await receiver.getAttachment('email-1', 'att-1')).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), true);
  attachmentUrl = 'https://evil.example/steal';
  await assert.rejects(() => receiver.getAttachment('email-1', 'att-1'), /untrusted host/);

  const vision = await analyze({
    images: ['data:image/png;base64,iVBORw0KGgo='], notes: 'fixture', env: { AI_API_KEY: 'fixture-key' },
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ inputs: { length: 9, unknown: true }, confidence: 0.8 }) } }] }), { status: 200 })
  });
  assert.equal(vision.status, 200);
  assert.equal(vision.result.inputs.length, 9);
  assert.equal(vision.result.inputs.unknown, undefined);
  assert.equal(vision.result.metadata.model.verified, false);
  assert.equal(vision.result.metadata.model.source, 'bundled application default');
});

test('SEO sync coalesces overlap and commits once', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-seo-sync-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist', 'old.txt'), 'old');
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  let spawns = 0;
  const seo = createSeoSync({
    json() {}, fail() {}, currentUser() {}, isAdmin() { return true; }, env: { SEO_AUTO: '0' }, rootDir: root,
    spawnImpl: () => { spawns++; return child; }
  });
  const first = seo.run('first');
  const overlap = seo.run('overlap');
  assert.equal(first, overlap);
  fs.mkdirSync(path.join(root, 'dist.next'));
  fs.writeFileSync(path.join(root, 'dist.next', 'new.txt'), 'new');
  child.stdout.end('built\n');
  child.stderr.end('');
  child.emit('close', 0);
  assert.equal(await first, true);
  assert.equal(spawns, 1);
  assert.equal(fs.readFileSync(path.join(root, 'dist', 'new.txt'), 'utf8'), 'new');
  assert.equal(fs.existsSync(path.join(root, 'dist.next')), false);
});

test('SEO sync records spawn failure and bounds child output without partial publication', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-seo-fail-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist', 'old.txt'), 'stable');
  const direct = createSeoSync({
    json() {}, fail() {}, currentUser() {}, isAdmin() { return true; }, env: { SEO_AUTO: '0' }, rootDir: root,
    spawnImpl: () => { throw new Error('spawn unavailable'); }
  });
  assert.equal(await direct.run('spawn failure'), false);
  assert.match(direct.status().lastError, /spawn unavailable/);
  assert.equal(fs.readFileSync(path.join(root, 'dist', 'old.txt'), 'utf8'), 'stable');

  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  const bounded = createSeoSync({
    json() {}, fail() {}, currentUser() {}, isAdmin() { return true; }, env: { SEO_AUTO: '0' }, rootDir: root,
    spawnImpl: () => child, outputLimit: 32
  });
  const failed = bounded.run('oversized output');
  child.stderr.end('x'.repeat(5000));
  child.emit('close', 2);
  assert.equal(await failed, false);
  assert.ok(bounded.status().lastError.length <= 1200);
  assert.equal(fs.existsSync(path.join(root, 'dist.next')), false);
});
