const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

test('employee portal, jobs, hours, contracts, knowledge base and applications', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-staff-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body, headers = {}) => {
    const bin = Buffer.isBuffer(body);
    const res = await fetch(base + url, { method, headers: { ...(body && !bin ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}), ...headers }, body: body ? (bin ? body : JSON.stringify(body)) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { res, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  const token = to => sent.filter(m => m.to === to).at(-1).text.match(/token=([\w-]+)/)[1];
  try {
    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: token('admin@example.com') });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });

    // Public application
    const application = { name: 'Hank Handy', email: 'hank@example.com', phone: '555-0100', city: 'Aurora', trades: ['Tile setter'], experience: '10 years', over18: 'yes', consent: true };
    assert.equal((await call('anon', 'POST', '/api/applications', { ...application, over18: 'no' })).res.status, 400);
    assert.equal((await call('anon', 'POST', '/api/applications', application)).res.status, 201);
    assert.equal((await call('anon', 'GET', '/api/admin/applications')).res.status, 401);
    const apps = (await call('admin', 'GET', '/api/admin/applications')).data.applications;
    assert.equal(apps[0].data.trades[0], 'Tile setter');

    // Hire: only admins can create employee accounts
    assert.equal((await call('anon', 'POST', '/api/admin/employees', { name: 'X', email: 'x@example.com' })).res.status, 401);
    const hired = await call('admin', 'POST', '/api/admin/employees', { name: 'Hank Handy', email: 'hank@example.com', phone: '555-0100', skipOnboarding: true, roleTitle: 'Tile setter', rate: 25, applicationId: apps[0].id });
    assert.equal(hired.res.status, 201);
    const empId = hired.data.id;
    assert.equal((await call('admin', 'GET', `/api/admin/employees/${empId}`)).data.employee.provisioning.state, 'invited');
    assert.equal((await call('admin', 'POST', '/api/admin/employees', { name: 'Hank', email: 'HANK@example.com' })).res.status, 409);
    const linked = (await call('admin', 'GET', '/api/admin/applications')).data.applications[0];
    assert.equal(linked.status, 'hired');
    assert.equal(linked.employeeId, empId);
    assert.equal((await call('admin', 'POST', `/api/admin/applications/${linked.id}`, { rating: 9 })).res.status, 400);
    assert.equal((await call('admin', 'POST', `/api/admin/applications/${linked.id}`, { rating: 4, interviewAt: 'Dec 1 10am' })).res.status, 200);
    assert.equal((await call('anon', 'GET', '/api/admin/hr')).res.status, 401);
    const hr = (await call('admin', 'GET', '/api/admin/hr')).data;
    assert.equal(hr.pipeline.hired, 1);
    assert.equal(hr.staff.active, 1);
    await call('hank', 'POST', '/api/auth/reset', { token: token('hank@example.com'), password: 'correct-horse-2' });
    assert.equal((await call('hank', 'POST', '/api/auth/login', { email: 'hank@example.com', password: 'correct-horse-2' })).res.status, 200);
    const employeeReady = (await call('hank', 'GET', '/api/provisioning')).data.provisioning;
    assert.equal(employeeReady.state, 'employee');
    assert.equal(employeeReady.ready, true);
    assert.equal((await call('admin', 'GET', '/api/provisioning')).data.provisioning.state, 'admin');
    assert.equal((await call('hank', 'GET', '/api/admin/employees')).res.status, 403);
    assert.equal((await call('hank', 'GET', '/api/employee/me')).data.profile.rateCents, 2500);

    // Jobs: open jobs hide the address until assigned
    const job = (await call('admin', 'POST', '/api/admin/jobs', { title: 'Tile shower', area: 'Aurora', address: '1 Secret Ln', description: 'Reset tile' })).data.id;
    let jobs = (await call('hank', 'GET', '/api/employee/jobs')).data;
    assert.equal(jobs.open.length, 1);
    assert.equal(jobs.open[0].address, undefined);
    assert.equal((await call('hank', 'GET', `/api/employee/jobs/${job}/tools`)).res.status, 404);
    assert.equal((await call('hank', 'POST', `/api/employee/jobs/${job}/interest`, {})).res.status, 201);
    const requests = (await call('admin', 'GET', `/api/admin/employees/${empId}`)).data.requests;
    assert.equal((await call('admin', 'POST', `/api/admin/employee-requests/${requests[0].id}/respond`, { status: 'approved', response: 'Yours.' })).res.status, 200);
    jobs = (await call('hank', 'GET', '/api/employee/jobs')).data;
    assert.equal(jobs.active[0].address, '1 Secret Ln');
    assert.deepEqual((await call('hank', 'GET', `/api/employee/jobs/${job}/tools`)).data.tools, []);
    assert.equal((await call('hank', 'POST', `/api/employee/jobs/${job}/tools/999`, { checked: true })).res.status, 404);
    assert.equal((await call('hank', 'POST', `/api/employee/jobs/${job}/status`, { status: 'completed' })).res.status, 200);
    assert.equal((await call('hank', 'GET', '/api/employee/jobs')).data.history.length, 1);

    // Hours and pay
    assert.equal((await call('hank', 'POST', '/api/employee/hours', { date: new Date().toISOString().slice(0, 10), hours: 4, jobId: job })).res.status, 201);
    const duplicateHours = await call('hank', 'POST', '/api/employee/hours', { date: new Date().toISOString().slice(0, 10), hours: 4, jobId: job });
    assert.equal(duplicateHours.res.status, 200);
    assert.equal(duplicateHours.data.duplicate, true);
    assert.equal((await call('hank', 'POST', '/api/employee/hours', { date: '2020-01-01', hours: 4 })).res.status, 400);
    const entry = (await call('hank', 'GET', '/api/employee/hours')).data.entries[0];
    assert.equal((await call('admin', 'POST', `/api/admin/hours/${entry.id}/approve`, {})).res.status, 400);
    assert.equal((await call('admin', 'POST', `/api/admin/employees/${empId}/payments`, { amount: 40, method: 'Check' })).res.status, 201);
    const pay = (await call('hank', 'GET', '/api/employee/payments')).data;
    assert.equal(pay.totals.earnedCents, 0);
    assert.equal(pay.totals.balanceCents, -4000);

    // Contracts need the typed account name
    await call('admin', 'POST', `/api/admin/employees/${empId}/contracts`, { title: 'Subcontract', body: 'Terms.' });
    const contract = (await call('hank', 'GET', '/api/employee/contracts')).data.contracts[0];
    assert.equal((await call('hank', 'POST', `/api/employee/contracts/${contract.id}/sign`, { name: 'Wrong', agree: true })).res.status, 400);
    assert.equal((await call('hank', 'POST', `/api/employee/contracts/${contract.id}/sign`, { name: 'hank  handy', agree: true })).res.status, 200);
    assert.equal((await call('hank', 'GET', '/api/employee/contracts')).data.contracts[0].status, 'signed');

    // Knowledge base: drafts stay hidden
    await call('admin', 'POST', '/api/admin/kb', { title: 'Waterproofing a shower', category: 'Tile', body: 'Use a membrane.', summary: 'Basics' });
    await call('admin', 'POST', '/api/admin/kb', { title: 'Draft', category: 'Tile', body: 'Hidden', published: false });
    const list = (await call('hank', 'GET', '/api/employee/kb')).data.articles;
    assert.equal(list.length, 1);
    assert.equal((await call('hank', 'GET', '/api/employee/kb?q=membrane')).data.articles.length, 1);
    assert.equal((await call('hank', 'GET', `/api/employee/kb/${list[0].id}`)).data.article.body, 'Use a membrane.');
    await call('admin', 'POST', '/api/admin/kb', { title: 'Tile cutting', category: 'Tile', body: 'Wet saw tips. Waterproofing is separate.', summary: 'Saw' });
    const ranked = (await call('hank', 'GET', '/api/employee/kb?q=waterproofing%20shower')).data;
    assert.equal(ranked.articles.length, 1);
    assert.equal((await call('hank', 'GET', '/api/employee/kb?q=waterproofing')).data.articles[0].title, 'Waterproofing a shower');
    assert.equal((await call('hank', 'GET', '/api/employee/kb')).data.popular[0].title, 'Waterproofing a shower');

    // Urgent requests alert the office immediately; applicants hear about status changes
    assert.equal((await call('hank', 'POST', '/api/employee/requests', { type: 'safety', subject: 'Cut my hand', body: 'Need a ride' })).res.status, 201);
    const alerts = (await call('admin', 'GET', '/api/admin/location')).data.alerts;
    assert.ok(alerts.some(a => a.kind === 'urgent_safety'));
    await call('admin', 'POST', `/api/admin/applications/${linked.id}`, { status: 'interview', interviewAt: 'Dec 2 9am' });
    assert.ok(sent.some(m => m.to === 'hank@example.com' && /interview/i.test(m.subject)));

    // Deactivation blocks the portal
    await call('admin', 'POST', `/api/admin/employees/${empId}`, { status: 'inactive' });
    assert.equal((await call('hank', 'GET', '/api/employee/me')).res.status, 401);
  } finally { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
