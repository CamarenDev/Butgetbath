// Field reporting: daily job check-ins, job photos and videos, and liability records with homeowner consent.
// Everything is append-only for employees so the history stays trustworthy for future reference.
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 300 * 1024;
const MAX_MEDIA_PER_JOB = 600;
const PHASES = ['before', 'demolition', 'rough-in', 'waterproofing', 'tile', 'fixtures', 'finish', 'cleanup', 'after', 'other'];
const MEDIA_KINDS = ['progress', 'issue', 'delivery', 'liability', 'consent'];
const REPORT_STATUS = { on_track: 'On track', delayed: 'Behind schedule', blocked: 'Blocked', done: 'Finished' };
const LIABILITY_TYPES = {
  existing_damage: 'Existing damage found',
  hidden_condition: 'Hidden condition (mold, rot, asbestos, wiring, etc.)',
  scope_change: 'Work outside the agreed scope',
  access_or_property: 'Moving or working around personal property',
  safety: 'Safety concern',
  damage: 'Damage that happened on the job',
  other: 'Other'
};
// The exact wording the employee reads to the homeowner. It is stored with the record.
const CONSENT_SCRIPT = 'I am recording this video. My name is [your name] with Budget Bath Solutions. Please state your name and the date. Do you understand the issue I just showed you, and do you agree to let us proceed as described, on camera?';

function detect(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg', type: 'image' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png', type: 'image' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: '.webp', type: 'image' };
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return buf.subarray(8, 12).toString('latin1') === 'qt  ' ? { mime: 'video/quicktime', ext: '.mov', type: 'video' } : { mime: 'video/mp4', ext: '.mp4', type: 'video' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: 'video/webm', ext: '.webm', type: 'video' };
  return null;
}

function createFieldwork({ db, dataDir, mailer, templates, siteUrl, notifyEmail = '', json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text }) {
  const q = sql => db.prepare(sql);
  const nowIso = () => new Date().toISOString();
  const mail = async message => { try { await mailer(message); } catch (error) { console.error('Email failed:', error.message); } };
  const alertOffice = (subject, body) => notifyEmail ? mail({ to: notifyEmail, ...templates.customerMessage({ name: 'team', subject, body }) }) : null;
  const clean = raw => { try { return decodeURIComponent(String(raw || '')).replace(/[^\w .()-]/g, '').slice(0, 100) || 'file'; } catch { return 'file'; } };
  const header = (req, name, max) => { try { return decodeURIComponent(String(req.headers[name] || '')).trim().slice(0, max); } catch { return ''; } };
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const mediaView = m => ({ id: m.id, kind: m.kind, type: m.type, phase: m.phase, caption: m.caption, mime: m.mime, size: m.size, by: m.by_name || '', createdAt: m.created_at, url: `/api/job-media/${m.id}` });
  const mediaOf = jobId => q('SELECT m.*, u.name AS by_name FROM job_media m LEFT JOIN employees e ON e.id = m.employee_id LEFT JOIN users u ON u.id = e.user_id WHERE m.job_id = ? ORDER BY m.created_at DESC, m.id DESC').all(jobId);
  const reportsOf = jobId => q('SELECT r.*, u.name AS by_name FROM job_reports r LEFT JOIN employees e ON e.id = r.employee_id LEFT JOIN users u ON u.id = e.user_id WHERE r.job_id = ? ORDER BY r.report_date DESC, r.id DESC').all(jobId)
    .map(r => ({ id: r.id, date: r.report_date, status: r.status, statusLabel: REPORT_STATUS[r.status], percent: r.percent, summary: r.summary, remaining: r.remaining, problems: r.problems, materials: r.materials, by: r.by_name || '', updatedAt: r.updated_at }));
  const liabilitiesOf = jobId => q('SELECT l.*, u.name AS by_name FROM job_liabilities l LEFT JOIN employees e ON e.id = l.employee_id LEFT JOIN users u ON u.id = e.user_id WHERE l.job_id = ? ORDER BY l.created_at DESC, l.id DESC').all(jobId)
    .map(l => ({ id: l.id, type: l.type, typeLabel: LIABILITY_TYPES[l.type], description: l.description, homeowner: l.homeowner_name, consented: Boolean(l.consented), consentText: l.consent_text, signatureUrl: l.signature_id ? `/api/job-media/${l.signature_id}` : '', videoUrl: l.video_id ? `/api/job-media/${l.video_id}` : '', photoIds: JSON.parse(l.photo_ids || '[]'), by: l.by_name || '', createdAt: l.created_at, reviewedBy: l.reviewed_by, reviewedAt: l.reviewed_at, reviewNote: l.review_note }));
  const bundle = jobId => ({ reports: reportsOf(jobId), media: mediaOf(jobId).filter(m => m.kind !== 'signature').map(mediaView), liabilities: liabilitiesOf(jobId), phases: PHASES, kinds: MEDIA_KINDS, liabilityTypes: LIABILITY_TYPES, statuses: REPORT_STATUS, consentScript: CONSENT_SCRIPT });

  async function saveFile(jobId, employeeId, data, info, { kind, phase = 'other', caption = '', name = '' }) {
    const id = crypto.randomBytes(16).toString('hex');
    await fs.writeFile(path.join(dataDir, 'uploads', id + info.ext), data, { mode: 0o600 });
    q('INSERT INTO job_media (id, job_id, employee_id, file, mime, type, kind, phase, caption, original_name, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, jobId, employeeId, id + info.ext, info.mime, info.type, kind, phase, caption, name, data.length, nowIso());
    return id;
  }

  async function handle(req, res, pathname, method) {
    let m = pathname.match(/^\/api\/job-media\/([0-9a-f]{32})$/);
    if (m && method === 'GET') {
      const user = currentUser(req);
      const media = user && q('SELECT * FROM job_media WHERE id = ?').get(m[1]);
      const me = user && q("SELECT id FROM employees WHERE user_id = ? AND status = 'active'").get(user.id);
      if (!media || !(isAdmin(user) || (me && q('SELECT 1 FROM job_assignments WHERE job_id = ? AND employee_id = ?').get(media.job_id, me.id)))) { fail(res, 404, 'File not found.'); return true; }
      const data = await fs.readFile(path.join(dataDir, 'uploads', media.file)).catch(() => null);
      if (!data) { fail(res, 404, 'File not found.'); return true; }
      const base = { 'Content-Type': media.mime, 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline' };
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(data.length - Number(range[2]), 0);
        const end = range[1] && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
        if (start > end || start >= data.length) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${data.length}` }); res.end(); return true; }
        res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
        res.end(data.subarray(start, end + 1));
        return true;
      }
      res.writeHead(200, { ...base, 'Content-Length': data.length });
      res.end(data);
      return true;
    }

    // ---- Admin: everything for one job, plus liability review
    m = pathname.match(/^\/api\/admin\/jobs\/(\d+)\/field$/);
    if (m && method === 'GET') {
      const user = currentUser(req);
      if (!isAdmin(user)) { fail(res, 403, 'Admin access required.'); return true; }
      json(res, 200, bundle(Number(m[1])));
      return true;
    }
    m = pathname.match(/^\/api\/admin\/liabilities\/(\d+)\/review$/);
    if (m && method === 'POST') {
      const user = currentUser(req);
      if (!isAdmin(user)) { fail(res, 403, 'Admin access required.'); return true; }
      const parsed = await readJson(req);
      const note = text(parsed.body?.note ?? '', 1000);
      if (parsed.error || note === null || !q('SELECT 1 FROM job_liabilities WHERE id = ?').get(Number(m[1]))) { fail(res, 400, 'Please check the note and try again.'); return true; }
      q('UPDATE job_liabilities SET reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?').run(user.name, nowIso(), note, Number(m[1]));
      json(res, 200, { ok: true });
      return true;
    }
    if (method === 'GET' && pathname === '/api/admin/liabilities') {
      const user = currentUser(req);
      if (!isAdmin(user)) { fail(res, 403, 'Admin access required.'); return true; }
      const rows = q("SELECT l.id, l.job_id, j.title, l.type, l.description, l.consented, l.created_at FROM job_liabilities l JOIN jobs j ON j.id = l.job_id WHERE l.reviewed_at = '' ORDER BY l.created_at DESC LIMIT 100").all();
      json(res, 200, { open: rows.map(r => ({ id: r.id, jobId: r.job_id, job: r.title, typeLabel: LIABILITY_TYPES[r.type], description: r.description, consented: Boolean(r.consented), createdAt: r.created_at })) });
      return true;
    }

    // ---- Employee endpoints for assigned jobs
    m = pathname.match(/^\/api\/employee\/jobs\/(\d+)\/field(?:\/(report|media|liability))?$/);
    if (!m) return false;
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    const me = user.verified ? q("SELECT * FROM employees WHERE user_id = ? AND status = 'active'").get(user.id) : null;
    if (me?.onboarding) { fail(res, 403, 'Finish your onboarding and training first.'); return true; }
    const jobId = Number(m[1]);
    const job = me && q('SELECT j.* FROM jobs j JOIN job_assignments a ON a.job_id = j.id WHERE j.id = ? AND a.employee_id = ?').get(jobId, me.id);
    if (!job) { fail(res, 404, 'Job not found.'); return true; }
    if (!m[2] && method === 'GET') { json(res, 200, bundle(jobId)); return true; }
    if (method !== 'POST' || !m[2]) return false;
    if (limited(req, 'field', 300)) { fail(res, 429, 'Too many submissions. Please try again later.'); return true; }

    if (m[2] === 'media') {
      if (q('SELECT COUNT(*) AS n FROM job_media WHERE job_id = ?').get(jobId).n >= MAX_MEDIA_PER_JOB) { fail(res, 400, 'This job has reached its photo and video limit.'); return true; }
      const data = await readBuffer(req, MAX_VIDEO_BYTES);
      if (data === null) { fail(res, 413, 'Videos must be 100 MB or smaller and photos 12 MB or smaller.'); return true; }
      const info = detect(data);
      if (!info) { fail(res, 415, 'Please upload a JPG, PNG or WebP photo, or an MP4, MOV or WebM video.'); return true; }
      if (info.type === 'image' && data.length > MAX_PHOTO_BYTES) { fail(res, 413, 'Each photo must be 12 MB or smaller.'); return true; }
      const kind = header(req, 'x-kind', 20), phase = header(req, 'x-phase', 20);
      const id = await saveFile(jobId, me.id, data, info, { kind: MEDIA_KINDS.includes(kind) ? kind : 'progress', phase: PHASES.includes(phase) ? phase : 'other', caption: header(req, 'x-caption', 300), name: clean(req.headers['x-filename']) });
      json(res, 201, { id });
      return true;
    }

    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { fail(res, 415, 'Please submit from the website.'); return true; }
    const parsed = await readJson(req, m[2] === 'liability' ? 600 * 1024 : 20000);
    if (parsed.error) { fail(res, parsed.error === 'too-large' ? 413 : 400, 'Please check the form and try again.'); return true; }
    const body = parsed.body || {};

    if (m[2] === 'report') {
      const date = body.date || nowIso().slice(0, 10);
      const summary = text(body.summary, 4000), remaining = text(body.remaining ?? '', 3000), problems = text(body.problems ?? '', 3000), materials = text(body.materials ?? '', 2000);
      const percent = Math.round(Number(body.percent));
      if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date)) || date > nowIso().slice(0, 10) || !summary || remaining === null || problems === null || materials === null) { fail(res, 400, 'Describe how the day went, and check the date.'); return true; }
      if (!REPORT_STATUS[body.status] || !(percent >= 0 && percent <= 100)) { fail(res, 400, 'Choose the job status and a percent complete from 0 to 100.'); return true; }
      if (body.status !== 'done' && !remaining) { fail(res, 400, 'Say what is left to do.'); return true; }
      if (['delayed', 'blocked'].includes(body.status) && !problems) { fail(res, 400, 'Explain what is causing the delay.'); return true; }
      const at = nowIso();
      q('INSERT INTO job_reports (job_id, employee_id, report_date, status, percent, summary, remaining, problems, materials, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(job_id, employee_id, report_date) DO UPDATE SET status = excluded.status, percent = excluded.percent, summary = excluded.summary, remaining = excluded.remaining, problems = excluded.problems, materials = excluded.materials, updated_at = excluded.updated_at')
        .run(jobId, me.id, date, body.status, percent, summary, remaining, problems, materials, at, at);
      if (problems || body.status !== 'on_track') await alertOffice(`Job #${jobId} daily report: ${REPORT_STATUS[body.status]}`, `${user.name} reported on "${job.title}" for ${date}.\n\nStatus: ${REPORT_STATUS[body.status]} (${percent}% complete)\n\nProblems: ${problems || 'None'}\n\nLeft to do: ${remaining || 'Nothing'}\n\nMaterials needed: ${materials || 'None'}\n\n${siteUrl}/admin/`);
      json(res, 201, bundle(jobId));
      return true;
    }

    // Liability record: what happened, whether the homeowner agreed, a signature and a video of the conversation.
    const type = String(body.type || '');
    const description = text(body.description, 4000), homeowner = text(body.homeowner, 120);
    if (!LIABILITY_TYPES[type] || !description || !homeowner) { fail(res, 400, 'Choose a type, describe what you found or did, and enter the homeowner name.'); return true; }
    const consented = body.consented === true;
    const own = id => typeof id === 'string' && q('SELECT * FROM job_media WHERE id = ? AND job_id = ?').get(id, jobId);
    let videoId = '', signatureId = '';
    if (consented) {
      const video = own(body.videoId);
      if (!video || video.type !== 'video') { fail(res, 400, 'Record and attach the video of the homeowner giving permission.'); return true; }
      videoId = video.id;
      const sig = String(body.signature || '');
      const png = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(sig);
      const raw = png && Buffer.from(png[1], 'base64');
      const info = raw && raw.length >= 200 && raw.length <= MAX_SIGNATURE_BYTES && detect(raw);
      if (!info || info.mime !== 'image/png') { fail(res, 400, 'The homeowner must sign on the screen.'); return true; }
      signatureId = await saveFile(jobId, me.id, raw, info, { kind: 'signature', caption: `Signature of ${homeowner}` });
    }
    const photoIds = Array.isArray(body.photoIds) ? body.photoIds.filter(own).slice(0, 20) : [];
    const result = q('INSERT INTO job_liabilities (job_id, employee_id, type, description, homeowner_name, consented, consent_text, signature_id, video_id, photo_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(jobId, me.id, type, description, homeowner, consented ? 1 : 0, consented ? `${homeowner} agreed on video and signed on ${nowIso()}.` : `${homeowner} did NOT agree. Work on this item must stop until the office approves.`, signatureId, videoId, JSON.stringify(photoIds), nowIso());
    await alertOffice(`${consented ? 'Liability recorded' : 'HOMEOWNER DECLINED'}: ${LIABILITY_TYPES[type]} on job #${jobId}`, `${user.name} recorded an item on "${job.title}".\n\nType: ${LIABILITY_TYPES[type]}\nHomeowner: ${homeowner}\nPermission: ${consented ? 'Given on video and by signature' : 'Declined. Stop work on this item until you call the homeowner.'}\n\n${description}\n\n${siteUrl}/admin/`);
    json(res, 201, { id: Number(result.lastInsertRowid), ...bundle(jobId) });
    return true;
  }

  return { handle, bundle };
}

module.exports = { createFieldwork, PHASES, LIABILITY_TYPES, REPORT_STATUS };
