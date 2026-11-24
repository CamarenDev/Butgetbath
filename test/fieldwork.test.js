const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(64, 2)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 3)]);

test('field reports: daily check-ins, photos and liability consent', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-field-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: 'office@example.com', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body, headers = {}) => {
    const raw = Buffer.isBuffer(body);
    const res = await fetch(base + url, { method, headers: { ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers, ...(jar[who] ? { Cookie: jar[who] } : {}) }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    return { res, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
  };
  const token = to => sent.filter(m => m.to === to).at(-1).text.match(/token=([\w-]+)/)[1];
  try {
    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: token('admin@example.com') });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    const empId = (await call('admin', 'POST', '/api/admin/employees', { name: 'Hank Handy', email: 'hank@example.com', skipOnboarding: true, roleTitle: 'Tile setter', rate: 25 })).data.id;
    await call('hank', 'POST', '/api/auth/reset', { token: token('hank@example.com'), password: 'correct-horse-2' });
    await call('hank', 'POST', '/api/auth/login', { email: 'hank@example.com', password: 'correct-horse-2' });
    const jobId = (await call('admin', 'POST', '/api/admin/jobs', { title: 'Tile shower', address: '1 Main' })).data.id;
    const other = (await call('admin', 'POST', '/api/admin/jobs', { title: 'Other', address: '2 Main' })).data.id;
    await call('admin', 'POST', `/api/admin/jobs/${jobId}/assign`, { employeeIds: [empId] });
    const url = `/api/employee/jobs/${jobId}/field`;
    assert.equal((await call('hank', 'GET', `/api/employee/jobs/${other}/brief`)).res.status, 404);
    assert.equal((await call('hank', 'GET', `/api/employee/jobs/${jobId}/brief`)).data.brief, null);

    // Only assigned employees can use a job's field tools
    assert.equal((await call('hank', 'GET', `/api/employee/jobs/${other}/field`)).res.status, 404);
    assert.equal((await call('anon', 'GET', url)).res.status, 401);

    // Daily report rules and one report per day
    const report = { status: 'delayed', percent: 40, summary: 'Set the pan.', remaining: 'Tile walls', problems: '' };
    assert.equal((await call('hank', 'POST', `${url}/report`, report)).res.status, 400);
    assert.equal((await call('hank', 'POST', `${url}/report`, { ...report, problems: 'Wall was out of plumb' })).res.status, 201);
    const again = await call('hank', 'POST', `${url}/report`, { ...report, status: 'on_track', percent: 55 });
    assert.equal(again.data.reports.length, 1);
    assert.equal(again.data.reports[0].percent, 55);
    assert.ok(sent.some(m => m.to === 'office@example.com' && /daily report/i.test(m.subject)));

    // Uploads are identified by content
    const up = (data, kind) => call('hank', 'POST', `${url}/media`, data, { 'Content-Type': 'application/octet-stream', 'X-Kind': kind, 'X-Phase': 'tile', 'X-Caption': 'Wall' });
    assert.equal((await up(Buffer.from('not an image at all'), 'progress')).res.status, 415);
    const photo = await up(JPEG, 'progress');
    assert.equal(photo.res.status, 201);
    const video = (await up(MP4, 'consent')).data.id;
    const shown = await fetch(base + `/api/job-media/${photo.data.id}`, { headers: { Cookie: jar.hank } });
    assert.equal(shown.headers.get('content-type'), 'image/jpeg');
    assert.equal((await fetch(base + `/api/job-media/${photo.data.id}`)).status, 404);

    // Liability: permission needs a video and a signature; a refusal is recorded and alerts the office
    const item = { type: 'existing_damage', description: 'Cracked vanity top', homeowner: 'Pat Owner', consented: true };
    assert.equal((await call('hank', 'POST', `${url}/liability`, { ...item, signature: `data:image/png;base64,${PNG.toString('base64')}` })).res.status, 400);
    assert.equal((await call('hank', 'POST', `${url}/liability`, { ...item, videoId: video, signature: '' })).res.status, 400);
    const saved = await call('hank', 'POST', `${url}/liability`, { ...item, videoId: video, signature: `data:image/png;base64,${PNG.toString('base64')}` });
    assert.equal(saved.res.status, 201);
    assert.ok(saved.data.liabilities[0].signatureUrl && saved.data.liabilities[0].videoUrl);
    const refused = await call('hank', 'POST', `${url}/liability`, { ...item, consented: false });
    assert.equal(refused.res.status, 201);
    assert.ok(sent.some(m => /HOMEOWNER DECLINED/.test(m.subject)));

    // Admin sees everything, can open files and review records
    const all = await call('admin', 'GET', `/api/admin/jobs/${jobId}/field`);
    assert.equal(all.data.liabilities.length, 2);
    assert.equal(all.data.media.every(m => m.kind !== 'signature'), true);
    assert.equal((await fetch(base + saved.data.liabilities[0].signatureUrl, { headers: { Cookie: jar.admin } })).status, 200);
    assert.equal((await call('hank', 'GET', '/api/admin/liabilities')).res.status, 403);
    assert.equal((await call('admin', 'POST', `/api/admin/liabilities/${saved.data.id}/review`, { note: 'Reviewed' })).res.status, 200);
    assert.equal((await call('admin', 'GET', '/api/admin/liabilities')).data.open.length, 1);

    // Admin notes history on an employee
    assert.equal((await call('admin', 'POST', `/api/admin/employees/${empId}/notes`, { body: '' })).res.status, 400);
    assert.equal((await call('hank', 'POST', `/api/admin/employees/${empId}/notes`, { body: 'x' })).res.status, 403);
    assert.equal((await call('admin', 'POST', `/api/admin/employees/${empId}/notes`, { body: 'Always on time' })).res.status, 201);
    const withNote = (await call('admin', 'GET', `/api/admin/employees/${empId}`)).data;
    assert.equal(withNote.noteLog[0].body, 'Always on time');
    assert.equal((await call('hank', 'GET', '/api/employee/me')).data?.noteLog, undefined);
    await call('admin', 'POST', `/api/admin/employees/${empId}/notes/${withNote.noteLog[0].id}/delete`, {});
    assert.equal((await call('admin', 'GET', `/api/admin/employees/${empId}`)).data.noteLog.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
