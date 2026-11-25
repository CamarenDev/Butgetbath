// Employee portal. All data is inserted with textContent / setAttribute (never innerHTML).
(() => {
  const root = document.querySelector('[data-employee-page]');
  if (!root) return;
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (v === false || v == null) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || 'Something went wrong. Please try again.'); error.status = response.status; throw error; }
    return data;
  };
  const pendingPosts = new Map();
  const send = (url, body) => {
    const payload = JSON.stringify(body || {}), key = `${url}:${payload}`;
    if (pendingPosts.has(key)) return pendingPosts.get(key);
    const run = api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    pendingPosts.set(key, run);
    run.finally(() => pendingPosts.delete(key)).catch(() => {});
    return run;
  };
  const money = c => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const hrs = m => `${(m / 60).toFixed(2).replace(/\.?0+$/, '')} h`;
  const day = v => v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const stamp = v => v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const COLORS = { open: 'primary', in_progress: 'info', completed: 'success', cancelled: 'secondary', pending: 'warning', approved: 'success', signed: 'success', denied: 'danger', rejected: 'danger' };
  const badge = text => el('span', { class: `badge text-bg-${COLORS[text] || 'secondary'}`, text: text.replace('_', ' ') });
  let alertBox;
  const notice = (kind, message) => { alertBox.className = `alert alert-${kind}`; alertBox.textContent = message; alertBox.scrollIntoView({ block: 'nearest' }); };
  const act = fn => async (...a) => {
    const control = a[0]?.currentTarget;
    if (control?.dataset?.pending) return;
    const label = control?.textContent;
    if (control?.disabled !== undefined) { control.disabled = true; control.dataset.pending = '1'; control.setAttribute('aria-busy', 'true'); control.textContent = 'Working…'; }
    try { await fn(...a); } catch (e) { if (e.status === 401 || e.status === 403) return boot(); notice('danger', e.message); }
    finally { if (control?.isConnected) { control.disabled = false; control.textContent = label; control.removeAttribute('aria-busy'); delete control.dataset.pending; } }
  };
  const button = (label, onclick, cls = 'btn-outline-dark') => el('button', { type: 'button', class: `btn btn-sm ${cls}`, onclick: act(onclick), text: label });
  const field = (label, props = {}, tag = 'input') => {
    const id = `f${Math.random().toString(36).slice(2, 8)}`;
    const ctl = el(tag, { class: tag === 'select' ? 'form-select' : 'form-control', id, ...props });
    return { ctl, wrap: el('div', { class: 'mb-3' }, el('label', { class: 'form-label', for: id, text: label }), ctl) };
  };
  const card = (title, ...kids) => el('div', { class: 'card card-body mb-3' }, title ? el('h3', { class: 'h5', text: title }) : null, ...kids);
  const empty = text => el('p', { class: 'text-muted mb-0', text });
  const table = (heads, rows) => el('div', { class: 'table-responsive' }, el('table', { class: 'table align-middle mb-0' }, el('thead', {}, el('tr', {}, heads.map(h => el('th', { scope: 'col', text: h })))), el('tbody', {}, rows)));
  const fmtSize = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  // Knowledge base text: "# " lines are headings, "- " lines are bullets, blank lines separate paragraphs.
  const richText = source => {
    const box = el('div', { class: 'kb-body' });
    let list = null;
    for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
      if (/^- /.test(line)) { if (!list) { list = el('ul'); box.append(list); } list.append(el('li', { text: line.slice(2) })); continue; }
      list = null;
      if (/^#{1,3} /.test(line)) box.append(el('h4', { class: 'h6 mt-3', text: line.replace(/^#+ /, '') }));
      else if (line.trim()) box.append(el('p', { class: 'mb-2 pre-wrap', text: line }));
    }
    return box;
  };

  let me = null;
  let tab = location.hash.slice(1) || 'clock';
  const TABS = [['clock', 'Clock'], ['jobs', 'Jobs'], ['hours', 'Hours'], ['pay', 'Pay'], ['contracts', 'Contracts'], ['requests', 'Requests'], ['kb', 'Knowledge base'], ['documents', 'Documents'], ['experience', 'My experience']];

  // ---------- Sections
  async function jobs(box) {
    const { active, open, history } = await api('/api/employee/jobs');
    const jobCard = (j, mine) => card(null, el('div', { class: 'd-flex flex-wrap justify-content-between gap-2' }, el('strong', { text: `#${j.id} ${j.title}` }), badge(j.status)),
      el('div', { class: 'text-muted small mb-2', text: [j.area, j.scheduledAt && `Scheduled: ${j.scheduledAt}`].filter(Boolean).join(' \u00b7 ') }),
      j.description ? el('p', { class: 'pre-wrap', text: j.description }) : null,
      mine ? el('div', {}, j.address ? el('p', { class: 'mb-1' }, el('strong', { text: 'Address: ' }), j.address) : null, j.customerName ? el('p', { class: 'mb-2' }, el('strong', { text: 'Customer: ' }), `${j.customerName}${j.customerPhone ? ` (${j.customerPhone})` : ''}`) : null) : null,
      mine ? briefPanel(j) : null,
      mine ? toolList(j) : null,
      mine ? fieldPanel(j) : null,
      mine && ['open', 'in_progress'].includes(j.status) ? jobActions(j) : null,
      mine && j.updates.length ? el('div', { class: 'mt-2 border-top pt-2' }, j.updates.map(u => el('div', { class: 'small mb-1' }, el('strong', { text: `${u.author}: ` }), u.body, el('span', { class: 'text-muted', text: ` \u00b7 ${stamp(u.createdAt)}` })))) : null,
      !mine ? (j.interested ? el('span', { class: 'text-muted small', text: 'You asked to be assigned. We will be in touch.' }) : button('I am interested', async () => { await send(`/api/employee/jobs/${j.id}/interest`, {}); notice('success', 'Thanks! We will review your interest.'); await render(); }, 'btn-brass')) : null);
    const briefPanel = j => {
      const body = el('div', { class: 'mt-2 small' });
      let loaded = false;
      const ul = items => el('ul', { class: 'mb-1 ps-3' }, ...items.map(t => el('li', { text: t })));
      const draw = d => {
        const b = d.brief;
        if (!b) { body.replaceChildren(el('p', { class: 'text-muted', text: 'The office has not sent the job plan yet.' })); return; }
        body.replaceChildren(
          el('p', { class: 'mb-2', text: `${b.totalHours} labor hours over about ${b.totalDays} working days, including a ${b.cushionPct}% cushion. Work safely and never rush a step to save time.` }),
          el('h4', { class: 'h6', text: 'Who does what' }), ...b.crew.map(c => el('div', { class: 'mb-1' }, el('strong', { text: `${c.role}${c.people > 1 ? ` x${c.people}` : ''}: ${c.hours} hrs` }), el('div', { class: 'text-muted', text: c.note }))),
          el('h4', { class: 'h6 mt-2', text: 'Day by day' }), ...b.dayPlan.map(d => el('div', { class: 'border-bottom py-1', text: `${d.days}: ${d.title}${d.roles && d.roles.length ? ` \u2014 ${d.roles.join(', ')}` : ''}${d.note ? `. ${d.note}` : ''}` })),
          el('h4', { class: 'h6 mt-2', text: 'Steps' }), ...b.steps.map(st => el('details', { class: 'mb-1' }, el('summary', { class: 'fw-semibold', text: `${st.n}. ${st.title} \u00b7 ${st.hours} hrs${st.qty ? ` \u00b7 ${st.qty} ${st.unit}` : ''}` }),
            el('ol', { class: 'mb-1 ps-3' }, ...st.how.map(t => el('li', { text: t }))), el('div', { class: 'fw-semibold', text: 'Tools' }), ul(st.tools), el('div', { class: 'fw-semibold', text: 'Supplies' }), ul(st.supplies),
            ...st.roles.map(r => el('div', { class: 'mt-1' }, el('strong', { text: `${r.role}: ` }), (r.duties || []).join(' '))))),
          el('h4', { class: 'h6 mt-2', text: 'Getting there, supplies, debris and cleanup' }), ...b.logistics.map(r => el('p', { class: 'mb-1' }, el('strong', { text: `${r.label}: ` }), r.text)),
          el('h4', { class: 'h6 mt-2', text: 'Cleanup and closeout' }), ...Object.entries(b.closeout || {}).map(([k, v]) => el('div', {}, el('div', { class: 'fw-semibold text-capitalize', text: k }), ul(v))));
      };
      return el('details', { class: 'mt-2', ontoggle: async ev => { if (ev.target.open && !loaded) { loaded = true; try { draw(await api(`/api/employee/jobs/${j.id}/brief`)); } catch (err) { loaded = false; body.textContent = err.message; } } } }, el('summary', { class: 'fw-semibold', text: 'Job plan: what each person does' }), body);
    };
    const toolList = j => {
      const body = el('div', { class: 'mt-2' });
      let loaded = false;
      const draw = d => {
        const done = d.tools.filter(t => t.checked).length;
        body.replaceChildren(...(d.tools.length ? [el('p', { class: 'small text-muted mb-1', text: `${done} of ${d.tools.length} packed` }), ...[...new Set(d.tools.map(t => t.group))].map(g => el('div', { class: 'mb-2' }, el('strong', { class: 'small', text: g }),
          d.tools.filter(t => t.group === g).map(t => el('label', { class: 'form-check d-block small' }, el('input', { type: 'checkbox', class: 'form-check-input', checked: !!t.checked, onchange: async ev => { try { draw(await send(`/api/employee/jobs/${j.id}/tools/${t.id}`, { checked: ev.target.checked })); } catch (err) { ev.target.checked = !ev.target.checked; notice('danger', err.message); } } }),
            window.BBSTools && BBSTools.thumb(t.name), `${t.name}${t.qty > 1 ? ` x${t.qty}` : ''}${t.source === 'rent' ? ' (rental: reserve ahead)' : ''}${t.note ? ` \u2013 ${t.note}` : ''}`))))] : [el('p', { class: 'small text-muted', text: 'No tool list for this job yet.' })]));
      };
      return el('details', { class: 'mt-2', ontoggle: async ev => { if (ev.target.open && !loaded) { loaded = true; try { if (window.BBSTools) await BBSTools.load(); draw(await api(`/api/employee/jobs/${j.id}/tools`)); } catch (err) { loaded = false; body.textContent = err.message; } } } }, el('summary', { class: 'small fw-bold', text: 'Tools checklist' }), body);
    };
    // Daily check-in, job photos and videos, and liability records with homeowner consent.
    const uploads = new WeakMap();
    const upload = async (jobId, file, meta) => {
      let byFile = uploads.get(file);
      if (!byFile) { byFile = new Map(); uploads.set(file, byFile); }
      const key = `${jobId}:${meta.kind}:${meta.phase || 'other'}:${meta.caption || ''}`;
      if (byFile.has(key)) return byFile.get(key);
      const run = api(`/api/employee/jobs/${jobId}/field/media`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Kind': meta.kind, 'X-Phase': meta.phase || 'other', 'X-Caption': encodeURIComponent(meta.caption || ''), 'X-Filename': encodeURIComponent(file.name || 'file') }, body: file });
      byFile.set(key, run);
      run.catch(() => byFile.delete(key));
      return run;
    };
    const uploadMany = async (jobId, selections, meta, status) => {
      const items = selections.map(file => ({ file, state: 'Waiting', error: '' }));
      const draw = () => {
        status.replaceChildren(...items.map(item => el('div', { class: `small ${item.error ? 'text-danger' : ''}`, text: `${item.file.name}: ${item.state}${item.error ? ` — ${item.error}` : ''}` })));
      };
      for (const item of items) {
        item.state = 'Uploading'; draw();
        try { await upload(jobId, item.file, meta); item.state = 'Uploaded'; } catch (error) { item.state = 'Failed'; item.error = error.message; }
      }
      draw();
      const failed = items.filter(item => item.error);
      if (failed.length) throw new Error(`${items.length - failed.length} uploaded; ${failed.length} failed. Retry to upload only the failures.`);
      return items.length;
    };
    const signaturePad = () => {
      const canvas = el('canvas', { class: 'sig-pad', width: '600', height: '200', 'aria-label': 'Homeowner signature' });
      const g = canvas.getContext('2d');
      g.lineWidth = 3; g.lineCap = 'round'; g.strokeStyle = '#111';
      let drawing = false, inked = false;
      const at = ev => { const r = canvas.getBoundingClientRect(); return [(ev.clientX - r.left) * canvas.width / r.width, (ev.clientY - r.top) * canvas.height / r.height]; };
      canvas.addEventListener('pointerdown', ev => { drawing = true; canvas.setPointerCapture(ev.pointerId); g.beginPath(); g.moveTo(...at(ev)); ev.preventDefault(); });
      canvas.addEventListener('pointermove', ev => { if (!drawing) return; g.lineTo(...at(ev)); g.stroke(); inked = true; });
      for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, () => { drawing = false; });
      return { canvas, empty: () => !inked, clear: () => { g.clearRect(0, 0, canvas.width, canvas.height); inked = false; }, data: () => canvas.toDataURL('image/png') };
    };
    const fieldPanel = j => {
      const body = el('div', { class: 'mt-2' });
      let loaded = false, data = null;
      const url = `/api/employee/jobs/${j.id}/field`;
      const label = (map, k) => map[k] || k;
      const draw = d => {
        data = d;
        const today = new Date().toISOString().slice(0, 10);
        const date = field('Date', { type: 'date', value: today, max: today }), status = field('How is the job going?', {}, 'select');
        status.ctl.append(Object.entries(d.statuses).map(([v, t]) => el('option', { value: v, text: t })));
        const percent = field('Percent complete', { type: 'number', min: '0', max: '100', step: '5', value: '0' });
        const summary = field('How did today go? What did you finish?', { rows: 3, maxlength: 4000 }, 'textarea'), remaining = field('What is left to do?', { rows: 2, maxlength: 3000 }, 'textarea');
        const problems = field('Problems that happened (leave blank if none)', { rows: 2, maxlength: 3000 }, 'textarea'), materials = field('Materials or tools we need', { rows: 2, maxlength: 2000 }, 'textarea');
        const last = d.reports[0];
        if (last) { percent.ctl.value = String(last.percent); remaining.ctl.value = last.remaining; }
        const report = card('Daily check-in', el('p', { class: 'small text-muted', text: 'Submit one each day you work here. Sending it again for the same day updates it. The office is alerted to problems and delays.' }),
          el('div', { class: 'row' }, el('div', { class: 'col-md-4' }, date.wrap), el('div', { class: 'col-md-4' }, status.wrap), el('div', { class: 'col-md-4' }, percent.wrap)), summary.wrap, remaining.wrap, problems.wrap, materials.wrap,
          button('Submit daily check-in', async () => { draw(await send(`${url}/report`, { date: date.ctl.value, status: status.ctl.value, percent: percent.ctl.value, summary: summary.ctl.value, remaining: remaining.ctl.value, problems: problems.ctl.value, materials: materials.ctl.value })); notice('success', 'Daily check-in saved.'); }, 'btn-dark'));

        const phase = field('Stage of the job', {}, 'select'), kind = field('Type', {}, 'select'), caption = field('Caption (what is in the picture)', { maxlength: 300 });
        phase.ctl.append(d.phases.map(p => el('option', { value: p, text: p.replace('-', ' ') })));
        kind.ctl.append(d.kinds.filter(k => k !== 'consent').map(k => el('option', { value: k, text: k })));
        const files = el('input', { type: 'file', class: 'form-control', accept: 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm', multiple: true, 'aria-label': 'Photos or videos' });
        const uploadStatus = el('div', { class: 'mt-2', role: 'status', 'aria-live': 'polite' });
        const photos = card('Job photos and videos', el('p', { class: 'small text-muted', text: 'Take photos at every stage: before, during, after, and any problem. They are saved with the job for future reference.' }),
          el('div', { class: 'row' }, el('div', { class: 'col-md-4' }, phase.wrap), el('div', { class: 'col-md-4' }, kind.wrap), el('div', { class: 'col-md-4' }, caption.wrap)), el('div', { class: 'mb-3' }, files, uploadStatus),
          button('Upload', async () => {
            if (!files.files.length) throw new Error('Choose or take at least one photo or video.');
            const n = await uploadMany(j.id, [...files.files], { kind: kind.ctl.value, phase: phase.ctl.value, caption: caption.ctl.value }, uploadStatus);
            notice('success', `${n} file${n === 1 ? '' : 's'} uploaded.`); draw(await api(url));
          }, 'btn-dark'));

        const type = field('What happened?', {}, 'select'), desc = field('Describe it clearly (what you found or what you need to do)', { rows: 3, maxlength: 4000 }, 'textarea'), owner = field('Homeowner name', { maxlength: 120 });
        type.ctl.append(Object.entries(d.liabilityTypes).map(([v, t]) => el('option', { value: v, text: t })));
        const agree = el('input', { type: 'radio', name: `ok-${j.id}`, class: 'form-check-input', checked: true }), refuse = el('input', { type: 'radio', name: `ok-${j.id}`, class: 'form-check-input' });
        const video = el('input', { type: 'file', class: 'form-control', accept: 'video/*', capture: 'environment', 'aria-label': 'Consent video' });
        const pad = signaturePad();
        const consentBox = el('div', {}, el('p', { class: 'small pre-wrap border rounded p-2 bg-light', text: `Read this on camera: ${d.consentScript}` }),
          el('label', { class: 'form-label', text: 'Video of the homeowner giving permission' }), el('div', { class: 'mb-3' }, video),
          el('label', { class: 'form-label', text: 'Homeowner signs here' }), el('div', {}, pad.canvas), el('div', { class: 'mb-3' }, button('Clear signature', () => pad.clear())));
        const toggle = () => { consentBox.hidden = !agree.checked; };
        agree.addEventListener('change', toggle); refuse.addEventListener('change', toggle);
        const liability = card('Liability record', el('p', { class: 'small text-muted', text: 'Record anything that could become a liability: existing damage, hidden conditions, extra work, moving belongings, or a safety concern. Ask the homeowner for permission on video and have them sign. If they say no, record that and stop work on that item.' }),
          type.wrap, desc.wrap, owner.wrap,
          el('div', { class: 'mb-3' }, el('label', { class: 'form-check' }, agree, ' The homeowner agrees (video and signature required)'), el('label', { class: 'form-check' }, refuse, ' The homeowner does NOT agree')), consentBox,
          el('p', { class: 'small text-muted', text: d.consentPrivacy }),
          button('Save liability record', async () => {
            let videoId = '';
            if (agree.checked) {
              if (!video.files.length) throw new Error('Record the homeowner giving permission on video first.');
              if (pad.empty()) throw new Error('The homeowner must sign on the screen.');
              videoId = (await upload(j.id, video.files[0], { kind: 'consent', caption: `Consent video: ${owner.ctl.value}` })).id;
            }
            draw(await send(`${url}/liability`, { type: type.ctl.value, description: desc.ctl.value, homeowner: owner.ctl.value, consented: agree.checked, videoId, signature: agree.checked ? pad.data() : '' }));
            notice('success', agree.checked ? 'Liability record and consent evidence saved. The office was notified.' : 'Homeowner decline recorded. Stop work on this item; the office was notified.');
          }, 'btn-danger'));

        const history = el('div', {}, el('h4', { class: 'h6 mt-3', text: 'Previous check-ins' }), d.reports.length ? d.reports.slice(0, 14).map(r => el('div', { class: 'small border-bottom py-1' }, el('strong', { text: `${day(r.date)} \u00b7 ${r.statusLabel} \u00b7 ${r.percent}% ` }), `\u2013 ${r.by}`, el('div', { class: 'pre-wrap', text: r.summary }), r.remaining ? el('div', { class: 'text-muted pre-wrap', text: `Left: ${r.remaining}` }) : null, r.problems ? el('div', { class: 'text-danger pre-wrap', text: `Problems: ${r.problems}` }) : null)) : el('p', { class: 'small text-muted', text: 'No check-ins yet.' }),
          el('h4', { class: 'h6 mt-3', text: `Photos and videos (${d.media.length})` }), el('div', { class: 'd-flex flex-wrap gap-2' }, d.media.slice(0, 60).map(m => m.type === 'image' ? el('a', { href: m.url, target: '_blank', rel: 'noopener', title: `${m.phase} \u00b7 ${m.caption}` }, el('img', { src: m.url, alt: m.caption || `${m.phase} photo`, class: 'field-thumb', loading: 'lazy' })) : el('a', { href: m.url, target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-outline-secondary', text: `Video \u00b7 ${m.phase}${m.caption ? ` \u00b7 ${m.caption}` : ''}` }))),
          el('h4', { class: 'h6 mt-3', text: 'Liability records' }), d.liabilities.length ? d.liabilities.map(l => el('div', { class: 'small border-bottom py-1' }, el('strong', { text: `${l.typeLabel} \u00b7 ${l.consented ? 'Homeowner agreed' : 'Homeowner declined'} ` }), `\u2013 ${stamp(l.createdAt)}`, el('div', { class: 'pre-wrap', text: l.description }))) : el('p', { class: 'small text-muted', text: 'None recorded.' }));
        body.replaceChildren(report, photos, liability, history);
        toggle();
      };
      return el('details', { class: 'mt-2', ontoggle: async ev => { if (ev.target.open && !loaded) { loaded = true; try { draw(await api(url)); } catch (err) { loaded = false; body.textContent = err.message; } } } }, el('summary', { class: 'fw-semibold', text: 'Daily check-in, photos and liability' }), body);
    };
    const jobActions = j => {
      const note = field('Add an update', { rows: 2, maxlength: 2000 }, 'textarea');
      return el('div', {}, note.wrap, el('div', { class: 'd-flex flex-wrap gap-2' },
        button('Post update', async () => { await send(`/api/employee/jobs/${j.id}/updates`, { body: note.ctl.value }); await render(); }, 'btn-dark'),
        j.status === 'open' ? button('Start job', async () => { await send(`/api/employee/jobs/${j.id}/status`, { status: 'in_progress' }); await render(); }) : null,
        button('Mark complete', async () => { if (confirm('Mark this job complete?')) { await send(`/api/employee/jobs/${j.id}/status`, { status: 'completed' }); await render(); } }, 'btn-success')));
    };
    box.append(el('h2', { class: 'h4', text: 'My jobs' }), active.length ? active.map(j => jobCard(j, true)) : empty('No jobs assigned to you right now.'),
      el('h2', { class: 'h4 mt-4', text: 'Open jobs' }), open.length ? open.map(j => jobCard(j, false)) : empty('No open jobs at the moment.'),
      el('h2', { class: 'h4 mt-4', text: 'Job history' }), history.length ? history.map(j => jobCard(j, true)) : empty('Completed jobs will appear here.'));
  }

  async function hours(box) {
    const d = await api('/api/employee/hours');
    const date = field('Date', { type: 'date', value: new Date().toISOString().slice(0, 10) }), amount = field('Hours', { type: 'number', min: '0.25', max: '24', step: '0.25' });
    const job = field('Job (optional)', {}, 'select'), note = field('Note', { maxlength: 500 });
    job.ctl.append(el('option', { value: '', text: 'No specific job' }), d.jobs.map(j => el('option', { value: String(j.id), text: `#${j.id} ${j.title}` })));
    box.append(
      el('div', { class: 'row g-3 mb-3' }, [['Approved hours', hrs(d.totals.approvedMinutes)], ['Waiting for approval', hrs(d.totals.pendingMinutes)]].map(([l, v]) => el('div', { class: 'col-6' }, card(null, el('div', { class: 'h4 mb-0', text: v }), el('div', { class: 'text-muted small', text: l }))))),
      card('Log hours', el('div', { class: 'row' }, el('div', { class: 'col-md-3' }, date.wrap), el('div', { class: 'col-md-3' }, amount.wrap), el('div', { class: 'col-md-6' }, job.wrap)), note.wrap,
        button('Add hours', async () => { await send('/api/employee/hours', { date: date.ctl.value, hours: amount.ctl.value, jobId: job.ctl.value, note: note.ctl.value }); notice('success', 'Hours submitted for approval.'); await render(); }, 'btn-brass')),
      card('Time log', d.entries.length ? table(['Date', 'Hours', 'Job', 'Note', 'Status', ''], d.entries.map(e => el('tr', {}, el('td', { text: day(e.date) }), el('td', { text: hrs(e.minutes) }), el('td', { text: e.jobTitle }), el('td', { text: e.note }), el('td', {}, badge(e.status)),
        el('td', {}, e.status === 'pending' ? button('Remove', async () => { await send(`/api/employee/hours/${e.id}/delete`, {}); await render(); }, 'btn-outline-danger') : null)))) : empty('No hours logged yet.')));
  }

  async function pay(box) {
    const d = await api('/api/employee/payments'), t = d.totals;
    box.append(el('div', { class: 'row g-3 mb-3' }, [['Earned (approved hours)', money(t.earnedCents)], ['Paid so far', money(t.paidCents)], ['Balance owed', money(t.balanceCents)], ['Hourly rate', money(d.rateCents)]].map(([l, v]) => el('div', { class: 'col-6 col-lg-3' }, card(null, el('div', { class: 'h4 mb-0', text: v }), el('div', { class: 'text-muted small', text: l }))))),
      card('Payment history', d.payments.length ? table(['Date', 'Amount', 'Method', 'Note'], d.payments.map(p => el('tr', {}, el('td', { text: day(p.paidOn) }), el('td', { text: money(p.amountCents) }), el('td', { text: p.method }), el('td', { text: p.memo })))) : empty('No payments recorded yet.')));
  }

  async function contracts(box) {
    const { contracts: list } = await api('/api/employee/contracts');
    if (!list.length) return box.append(empty('No contracts yet.'));
    box.append(list.map(c => {
      const name = field('Type your full name to sign', { autocomplete: 'name' }), agree = el('input', { class: 'form-check-input', type: 'checkbox', id: `ag${c.id}` });
      return card(c.title, el('div', { class: 'mb-2' }, badge(c.status), c.signedAt ? el('span', { class: 'text-muted small', text: ` Signed by ${c.signedName} on ${stamp(c.signedAt)}` }) : null),
        el('div', { class: 'contract-text border rounded p-3 mb-3 pre-wrap', text: c.body }),
        c.status === 'pending' ? el('div', {}, name.wrap, el('div', { class: 'form-check mb-3' }, agree, el('label', { class: 'form-check-label', for: `ag${c.id}`, text: 'I have read this contract and agree to it. Typing my name is my electronic signature.' })),
          button('Sign contract', async () => { await send(`/api/employee/contracts/${c.id}/sign`, { name: name.ctl.value, agree: agree.checked }); notice('success', 'Contract signed. Thank you!'); await render(); }, 'btn-brass')) : null);
    }));
  }

  async function requests(box) {
    const d = await api('/api/employee/requests');
    const type = field('Type', {}, 'select'), subject = field('Subject', { maxlength: 150 }), body = field('Details', { rows: 4, maxlength: 4000 }, 'textarea');
    for (const [k, v] of Object.entries(d.types)) if (k !== 'job_interest') type.ctl.append(el('option', { value: k, text: v }));
    box.append(card('Make a request', type.wrap, subject.wrap, body.wrap, button('Send request', async () => { await send('/api/employee/requests', { type: type.ctl.value, subject: subject.ctl.value, body: body.ctl.value }); notice('success', 'Request sent.'); await render(); }, 'btn-brass')),
      card('My requests', d.requests.length ? d.requests.map(r => el('div', { class: 'border-top py-2' }, el('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, el('strong', { text: r.subject }), badge(r.status), el('span', { class: 'text-muted small', text: `${r.typeLabel} \u00b7 ${stamp(r.createdAt)}` })),
        r.body ? el('div', { class: 'pre-wrap', text: r.body }) : null, r.response ? el('div', { class: 'small mt-1' }, el('strong', { text: 'Reply: ' }), r.response) : null)) : empty('No requests yet.')));
  }

  async function kb(box) {
    const search = field('Search the knowledge base', { type: 'search', placeholder: 'Try "membrane", "permit" or a trade' });
    const list = el('div'), article = el('div');
    const load = async () => {
      const { articles } = await api(`/api/employee/kb?q=${encodeURIComponent(search.ctl.value)}`);
      list.replaceChildren();
      if (!articles.length) return list.append(empty(search.ctl.value ? 'No articles match your search.' : 'No articles have been published yet.'));
      for (const category of [...new Set(articles.map(a => a.category))]) {
        list.append(el('h3', { class: 'h6 text-uppercase text-muted mt-3', text: category }), ...articles.filter(a => a.category === category).map(a => el('div', { class: 'mb-2' },
          el('a', { href: `#kb-${a.id}`, class: 'fw-semibold', onclick: act(async e => { e.preventDefault(); await open(a.id); }), text: a.title }), a.summary ? el('div', { class: 'small text-muted', text: a.summary }) : null)));
      }
    };
    const open = async id => {
      const { article: a } = await api(`/api/employee/kb/${id}`);
      article.replaceChildren(card(a.title, el('div', { class: 'small text-muted mb-2', text: `${a.category} \u00b7 updated ${day(a.updatedAt)}` }), richText(a.body), button('Close article', () => article.replaceChildren())));
      article.scrollIntoView({ block: 'start' });
    };
    let timer; search.ctl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(act(load), 250); });
    await load();
    box.append(search.wrap, article, list);
  }

  async function documents(box) {
    const { files } = await api('/api/employee/files');
    const title = field('Title (for example W-9 or license)', { maxlength: 200 }), pick = field('File', { type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx' });
    box.append(card('Upload paperwork', el('p', { class: 'small text-muted', text: 'Upload tax forms, licenses or insurance certificates. Please do not upload Social Security or bank account numbers in photos or notes.' }), title.wrap, pick.wrap,
      button('Upload', async () => {
        const file = pick.ctl.files[0]; if (!file) throw new Error('Choose a file first.');
        await api('/api/employee/files', { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name), 'X-Title': encodeURIComponent(title.ctl.value) }, body: file });
        notice('success', 'File uploaded.'); await render();
      }, 'btn-brass')),
      card('My documents', files.length ? files.map(f => el('div', { class: 'd-flex flex-wrap gap-2 align-items-center border-top py-2' }, el('a', { href: `/api/employee/files/${f.id}`, target: '_blank', rel: 'noopener noreferrer', text: f.title || f.name }),
        el('span', { class: 'text-muted small', text: `${fmtSize(f.size)} \u00b7 ${day(f.createdAt)} \u00b7 from ${f.uploadedBy === 'admin' ? 'the office' : 'you'}` }),
        f.uploadedBy === 'employee' ? button('Delete', async () => { if (confirm('Delete this file?')) { await send(`/api/employee/files/${f.id}/delete`, {}); await render(); } }, 'btn-outline-danger ms-auto') : null)) : empty('No documents yet.')));
  }

  // ---------- Time clock and GPS tracking. Location is collected only while clocked in, after the employee accepts the notice.
  const GPS = { options: { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }, flushMs: 30000, minGapMs: 15000, minMoveM: 15, maxQueue: 600 };
  const memory = {};
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return memory[k] ?? null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { memory[k] = v; } }
  };
  const deviceId = () => {
    let id = store.get('bbs-device-id');
    if (!id || !/^[\w-]{8,64}$/.test(id)) { id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(3)).join('')}`).slice(0, 64); store.set('bbs-device-id', id); }
    return id;
  };
  // Browsers cannot read hardware IDs (IMEI, serial). We use a persistent per-device ID plus whatever model details the browser exposes.
  async function deviceInfo() {
    const info = { id: deviceId(), platform: navigator.platform || '', screen: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`, language: navigator.language || '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      cores: navigator.hardwareConcurrency || 0, memory: navigator.deviceMemory || 0, touch: navigator.maxTouchPoints || 0, browser: navigator.userAgent.slice(0, 120), model: '', platformVersion: '' };
    const ua = navigator.userAgentData;
    if (ua?.getHighEntropyValues) {
      try { const h = await ua.getHighEntropyValues(['model', 'platform', 'platformVersion']); info.model = h.model || ''; info.platform = h.platform || info.platform; info.platformVersion = h.platformVersion || ''; } catch { /* not exposed */ }
    }
    if (!info.model) info.model = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : '';
    info.label = [info.model, [info.platform, info.platformVersion].filter(Boolean).join(' ')].filter(Boolean).join(' \u00b7 ') || 'Unknown device';
    return info;
  }
  const toPoint = (pos, source = 'watch') => {
    const c = pos.coords;
    return { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, altitude: c.altitude, altitudeAccuracy: c.altitudeAccuracy, speed: c.speed != null && c.speed >= 0 ? c.speed : null, heading: c.heading != null && c.heading >= 0 ? c.heading : null, at: pos.timestamp, battery: tracker.battery, source };
  };
  const moved = (a, b) => { const k = 111320, dy = (a.lat - b.lat) * k, dx = (a.lng - b.lng) * k * Math.cos(a.lat * Math.PI / 180); return Math.hypot(dx, dy); };
  const geoMessage = e => e && e.code === 1 ? 'Location is turned off for this site. Allow location in your browser/phone settings (choose "Precise") and try again.'
    : e && e.code === 3 ? 'Could not get a GPS fix in time. Go outside or near a window, make sure location services and precise location are on, and try again.'
    : 'Your device could not determine its location. Turn on location services and try again.';

  // Takes the best fix it can get in a few seconds by watching until accuracy is good enough.
  const bestFix = (target = 40, wait = 12000) => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(Object.assign(new Error('This device or browser does not support location. Open the portal on your phone.'), { code: 0 }));
    let best = null, done = false, id;
    const finish = (err) => { if (done) return; done = true; navigator.geolocation.clearWatch(id); clearTimeout(timer); best ? resolve(best) : reject(err); };
    const timer = setTimeout(() => finish(Object.assign(new Error(), { code: 3 })), wait);
    id = navigator.geolocation.watchPosition(pos => { if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos; if (pos.coords.accuracy <= target) finish(); }, err => { if (err.code === 1 || !best) finish(err); }, GPS.options);
  });

  const tracker = {
    shiftId: null, watchId: null, flushTimer: null, retryTimer: null, wake: null, last: null, lastSent: 0, queue: [], events: [], battery: null,
    state: 'idle', accuracy: null, geofence: null, listeners: new Set(),
    set(state, accuracy = this.accuracy) { this.state = state; this.accuracy = accuracy; this.listeners.forEach(f => f()); },
    event(kind, detail = '') { if (this.shiftId) this.events.push({ kind, detail }); },
    save() { store.set('bbs-gps-queue', JSON.stringify({ shiftId: this.shiftId, queue: this.queue.slice(-GPS.maxQueue) })); },
    onPosition(pos) {
      const p = toPoint(pos);
      if (this.state !== 'ok') { this.event(this.state === 'blocked' ? 'permission_granted' : 'tracking_resumed'); }
      this.set('ok', Math.round(p.accuracy));
      if (p.accuracy > 250) this.event('low_accuracy', `${Math.round(p.accuracy)} m`);
      if (this.last && p.at - this.last.at < GPS.minGapMs && moved(p, this.last) < GPS.minMoveM) return;
      this.last = p; this.queue.push(p); this.save();
      if (this.queue.length >= 20) this.flush();
    },
    onError(err) {
      if (err.code === 1) { this.event('permission_denied'); this.set('blocked'); this.retry(); } else { this.event(err.code === 3 ? 'timeout' : 'position_unavailable'); this.set('searching'); }
    },
    // After a denial or lost signal the watch may be dead; keep trying so tracking resumes as soon as location is back on.
    retry() {
      if (this.retryTimer) return;
      this.retryTimer = setInterval(() => { if (this.state === 'ok') { clearInterval(this.retryTimer); this.retryTimer = null; return; } navigator.geolocation.getCurrentPosition(pos => this.onPosition(pos), () => {}, GPS.options); }, 8000);
    },
    async flush() {
      if (!this.shiftId) return;
      const points = this.queue.slice(0, 60), events = this.events.splice(0, 20);
      try {
        const r = await send('/api/employee/clock/ping', { points, events, deviceId: deviceId() });
        this.geofence = r.geofence;
        this.queue.splice(0, points.length); this.save(); this.lastSent = Date.now(); this.listeners.forEach(f => f());
        if (this.queue.length) this.flush();
      } catch (e) {
        this.events.unshift(...events);
        if (e.status === 409) { this.stop(); this.onClosed?.(); } else if (e.status === 401 || e.status === 403) this.stop();
      }
    },
    // Lunch is unpaid and private: stop reading the GPS until the employee comes back.
    pause() {
      if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
      clearInterval(this.retryTimer); this.retryTimer = null; this.watchId = null; this.queue = []; this.save();
      this.set('lunch');
    },
    resume() {
      if (this.watchId !== null || !this.shiftId) return;
      this.set('searching');
      this.watchId = navigator.geolocation.watchPosition(pos => this.onPosition(pos), err => this.onError(err), GPS.options);
      this.keepAwake();
    },
    async start(shiftId, paused = false) {
      if (this.shiftId === shiftId && (this.watchId !== null || (paused && this.state === 'lunch'))) return;
      this.stop();
      this.shiftId = shiftId;
      if (paused) { this.queue = []; this.set('lunch'); this.flushTimer = setInterval(() => this.flush(), GPS.flushMs); return; }
      try { const saved = JSON.parse(store.get('bbs-gps-queue') || 'null'); this.queue = saved && saved.shiftId === shiftId && Array.isArray(saved.queue) ? saved.queue : []; } catch { this.queue = []; }
      this.set('searching');
      if (!navigator.geolocation) return this.set('blocked');
      this.watchId = navigator.geolocation.watchPosition(pos => this.onPosition(pos), err => this.onError(err), GPS.options);
      this.flushTimer = setInterval(() => this.flush(), GPS.flushMs);
      try { if (navigator.getBattery) { const b = await navigator.getBattery(); this.battery = b.level; b.addEventListener('levelchange', () => { this.battery = b.level; if (b.level <= 0.15 && !b.charging) this.event('battery_low', `${Math.round(b.level * 100)}%`); }); } } catch { /* optional */ }
      this.keepAwake();
      try { const status = await navigator.permissions?.query({ name: 'geolocation' }); if (status) status.onchange = () => { if (status.state === 'denied') { this.event('permission_denied'); this.set('blocked'); this.retry(); } else if (status.state === 'granted') this.retry(); }; } catch { /* permissions API not available */ }
    },
    async keepAwake() {
      try { if (navigator.wakeLock && document.visibilityState === 'visible') this.wake = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
    },
    stop() {
      if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
      clearInterval(this.flushTimer); clearInterval(this.retryTimer);
      this.wake?.release?.().catch(() => {});
      Object.assign(this, { shiftId: null, watchId: null, flushTimer: null, retryTimer: null, wake: null, last: null, queue: [], events: [], state: 'idle', accuracy: null, geofence: null });
      store.set('bbs-gps-queue', 'null');
      this.listeners.forEach(f => f());
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (!tracker.shiftId || tracker.state === 'lunch') return;
    if (document.visibilityState === 'hidden') { tracker.event('tracking_paused', 'Portal moved to background'); tracker.flush(); } else { tracker.event('tracking_resumed', 'Portal back in foreground'); tracker.keepAwake(); tracker.flush(); }
  });
  window.addEventListener('online', () => tracker.flush());

  let clockState = null;
  // The server clocks people out automatically when location stops or they leave the job site; show them why.
  tracker.onClosed = async () => {
    try { await loadClock(); } catch { return; }
    const last = clockState.recent[0];
    await render();
    notice(last?.closedBy === 'system' ? 'warning' : 'info', last?.closedBy === 'system' ? `You were clocked out automatically: ${last.note || 'location stopped or you left the job site'}. Your hours were submitted for approval.` : 'You are no longer clocked in.');
  };
  const loadClock = async () => { clockState = await api('/api/employee/clock'); if (clockState.active) tracker.start(clockState.active.id, Boolean(clockState.active.onLunchSince)); else tracker.stop(); return clockState; };
  const elapsed = iso => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
  const TRACK_TEXT = { ok: () => `Location sharing is on (\u00b1${tracker.accuracy} m)`, searching: () => 'Looking for your location\u2026', blocked: () => 'LOCATION IS OFF. Turn it back on now. This is being recorded and the office can see it.', lunch: () => 'On unpaid lunch. Location sharing is paused until you end lunch.', idle: () => '' };

  async function doClockOut() {
    if (!confirm('Clock out and stop location sharing?')) return;
    let position = null;
    try { position = toPoint(await bestFix(80, 6000), 'out'); } catch { /* clock out works without a fix */ }
    await tracker.flush();
    const r = await send('/api/employee/clock/out', { position, deviceId: deviceId() });
    tracker.stop();
    await loadClock();
    notice('success', `Clocked out. ${hrs(r.minutes)} was added to your hours for approval.`);
    await render();
  }

  async function doLunchStart() {
    if (!confirm(`Start your unpaid lunch? Location sharing pauses and the clock stops. You must end lunch within ${clockState.lunchMaxMinutes} minutes or you will be clocked out.`)) return;
    await tracker.flush();
    await send('/api/employee/clock/lunch/start', { deviceId: deviceId() });
    tracker.pause();
    await loadClock();
    notice('info', 'Enjoy your lunch. Come back, turn location on and tap "End lunch".');
    await render();
  }
  async function doLunchEnd() {
    notice('info', 'Getting your precise location\u2026');
    let fix;
    try { fix = await bestFix(); } catch (e) { throw new Error(geoMessage(e)); }
    const r = await send('/api/employee/clock/lunch/end', { deviceId: deviceId(), position: toPoint(fix, 'resume') });
    tracker.resume();
    await loadClock();
    notice('success', `Welcome back. Lunch recorded: ${r.lunchMinutes} min total (unpaid).`);
    await render();
  }

  // Persistent bar shown on every tab while clocked in.
  function clockBar() {
    const bar = el('div', { class: 'alert alert-success d-flex flex-wrap align-items-center gap-2 mb-3', role: 'status' });
    const draw = () => {
      const a = clockState?.active;
      if (!a) { bar.className = 'd-none'; return; }
      const bad = tracker.state === 'blocked', lunch = Boolean(a.onLunchSince);
      bar.className = `alert alert-${lunch ? 'info' : bad ? 'danger' : 'success'} d-flex flex-wrap align-items-center gap-2 mb-3`;
      const g = tracker.geofence, away = g?.offsiteSince ? Math.round((Date.now() - Date.parse(g.offsiteSince)) / 60000) : 0;
      if (g?.offsiteSince && !lunch) bar.className = 'alert alert-warning d-flex flex-wrap align-items-center gap-2 mb-3';
      bar.replaceChildren(el('strong', { text: lunch ? `On lunch ${elapsed(a.onLunchSince)} \u00b7 unpaid` : `Clocked in ${elapsed(a.clockInAt)}${a.jobTitle ? ` \u00b7 ${a.jobTitle}` : ''}` }), el('span', { text: TRACK_TEXT[tracker.state]() }),
        g?.offsiteSince && !lunch ? el('span', { class: 'fw-semibold', text: `You are away from the job site (${away} min). Time away is unpaid and you will be clocked out after ${Math.round(g.autoMs / 60000)} min. Go back to the site.` }) : null, el('span', { class: 'ms-auto d-flex flex-wrap gap-2' }, lunch ? button('End lunch', doLunchEnd, 'btn-brass') : button('Start lunch', doLunchStart, 'btn-outline-dark'), button('Clock out', doClockOut, 'btn-dark')));
    };
    draw();
    tracker.listeners.add(draw);
    const timer = setInterval(() => { if (!bar.isConnected) { clearInterval(timer); tracker.listeners.delete(draw); } else draw(); }, 30000);
    return bar;
  }

  async function clock(box) {
    const d = clockState || await loadClock();
    if (d.active) {
      box.append(card('You are clocked in', el('p', { class: 'mb-2', text: `Since ${stamp(d.active.clockInAt)}${d.active.jobTitle ? ` on ${d.active.jobTitle}` : ''}. Keep this page open and location turned on until you clock out.` }),
        el('ul', { class: 'small text-muted' }, el('li', { text: 'Leave the screen on and this page open: phones pause location sharing for pages in the background.' }), el('li', { text: 'If location stays off for a few minutes or you leave the job site, the office is alerted and you are clocked out automatically. Time away from the site is not paid.' }), el('li', { text: `Lunch: tap Start lunch for an unpaid break (up to ${d.lunchMaxMinutes} minutes). Location pauses, and you tap End lunch back on the job site to clock back in.` }))));
    } else {
      const job = field('Job', {}, 'select');
      job.ctl.append(el('option', { value: '', text: 'No specific job (shop, supplies, travel)' }), d.jobs.map(j => el('option', { value: String(j.id), text: `#${j.id} ${j.title}` })));
      const agree = el('input', { class: 'form-check-input', type: 'checkbox', id: 'gps-consent' });
      const state = el('p', { class: 'small text-muted mb-3', text: 'Location access: checking\u2026' });
      navigator.permissions?.query({ name: 'geolocation' }).then(s => { const show = () => { state.textContent = `Location access: ${s.state === 'granted' ? 'allowed' : s.state === 'denied' ? 'BLOCKED. Allow location for this site in your phone/browser settings, then reload.' : 'you will be asked to allow it when you clock in'}`; }; show(); s.onchange = show; }).catch(() => { state.textContent = 'Location access: you will be asked to allow it when you clock in.'; });
      box.append(card('Clock in', el('p', { text: 'You must share your precise location to clock in. Location is only recorded while you are clocked in.' }), job.wrap,
        el('div', { class: 'form-check mb-3' }, agree, el('label', { class: 'form-check-label', for: 'gps-consent', text: d.consent.text })), state,
        button('Clock in and share my location', async () => {
          if (!agree.checked) throw new Error('Please check the box to accept location tracking for this shift.');
          if (!window.isSecureContext) throw new Error('Location needs a secure (https) connection.');
          notice('info', 'Getting your precise location\u2026 allow location if your phone asks.');
          let fix;
          try { fix = await bestFix(); } catch (e) { throw new Error(geoMessage(e)); }
          const device = await deviceInfo();
          await send('/api/employee/clock/in', { jobId: job.ctl.value, consent: true, consentVersion: d.consent.version, device, position: toPoint(fix, 'in') });
          await loadClock();
          notice('success', 'You are clocked in. Location sharing is on until you clock out.');
          await render();
        }, 'btn-brass')));
    }
    box.append(card('Recent shifts', d.recent.length ? table(['Date', 'Job', 'In', 'Out', 'Time'], d.recent.map(s => el('tr', {}, el('td', { text: day(s.clockInAt) }), el('td', { text: s.jobTitle || '\u2014' }), el('td', { text: stamp(s.clockInAt) }), el('td', { text: stamp(s.clockOutAt) }), el('td', { text: hrs(s.minutes) })))) : empty('No shifts yet.'),
      el('p', { class: 'small text-muted mt-2 mb-0', text: 'Each shift is added to your hours for approval when you clock out.' })));
  }

  const SECTIONS = { clock, jobs, hours, pay, contracts, requests, kb, documents, experience: box => window.bbsOnboarding.experienceTab(box) };

  async function render() {
    const summary = await api('/api/employee/me');
    me = summary;
    if (summary.onboarding && window.bbsOnboarding) { await window.bbsOnboarding.mount(root, { done: boot, signOut: async () => { await send('/api/auth/logout', {}); await boot(); } }); return; }
    await loadClock().catch(() => {});
    const c = summary.counts, badgeFor = { jobs: c.openJobs, contracts: c.pendingContracts, requests: c.pendingRequests };
    if (!SECTIONS[tab]) tab = 'clock';
    alertBox = el('div', { role: 'status', 'aria-live': 'polite' });
    const body = el('div');
    root.className = '';
    root.replaceChildren(
      el('div', { class: 'd-flex flex-wrap justify-content-between align-items-center gap-3 mb-3' }, el('div', {}, el('h2', { class: 'h3 mb-0', text: `Hi, ${summary.profile.name.split(' ')[0]}` }), el('span', { class: 'text-muted', text: [summary.profile.roleTitle, summary.profile.email].filter(Boolean).join(' \u00b7 ') })),
        el('div', { class: 'd-flex flex-wrap gap-2' }, summary.profile.canEstimate ? el('a', { class: 'btn btn-sm btn-brass', href: '/estimator/', text: 'Estimator' }) : null, button('Sign out', async () => { await send('/api/auth/logout', {}); await boot(); }))),
      el('ul', { class: 'nav nav-pills mb-4 flex-wrap', role: 'tablist' }, TABS.map(([id, label]) => el('li', { class: 'nav-item' }, el('a', { class: `nav-link${id === tab ? ' active' : ''}`, href: `#${id}`, 'aria-current': id === tab ? 'page' : null, onclick: e => { e.preventDefault(); tab = id; history.replaceState(null, '', `#${id}`); render().catch(() => {}); } }, label, badgeFor[id] ? el('span', { class: 'badge text-bg-danger ms-2', text: String(badgeFor[id]) }) : null)))),
      clockBar(), alertBox, body);
    await SECTIONS[tab](body);
  }

  function login(message) {
    const email = field('Email', { type: 'email', autocomplete: 'email' }), password = field('Password', { type: 'password', autocomplete: 'current-password' });
    const status = el('div', { class: message ? 'alert alert-warning mt-3' : 'mt-3', role: 'status', 'aria-live': 'polite', text: message || '' });
    const submit = async e => {
      e.preventDefault();
      try { await send('/api/auth/login', { email: email.ctl.value, password: password.ctl.value }); await boot(); } catch (error) { status.className = 'alert alert-danger mt-3'; status.textContent = error.message; }
    };
    root.className = '';
    root.replaceChildren(el('div', { class: 'row justify-content-center' }, el('div', { class: 'col-lg-5' }, el('form', { class: 'card card-body p-4 shadow', onsubmit: submit, novalidate: true },
      el('h2', { class: 'h4', text: 'Employee sign in' }), el('p', { class: 'text-muted', text: 'Accounts are created by the office after you are hired. Check your email for the setup link.' }), email.wrap, password.wrap,
      el('button', { class: 'btn btn-brass', type: 'submit', text: 'Sign in' }), status, el('p', { class: 'mt-3 mb-0 small' }, el('a', { href: '/account/forgot-password/', text: 'Forgot your password?' }))))));
  }

  async function boot() {
    try { await render(); } catch (e) {
      if (e.status === 401) return login();
      if (e.status === 403) return login('This account does not have employee access. Ask the office if you believe this is a mistake.');
      root.textContent = e.message;
    }
  }
  boot();
})();
