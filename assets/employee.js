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
  const send = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const money = c => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const hrs = m => `${(m / 60).toFixed(2).replace(/\.?0+$/, '')} h`;
  const day = v => v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const stamp = v => v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const COLORS = { open: 'primary', in_progress: 'info', completed: 'success', cancelled: 'secondary', pending: 'warning', approved: 'success', signed: 'success', denied: 'danger', rejected: 'danger' };
  const badge = text => el('span', { class: `badge text-bg-${COLORS[text] || 'secondary'}`, text: text.replace('_', ' ') });
  let alertBox;
  const notice = (kind, message) => { alertBox.className = `alert alert-${kind}`; alertBox.textContent = message; alertBox.scrollIntoView({ block: 'nearest' }); };
  const act = fn => async (...a) => { try { await fn(...a); } catch (e) { if (e.status === 401 || e.status === 403) return boot(); notice('danger', e.message); } };
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
  let tab = location.hash.slice(1) || 'jobs';
  const TABS = [['jobs', 'Jobs'], ['hours', 'Hours'], ['pay', 'Pay'], ['contracts', 'Contracts'], ['requests', 'Requests'], ['kb', 'Knowledge base'], ['documents', 'Documents']];

  // ---------- Sections
  async function jobs(box) {
    const { active, open, history } = await api('/api/employee/jobs');
    const jobCard = (j, mine) => card(null, el('div', { class: 'd-flex flex-wrap justify-content-between gap-2' }, el('strong', { text: `#${j.id} ${j.title}` }), badge(j.status)),
      el('div', { class: 'text-muted small mb-2', text: [j.area, j.scheduledAt && `Scheduled: ${j.scheduledAt}`].filter(Boolean).join(' \u00b7 ') }),
      j.description ? el('p', { class: 'pre-wrap', text: j.description }) : null,
      mine ? el('div', {}, j.address ? el('p', { class: 'mb-1' }, el('strong', { text: 'Address: ' }), j.address) : null, j.customerName ? el('p', { class: 'mb-2' }, el('strong', { text: 'Customer: ' }), `${j.customerName}${j.customerPhone ? ` (${j.customerPhone})` : ''}`) : null) : null,
      mine ? toolList(j) : null,
      mine && ['open', 'in_progress'].includes(j.status) ? jobActions(j) : null,
      mine && j.updates.length ? el('div', { class: 'mt-2 border-top pt-2' }, j.updates.map(u => el('div', { class: 'small mb-1' }, el('strong', { text: `${u.author}: ` }), u.body, el('span', { class: 'text-muted', text: ` \u00b7 ${stamp(u.createdAt)}` })))) : null,
      !mine ? (j.interested ? el('span', { class: 'text-muted small', text: 'You asked to be assigned. We will be in touch.' }) : button('I am interested', async () => { await send(`/api/employee/jobs/${j.id}/interest`, {}); notice('success', 'Thanks! We will review your interest.'); await render(); }, 'btn-brass')) : null);
    const toolList = j => {
      const body = el('div', { class: 'mt-2' });
      let loaded = false;
      const draw = d => {
        const done = d.tools.filter(t => t.checked).length;
        body.replaceChildren(...(d.tools.length ? [el('p', { class: 'small text-muted mb-1', text: `${done} of ${d.tools.length} packed` }), ...[...new Set(d.tools.map(t => t.group))].map(g => el('div', { class: 'mb-2' }, el('strong', { class: 'small', text: g }),
          d.tools.filter(t => t.group === g).map(t => el('label', { class: 'form-check d-block small' }, el('input', { type: 'checkbox', class: 'form-check-input', checked: !!t.checked, onchange: async ev => { try { draw(await send(`/api/employee/jobs/${j.id}/tools/${t.id}`, { checked: ev.target.checked })); } catch (err) { ev.target.checked = !ev.target.checked; notice('danger', err.message); } } }),
            `${t.name}${t.qty > 1 ? ` x${t.qty}` : ''}${t.source === 'rent' ? ' (rental: reserve ahead)' : ''}${t.note ? ` \u2013 ${t.note}` : ''}`))))] : [el('p', { class: 'small text-muted', text: 'No tool list for this job yet.' })]));
      };
      return el('details', { class: 'mt-2', ontoggle: async ev => { if (ev.target.open && !loaded) { loaded = true; try { draw(await api(`/api/employee/jobs/${j.id}/tools`)); } catch (err) { loaded = false; body.textContent = err.message; } } } }, el('summary', { class: 'small fw-bold', text: 'Tools checklist' }), body);
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

  const SECTIONS = { jobs, hours, pay, contracts, requests, kb, documents };

  async function render() {
    const summary = await api('/api/employee/me');
    me = summary;
    const c = summary.counts, badgeFor = { jobs: c.openJobs, contracts: c.pendingContracts, requests: c.pendingRequests };
    if (!SECTIONS[tab]) tab = 'jobs';
    alertBox = el('div', { role: 'status', 'aria-live': 'polite' });
    const body = el('div');
    root.className = '';
    root.replaceChildren(
      el('div', { class: 'd-flex flex-wrap justify-content-between align-items-center gap-3 mb-3' }, el('div', {}, el('h2', { class: 'h3 mb-0', text: `Hi, ${summary.profile.name.split(' ')[0]}` }), el('span', { class: 'text-muted', text: [summary.profile.roleTitle, summary.profile.email].filter(Boolean).join(' \u00b7 ') })),
        el('div', { class: 'd-flex gap-2' }, summary.profile.canEstimate ? el('a', { class: 'btn btn-sm btn-brass', href: '/estimator/', text: 'Estimator' }) : null, button('Sign out', async () => { await send('/api/auth/logout', {}); await boot(); }))),
      el('ul', { class: 'nav nav-pills mb-4 flex-wrap', role: 'tablist' }, TABS.map(([id, label]) => el('li', { class: 'nav-item' }, el('a', { class: `nav-link${id === tab ? ' active' : ''}`, href: `#${id}`, 'aria-current': id === tab ? 'page' : null, onclick: e => { e.preventDefault(); tab = id; history.replaceState(null, '', `#${id}`); render().catch(() => {}); } }, label, badgeFor[id] ? el('span', { class: 'badge text-bg-danger ms-2', text: String(badgeFor[id]) }) : null)))),
      alertBox, body);
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
