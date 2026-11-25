const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../server');
const { createRateLimiter } = require('../lib/api');
const { backup, restore, verifyBackup } = require('../scripts/storage-backup');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pngHead = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const videoHead = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom')]);

test('rate-limit state is hard bounded by keys', () => {
  const limiter = createRateLimiter({ clientIp: req => req.headers['x-forwarded-for'], maxKeys: 3 });
  for (let i = 0; i < 100; i++) limiter.limited({ headers: { 'x-forwarded-for': `10.0.0.${i}` }, socket: { remoteAddress: 'local' } }, 'test', 1);
  assert.equal(limiter.size(), 3);
});

function listen(server) {
  return new Promise(resolve => server.listen(0, resolve));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function streamedUpload({ port, cookie, requestId, head, bytes }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, method: 'POST', path: `/api/requests/${requestId}/photos`,
      headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream', 'Content-Length': head.length + bytes }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    (async () => {
      if (!req.write(head)) await new Promise(r => req.once('drain', r));
      const block = Buffer.alloc(64 * 1024, 1);
      for (let remaining = bytes; remaining > 0;) {
        const chunk = remaining >= block.length ? block : block.subarray(0, remaining);
        remaining -= chunk.length;
        if (!req.write(chunk)) await new Promise(r => req.once('drain', r));
      }
      req.end();
    })().catch(reject);
  });
}

test('media streams bounded uploads, cleans aborts and serves validated ranges', async () => {
  process.env.LOCATION_RETENTION_INTERVAL_MS = '25';
  process.env.SECURITY_RETENTION_INTERVAL_MS = '25';
  process.env.LOCATION_RETENTION_DAYS = '1';
  process.env.SECURITY_RETENTION_DAYS = '1';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-storage-'));
  const sent = [];
  const server = createServer({
    dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.test'],
    mailer: async message => { sent.push(message); },
    gcal: { enabled: false, sync: async () => null, remove: async () => null }
  });
  await listen(server);
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  const cookies = {};
  const call = async (who, method, pathname, body, headers = {}) => {
    const res = await fetch(base + pathname, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookies[who] ? { Cookie: cookies[who] } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookies[who] = setCookie.split(';')[0];
    const text = await res.text();
    return { res, data: text && (res.headers.get('content-type') || '').includes('json') ? JSON.parse(text) : text };
  };
  const db = new DatabaseSync(path.join(dataDir, 'app.db'));
  try {
    for (const [who, email] of [['admin', 'admin@example.test'], ['cust', 'cust@example.test']]) {
      await call(who, 'POST', '/api/auth/register', { name: who, email, password: 'correct-horse-1', consent: true });
      const token = new URL(sent.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
      await call(who, 'POST', '/api/auth/verify', { token });
      await call(who, 'POST', '/api/auth/login', { email, password: 'correct-horse-1' });
    }
    const request = await call('cust', 'POST', '/api/requests', { title: 'Stream test', projectType: 'Shower', location: 'Kane', description: 'A long enough project description.' });
    assert.equal(request.res.status, 201);

    const upload = await streamedUpload({ port, cookie: cookies.cust, requestId: request.data.id, head: videoHead, bytes: 9 * 1024 * 1024 });
    assert.equal(upload.status, 201);
    const mediaId = JSON.parse(upload.body).id;
    const range = await fetch(`${base}/api/photos/${mediaId}`, { headers: { Cookie: cookies.cust, Range: 'bytes=100-199' } });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 100);
    assert.equal((await fetch(`${base}/api/photos/${mediaId}`, { headers: { Cookie: cookies.cust, Range: 'bytes=0-8388608' } })).status, 416);
    assert.equal((await fetch(`${base}/api/photos/${mediaId}`, { headers: { Cookie: cookies.cust, Range: 'items=0-1' } })).status, 416);
    assert.equal((await fetch(`${base}/api/photos/${mediaId}`, { method: 'HEAD', headers: { Cookie: cookies.cust } })).headers.get('accept-ranges'), 'bytes');

    const before = db.prepare('SELECT COUNT(*) AS n FROM photos').get().n;
    const aborted = http.request({ hostname: '127.0.0.1', port, method: 'POST', path: `/api/requests/${request.data.id}/photos`, headers: { Cookie: cookies.cust, 'Content-Type': 'image/png' } });
    aborted.on('error', () => {});
    aborted.write(Buffer.concat([pngHead, Buffer.alloc(64 * 1024, 1)]));
    await new Promise(resolve => setImmediate(resolve));
    aborted.destroy();
    await wait(75);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, before);
    assert.deepEqual(fs.readdirSync(path.join(dataDir, 'uploads')).filter(name => name.startsWith('.ticket-upload-')), []);

    const over = await streamedUpload({ port, cookie: cookies.cust, requestId: request.data.id, head: pngHead, bytes: 9 * 1024 * 1024 - pngHead.length });
    assert.equal(over.status, 413);
    assert.deepEqual(JSON.parse(over.body), { error: 'Videos must be 100 MB or smaller and photos 8 MB or smaller.' });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, before);
    assert.equal((await call('cust', 'POST', '/api/auth/preferences', 'not-json', { 'Content-Type': 'text/plain' })).res.status, 415);

    db.exec("CREATE TRIGGER reject_photo BEFORE INSERT ON photos BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    const failed = await streamedUpload({ port, cookie: cookies.cust, requestId: request.data.id, head: pngHead, bytes: 32 });
    db.exec('DROP TRIGGER reject_photo');
    assert.equal(failed.status, 500);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, before);
    assert.deepEqual(fs.readdirSync(path.join(dataDir, 'uploads')).filter(name => name.endsWith('.png')), []);

    db.prepare("INSERT INTO security_events (kind, severity, created_at) VALUES ('old', 'info', ?)").run(new Date(Date.now() - 3 * 86400000).toISOString());
    const employee = await call('admin', 'POST', '/api/admin/employees', { name: 'Timer Worker', email: 'timer@example.test', skipOnboarding: true, roleTitle: 'Worker', rate: 20 });
    db.prepare("INSERT INTO shifts (employee_id, device_id, clock_in_at, clock_out_at, consent_version, consent_at, consent_ip, consent_ua) VALUES (?, 'old-device', ?, ?, '2026-11', ?, '', '')")
      .run(employee.data.id, new Date(Date.now() - 3 * 86400000).toISOString(), new Date(Date.now() - 3 * 86400000).toISOString(), new Date(Date.now() - 3 * 86400000).toISOString());
    const shiftId = db.prepare('SELECT id FROM shifts ORDER BY id DESC').get().id;
    db.prepare('INSERT INTO location_points (shift_id, lat, lng, accuracy, recorded_at, received_at) VALUES (?, 1, 2, 5, ?, ?)').run(shiftId, new Date(Date.now() - 3 * 86400000).toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO photos (id, request_id, user_id, file, mime, size, original_name, created_at) VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ?, ?, 'missing.png', 'image/png', 1, 'missing', ?)")
      .run(request.data.id, db.prepare('SELECT id FROM users WHERE email = ?').get('cust@example.test').id, new Date().toISOString());
    fs.writeFileSync(path.join(dataDir, 'uploads', 'orphan.bin'), 'orphan');
    await wait(100);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM security_events WHERE kind = 'old'").get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM location_points WHERE shift_id = ?').get(shiftId).n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM photos WHERE id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'").get().n, 0);
    assert.equal(fs.existsSync(path.join(dataDir, 'uploads', 'orphan.bin')), false);

    const backupDir = path.join(dataDir, 'live-backup');
    backup({ dataDir, outputDir: backupDir });
    const restoreDir = path.join(dataDir, 'restored');
    restore({ backupDir, dataDir: restoreDir });
    verifyBackup(restoreDir);
    const restored = new DatabaseSync(path.join(restoreDir, 'app.db'));
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    const restoredPhoto = restored.prepare('SELECT file, size FROM photos WHERE id = ?').get(mediaId);
    assert.ok(restoredPhoto);
    assert.equal(fs.statSync(path.join(restoreDir, 'uploads', restoredPhoto.file)).size, restoredPhoto.size);
    restored.close();
  } finally {
    db.close();
    await close(server);
    delete process.env.LOCATION_RETENTION_INTERVAL_MS;
    delete process.env.SECURITY_RETENTION_INTERVAL_MS;
    delete process.env.LOCATION_RETENTION_DAYS;
    delete process.env.SECURITY_RETENTION_DAYS;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
