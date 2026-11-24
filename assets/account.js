// Customer account pages. All user-supplied text is inserted with textContent to avoid XSS.
(() => {
  const params = new URLSearchParams(location.search);
  const root = document.querySelector('[data-account-page]');
  if (!root) return;
  const page = root.dataset.accountPage;

  const api = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || 'Something went wrong. Please try again.'); error.status = response.status; throw error; }
    return data;
  };
  const postJson = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const el = (tag, props = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'class') node.className = v; else if (k === 'text') node.textContent = v; else node.setAttribute(k, v); }
    node.append(...kids);
    return node;
  };
  const show = (box, kind, message) => { box.className = `form-status mt-3 alert alert-${kind}`; box.textContent = message; };
  const date = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const STATUS_COLORS = { draft: 'secondary', submitted: 'primary', in_progress: 'info', awaiting_customer: 'warning', resolved: 'success', closed: 'secondary' };
  const STAFF_LABELS = { submitted: 'Open', in_progress: 'In progress', awaiting_customer: 'Awaiting customer', resolved: 'Resolved', closed: 'Closed' };
  const statusBadge = (status, label, staff) => el('span', { class: `badge text-bg-${STATUS_COLORS[status] || 'secondary'}`, text: status === 'draft' ? 'Draft (not sent yet)' : (staff && STAFF_LABELS[status]) || label });
  const usd = c => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dateTime = value => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const photoGrid = photos => el('div', { class: 'row g-3 mt-1' }, ...photos.map(p => el('figure', { class: 'col-6 col-md-4 mb-0 media-item' },
    p.kind === 'video'
      ? el('video', { src: `/api/photos/${p.id}`, controls: '', preload: 'metadata', playsinline: '', 'aria-label': p.caption || `Project video: ${p.name}`, class: 'w-100 rounded-3 bg-dark' })
      : el('a', { href: `/api/photos/${p.id}`, target: '_blank', rel: 'noopener' }, el('img', { src: `/api/photos/${p.id}`, alt: p.caption || `Project photo: ${p.name}`, class: 'img-fluid rounded-3 w-100', loading: 'lazy' })),
    p.caption ? el('figcaption', { class: 'small mt-1 pre-wrap', text: p.caption }) : '')));
  const PRIORITY_COLORS = { low: 'secondary', normal: 'light', high: 'warning', urgent: 'danger' };
  const priorityBadge = r => r.priority && r.priority !== 'normal' ? el('span', { class: `badge text-bg-${PRIORITY_COLORS[r.priority]}`, text: `${r.priorityLabel} priority` }) : '';
  const FLOW = [['submitted', 'Received'], ['in_progress', 'In progress'], ['awaiting_customer', 'Waiting on reply'], ['resolved', 'Resolved']];
  const stepper = status => {
    const at = status === 'closed' ? 3 : Math.max(FLOW.findIndex(([v]) => v === status), 0);
    return el('ol', { class: 'stepper list-unstyled', 'aria-label': 'Request progress' }, ...FLOW.map(([, label], i) => el('li', { class: `step${i < at ? ' done' : ''}${i === at ? ' current' : ''}`, ...(i === at ? { 'aria-current': 'step' } : {}) }, el('span', { class: 'dot', text: i < at ? '\u2713' : String(i + 1) }), el('span', { class: 'lbl', text: label }))));
  };
  const timeAgo = value => {
    if (!value) return '';
    const mins = Math.round((Date.now() - new Date(value)) / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
    return mins < 10080 ? `${Math.round(mins / 1440)} days ago` : date(value);
  };
  const stat = (label, value, tone) => el('div', { class: 'col-6 col-lg-3' }, el('div', { class: `stat-tile tone-${tone}` }, el('div', { class: 'n', text: String(value) }), el('div', { class: 'l', text: label })));
  const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';
  const field = (label, value) => value ? el('p', { class: 'mb-2' }, el('strong', { text: `${label}: ` }), document.createTextNode(value)) : '';
  const requireUser = async () => { try { const u = (await api('/api/auth/me')).user; window.bbsI18n?.adopt(u.lang); return u; } catch (e) { if (e.status === 401) { location.replace('/account/login/'); return null; } throw e; } };

  async function logout() { await postJson('/api/auth/logout', {}); location.assign('/account/login/'); }

  // Login, register, forgot and reset forms
  const form = document.querySelector('form[data-auth]');
  if (form) {
    const status = form.querySelector('.form-status');
    if (page === 'reset' && !params.get('token')) show(status, 'danger', 'This reset link is missing its token. Please request a new one.');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      form.classList.add('was-validated');
      if (!form.checkValidity()) return;
      const button = form.querySelector('button[type=submit]');
      const data = {};
      for (const input of form.elements) if (input.name) data[input.name] = input.type === 'checkbox' ? input.checked : input.value;
      if (page === 'reset') data.token = params.get('token') || '';
      if (/register|forgot/.test(form.dataset.api || '') && localStorage.getItem('bbs-lang') === 'es') data.lang = 'es';
      button.disabled = true;
      show(status, 'secondary', 'Please wait...');
      try {
        const result = await postJson(form.dataset.api, data);
        if (form.dataset.redirect && page === 'login') return location.assign(form.dataset.redirect);
        show(status, 'success', result.message || 'Done.');
        if (page === 'reset') setTimeout(() => location.assign(form.dataset.redirect), 1500);
        if (page !== 'login') form.reset();
        form.classList.remove('was-validated');
        if (page === 'register' || page === 'forgot') button.disabled = false;
      } catch (error) { show(status, 'danger', error.message); button.disabled = false; }
    });
  }

  if (page === 'verify') {
    const status = root.querySelector('.form-status');
    const token = params.get('token');
    if (!token) status.textContent = 'This confirmation link is missing its token.';
    else postJson('/api/auth/verify', { token }).then(r => show(status, 'success', r.message), e => show(status, 'danger', e.message));
  }

  const KIND_LABELS = { in_home: 'In-home estimate', phone: 'Phone call', video: 'Video call' };
  const fullWhen = a => new Date(a.startsAt).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  // datetime-local values are wall-clock times in the browser's zone; Date converts them to a UTC instant for the API.
  const toLocalInput = iso => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const appointmentCard = (a, { staff, onCancel, onEdit }) => el('div', { class: `card card-body p-3 mb-2${a.status === 'cancelled' ? ' opacity-50' : ''}` },
    el('div', { class: 'd-flex flex-wrap justify-content-between gap-2' }, el('strong', { text: fullWhen(a) }), a.status === 'cancelled' ? el('span', { class: 'badge text-bg-secondary', text: 'Cancelled' }) : el('span', { class: 'badge text-bg-success', text: 'Scheduled' })),
    el('div', { class: 'small text-muted', text: `${a.kindLabel} \u00b7 ${a.durationMin} minutes${a.location ? ` \u00b7 ${a.location}` : ''}${staff ? ` \u00b7 ${a.customerName}` : ''}` }),
    a.notes ? el('p', { class: 'small mb-0 mt-2 pre-wrap', text: a.notes }) : '',
    a.status === 'scheduled' ? el('div', { class: 'd-flex flex-wrap gap-2 mt-3' },
      el('a', { class: 'btn btn-sm btn-outline-dark', href: a.googleUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Add to Google Calendar' }),
      el('a', { class: 'btn btn-sm btn-outline-dark', href: a.icsPath, text: 'Apple / Outlook (.ics)' }),
      onEdit ? el('button', { class: 'btn btn-sm btn-outline-dark', type: 'button', 'data-edit': a.id, text: 'Reschedule' }) : '',
      onCancel ? el('button', { class: 'btn btn-sm btn-outline-danger', type: 'button', 'data-cancel': a.id, text: 'Cancel appointment' }) : '') : '');

  async function dashboard() {
    const user = await requireUser();
    if (!user) return;
    const box = document.getElementById('account-root');
    const { requests } = await api('/api/requests');
    const upcoming = (await api('/api/appointments').catch(() => ({ appointments: [] }))).appointments.filter(a => a.status === 'scheduled');
    const active = requests.filter(r => ['submitted', 'in_progress', 'awaiting_customer'].includes(r.status));
    const waiting = requests.filter(r => r.unread || r.status === 'awaiting_customer');
    let query = '', filter = 'all';
    const list = el('div', { class: 'request-list' });
    const matches = r => (filter === 'all' || (filter === 'active' ? active.includes(r) : filter === 'reply' ? waiting.includes(r) : r.status === filter)) && (!query || `${r.title} ${r.projectType} ${r.location} #${r.id}`.toLowerCase().includes(query));
    const renderList = () => {
      const shown = requests.filter(matches);
      list.replaceChildren(...(shown.length ? shown.map(r => el('a', { class: `request-card${r.unread ? ' is-unread' : ''}`, href: `/account/request/?id=${r.id}` },
        el('div', { class: 'd-flex flex-wrap justify-content-between gap-2' }, el('strong', { text: r.title }), el('span', { class: 'd-flex gap-2' }, r.unread ? el('span', { class: 'badge text-bg-danger', text: 'New reply' }) : '', statusBadge(r.status, r.statusLabel))),
        el('div', { class: 'text-muted small mt-1', text: `#${r.id} \u00b7 ${r.projectType} \u00b7 ${r.location}${r.category ? ` \u00b7 ${r.category}` : ''}` }),
        el('div', { class: 'text-muted small mt-1', text: `${r.photoCount} file${r.photoCount === 1 ? '' : 's'} \u00b7 ${r.messageCount} message${r.messageCount === 1 ? '' : 's'} \u00b7 updated ${timeAgo(r.lastMessageAt || r.createdAt)}` }))) : [el('div', { class: 'empty-state' }, el('p', { class: 'mb-2', text: requests.length ? 'No requests match your filters.' : 'No requests yet. Share photos or a video of your bathroom and tell us what you have in mind.' }), !requests.length && user.verified ? el('a', { class: 'btn btn-brass', href: '/account/new/', text: 'Start your first request' }) : '')]));
    };
    const filters = el('select', { class: 'form-select w-auto', 'aria-label': 'Filter requests' }, ...[['all', 'All requests'], ['active', 'Active'], ['reply', 'Needs your attention'], ['resolved', 'Resolved'], ['closed', 'Closed'], ['draft', 'Drafts']].map(([v, l]) => el('option', { value: v, text: l })));
    const search = el('input', { class: 'form-control', type: 'search', placeholder: 'Search your requests', 'aria-label': 'Search your requests' });
    filters.addEventListener('change', () => { filter = filters.value; renderList(); });
    search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); renderList(); });
    renderList();
    const next = upcoming[0];
    const estBox = el('div', { class: 'mb-4' });
    api('/api/account/estimates').then(({ estimates }) => {
      if (!estimates.length) return;
      estBox.append(el('h2', { class: 'h4', text: 'Your estimates' }), ...estimates.map(e => el('a', { class: 'request-card', href: `/account/estimate/?id=${e.id}` },
        el('div', { class: 'd-flex flex-wrap justify-content-between gap-2' }, el('strong', { text: e.title }), el('span', { class: `badge text-bg-${e.status === 'accepted' ? 'success' : e.status === 'sent' ? 'primary' : 'secondary'}`, text: e.status === 'sent' ? 'Needs your review' : e.status === 'accepted' ? (e.balanceCents <= 0 ? 'Signed & paid' : 'Signed') : 'Declined' })),
        el('div', { class: 'text-muted small mt-1', text: `${e.number} \u00b7 ${usd(e.totalCents)}${e.status === 'accepted' && e.balanceCents > 0 ? ` \u00b7 ${usd(e.balanceCents)} due` : ''}` }))));
    }).catch(() => {});
    const docsBox = el('div', { class: 'mt-4' });
    api('/api/account/documents').then(({ files, entries }) => {
      if (!files.length && !entries.length) return;
      docsBox.append(el('h2', { class: 'h4', text: 'Documents & messages from our team' }),
        ...files.map(f => el('div', { class: 'py-1' }, el('a', { href: `/api/account/documents/${f.id}`, target: '_blank', rel: 'noopener noreferrer', text: f.title || f.name }), el('span', { class: 'text-muted small', text: ` \u00b7 ${f.category} \u00b7 ${new Date(f.createdAt).toLocaleDateString()}` }))),
        ...entries.map(e => el('div', { class: 'border-top py-2' }, el('div', { class: 'text-muted small', text: `${e.kind} \u00b7 ${new Date(e.createdAt).toLocaleDateString()}` }), e.subject ? el('strong', { text: e.subject }) : '', el('div', { class: 'pre-wrap', text: e.body }))));
    }).catch(() => {});
    box.className = '';
    box.replaceChildren(
      el('div', { class: 'd-flex flex-wrap justify-content-between align-items-center gap-3 mb-4' },
        el('div', {}, el('h2', { class: 'h3 mb-0', text: `Hi, ${user.name.split(' ')[0]}` }), el('span', { class: 'text-muted', text: user.email })),
        el('div', { class: 'd-flex gap-2' }, user.verified ? el('a', { class: 'btn btn-brass', href: '/account/new/', text: 'New request' }) : '', user.admin ? el('a', { class: 'btn btn-outline-dark', href: '/account/admin/', text: 'Staff queue' }) : '', el('button', { class: 'btn btn-outline-dark', type: 'button', 'data-logout': '', text: 'Sign out' }))),
      user.verified ? '' : el('div', { class: 'alert alert-warning d-flex flex-wrap justify-content-between align-items-center gap-2' }, el('span', { text: 'Please confirm your email to send project requests. Check your inbox for our message.' }), el('button', { class: 'btn btn-sm btn-dark', type: 'button', 'data-resend': '', text: 'Resend email' })),
      el('div', { class: 'row g-3 mb-4' }, stat('Active requests', active.length, 'a'), stat('Need your attention', waiting.length, waiting.length ? 'warn' : 'b'), stat('Upcoming visits', upcoming.length, 'c'), stat('All requests', requests.length, 'b')),
      next ? el('div', { class: 'next-visit mb-4' }, el('div', {}, el('p', { class: 'eyebrow dark mb-1', text: 'Your next appointment' }), el('h2', { class: 'h5 mb-1', text: fullWhen(next) }), el('span', { class: 'text-muted small', text: `${next.kindLabel} \u00b7 ${next.durationMin} minutes${next.location ? ` \u00b7 ${next.location}` : ''}` })), el('div', { class: 'd-flex flex-wrap gap-2' }, el('a', { class: 'btn btn-sm btn-outline-dark', href: next.googleUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Google Calendar' }), el('a', { class: 'btn btn-sm btn-outline-dark', href: next.icsPath, text: 'Apple / Outlook' }), el('a', { class: 'btn btn-sm btn-dark', href: `/account/request/?id=${next.requestId}`, text: 'View request' }))) : '',
      upcoming.length > 1 ? el('div', { class: 'mb-4' }, el('h2', { class: 'h5', text: 'More upcoming appointments' }), ...upcoming.slice(1).map(a => el('div', {}, el('a', { class: 'small', href: `/account/request/?id=${a.requestId}`, text: a.requestTitle }), appointmentCard(a, { staff: user.admin })))) : '',
      el('div', { class: 'd-flex flex-wrap justify-content-between align-items-center gap-2 mb-3' }, el('h2', { class: 'h4 mb-0', text: 'Your project requests' }), el('div', { class: 'd-flex flex-wrap gap-2' }, search, filters)),
      estBox, list, docsBox,
      el('div', { class: 'mt-4', 'data-lang-switch': '' }),
      el('div', { class: 'form-check form-switch mt-4' }, el('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: 'notify-pref', ...(user.notifyEmail ? { checked: '' } : {}) }), el('label', { class: 'form-check-label', for: 'notify-pref', text: 'Email me when our team replies or updates a request' })));
    const pref = box.querySelector('#notify-pref');
    pref.addEventListener('change', () => postJson('/api/auth/preferences', { notifyEmail: pref.checked }).catch(() => { pref.checked = !pref.checked; }));
    box.querySelector('[data-logout]').addEventListener('click', logout);
    const resend = box.querySelector('[data-resend]');
    if (resend) resend.addEventListener('click', async () => { resend.disabled = true; try { await postJson('/api/auth/resend-verification', {}); resend.textContent = 'Sent!'; } catch (e) { resend.textContent = e.message; } });
  }

  // XHR gives upload progress, which matters for large videos.
  const uploadFile = (id, file, caption, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/requests/${id}/photos`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    if (caption) xhr.setRequestHeader('X-Caption', encodeURIComponent(caption));
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onerror = () => reject(new Error('The upload was interrupted. Please check your connection and try again.'));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data); else reject(new Error(data.error || 'Upload failed. Please try again.'));
    };
    xhr.send(file);
  });
  async function uploadPhotos(id, files, status) {
    let done = 0;
    for (const file of files) {
      await uploadFile(id, file, '', pct => { status.textContent = `Uploading ${done + 1} of ${files.length} (${pct}%)...`; });
      done++;
    }
  }
  const MB = 1024 * 1024;
  const checkFiles = files => {
    if (files.length > 10) return 'You can upload up to 10 files at a time.';
    for (const f of files) {
      const video = /^video\/(mp4|quicktime|webm)$/.test(f.type);
      if (!video && !/^image\/(jpeg|png|webp)$/.test(f.type)) return `"${f.name}" is not supported. Use JPG, PNG or WebP photos, or MP4, MOV or WebM videos.`;
      if (f.size > (video ? 100 : 8) * MB) return `"${f.name}" is larger than ${video ? '100' : '8'} MB.`;
    }
    return '';
  };
  const fileSummary = files => {
    const videos = files.filter(f => f.type.startsWith('video/')).length, photos = files.length - videos;
    return `${photos} photo${photos === 1 ? '' : 's'}${videos ? ` and ${videos} video${videos === 1 ? '' : 's'}` : ''} selected (${(files.reduce((n, f) => n + f.size, 0) / MB).toFixed(1)} MB)`;
  };

  async function newRequest() {
    if (!await requireUser()) return;
    const requestForm = document.querySelector('form[data-request-form]');
    const status = requestForm.querySelector('.form-status');
    const picker = requestForm.querySelector('#photos'), summary = requestForm.querySelector('[data-file-summary]');
    picker.addEventListener('change', () => { summary.textContent = picker.files.length ? fileSummary([...picker.files]) : ''; });
    api('/api/meta/ticket').then(meta => { const sel = requestForm.querySelector('#category'); meta.categories.forEach(c => sel.append(el('option', { text: c }))); }).catch(() => {});
    requestForm.addEventListener('submit', async event => {
      event.preventDefault();
      requestForm.classList.add('was-validated');
      if (!requestForm.checkValidity()) return;
      const files = [...requestForm.querySelector('#photos').files];
      const problem = checkFiles(files);
      if (problem) return show(status, 'danger', problem);
      const button = requestForm.querySelector('button[type=submit]');
      button.disabled = true;
      show(status, 'secondary', 'Saving your request...');
      const data = Object.fromEntries(['title', 'projectType', 'location', 'timeline', 'budget', 'description', 'category'].map(k => [k, requestForm.elements[k].value]));
      let id;
      try {
        id = (await postJson('/api/requests', data)).id;
        await uploadPhotos(id, files, status);
        await postJson(`/api/requests/${id}/submit`, {});
        location.assign(`/account/request/?id=${id}&sent=1`);
      } catch (error) {
        show(status, 'danger', error.message + (id ? ' Your request was saved as a draft; you can add photos and send it from the request page.' : ''));
        if (id) status.append(' ', el('a', { href: `/account/request/?id=${id}`, text: 'Open draft' }));
        button.disabled = false;
      }
    });
  }

  function messageNode(m, staffView) {
    if (m.kind === 'status') return el('div', { class: 'text-center text-muted small my-2', text: `${m.body} \u00b7 ${dateTime(m.createdAt)}` });
    const mine = staffView ? m.role === 'staff' : m.role === 'customer';
    return el('div', { class: `ticket-msg${mine ? ' is-mine' : ''}${m.internal ? ' is-internal' : ''}` },
      el('div', { class: 'small' }, el('strong', { text: m.role === 'staff' ? `${m.authorName} (our team)` : m.authorName }), el('span', { class: 'text-muted', text: ` \u00b7 ${dateTime(m.createdAt)}${m.source === 'email' ? ' \u00b7 via email' : ''}` }), m.internal ? el('span', { class: 'badge text-bg-dark ms-2', text: 'Internal note' }) : ''),
      m.body && m.body !== '(photos attached)' ? el('div', { class: 'pre-wrap mt-1', text: m.body }) : '', m.photos.length ? photoGrid(m.photos) : '');
  }

  async function requestDetail() {
    const user = await requireUser();
    if (!user) return;
    const box = document.getElementById('account-root');
    const id = Number(params.get('id'));
    let data;
    try { data = await api(`/api/requests/${id}`); } catch (e) { return show(box, 'danger', e.message); }
    let { request } = data;
    const staff = data.staff;
    const status = el('div', { class: 'form-status mt-3', role: 'status', 'aria-live': 'polite' });
    const thread = el('div', { class: 'ticket-thread', 'aria-live': 'polite' });
    const renderThread = () => thread.replaceChildren(...(request.messages.length ? request.messages.map(m => messageNode(m, staff)) : [el('p', { class: 'text-muted text-center my-4', text: 'No messages yet. Ask a question or share photos below.' })]));
    renderThread();

    const details = el('div', { class: 'card card-body p-4 mb-4' },
      el('div', { class: 'd-flex flex-wrap justify-content-between gap-2 mb-3' }, el('h2', { class: 'h3 mb-0', text: request.title }), el('span', { class: 'd-flex gap-2 align-items-center' }, el('span', { class: 'text-muted', text: `#${request.id}` }), statusBadge(request.status, request.statusLabel, staff), priorityBadge(request))),
      request.status === 'draft' ? '' : stepper(request.status),
      staff ? field('Customer', `${request.customer.name} <${request.customer.email}>`) : '', staff ? field('Phone', request.customer.phone) : '',
      field('Type', request.projectType), field('Category', request.category), field('County', request.location), field('Timeline', request.timeline), field('Budget', request.budget), field('Created', date(request.createdAt)),
      el('p', { class: 'mt-3 mb-0 pre-wrap', text: request.description }),
      request.photos.length ? el('div', {}, el('h3', { class: 'h6 mt-4 mb-0', text: `Photos and videos with the request (${request.photos.length})` }), photoGrid(request.photos)) : '');

    // Appointments: staff schedule, everyone can add them to a calendar, customers can cancel
    let appointments = request.status === 'draft' ? [] : (await api(`/api/requests/${id}/appointments`).catch(() => ({ appointments: [] }))).appointments;
    const apptList = el('div', {});
    const apptStatus = el('div', { class: 'form-status mt-3', role: 'status', 'aria-live': 'polite' });
    const apptForm = staff ? el('form', { class: 'row g-2 mt-2', novalidate: '' },
      el('div', { class: 'col-md-4' }, el('label', { class: 'form-label small', for: 'appt-when', text: 'Date and time' }), el('input', { class: 'form-control', id: 'appt-when', type: 'datetime-local', required: '' })),
      el('div', { class: 'col-md-2' }, el('label', { class: 'form-label small', for: 'appt-len', text: 'Minutes' }), el('input', { class: 'form-control', id: 'appt-len', type: 'number', min: '15', max: '480', step: '15', value: '60' })),
      el('div', { class: 'col-md-3' }, el('label', { class: 'form-label small', for: 'appt-kind', text: 'Type' }), el('select', { class: 'form-select', id: 'appt-kind' }, ...Object.entries(KIND_LABELS).map(([v, l]) => el('option', { value: v, text: l })))),
      el('div', { class: 'col-md-3' }, el('label', { class: 'form-label small', for: 'appt-where', text: 'Address / link / phone' }), el('input', { class: 'form-control', id: 'appt-where', maxlength: '300' })),
      el('div', { class: 'col-12' }, el('label', { class: 'form-label small', for: 'appt-notes', text: 'Notes for the customer (optional)' }), el('input', { class: 'form-control', id: 'appt-notes', maxlength: '1000' })),
      el('div', { class: 'col-12 d-flex gap-2' }, el('button', { class: 'btn btn-brass', type: 'submit', text: 'Schedule and email confirmation' }), el('button', { class: 'btn btn-outline-dark d-none', type: 'button', 'data-reset': '', text: 'Cancel edit' }))) : null;
    let editing = null;
    const apptField = key => apptForm.querySelector(`#appt-${key}`);
    const renderAppointments = () => {
      apptList.replaceChildren(...(appointments.length ? appointments.map(a => appointmentCard(a, { staff: false, onEdit: staff, onCancel: true })) : [el('p', { class: 'text-muted small mb-0', text: staff ? 'No appointments yet.' : 'No appointments scheduled yet. Message us to find a time.' })]));
    };
    renderAppointments();
    const resetForm = () => { editing = null; apptForm.reset(); apptField('len').value = '60'; apptForm.querySelector('button[type=submit]').textContent = 'Schedule and email confirmation'; apptForm.querySelector('[data-reset]').classList.add('d-none'); };
    apptList.addEventListener('click', async event => {
      const cancelId = event.target.dataset.cancel, editId = event.target.dataset.edit;
      try {
        if (cancelId && confirm('Cancel this appointment? A cancellation email will be sent.')) {
          await postJson(`/api/appointments/${cancelId}/cancel`, {});
          appointments = (await api(`/api/requests/${id}/appointments`)).appointments;
          renderAppointments();
          show(apptStatus, 'success', 'Appointment cancelled.');
        } else if (editId) {
          const a = appointments.find(x => x.id === Number(editId));
          editing = a.id;
          apptField('when').value = toLocalInput(a.startsAt); apptField('len').value = a.durationMin; apptField('kind').value = a.kind; apptField('where').value = a.location; apptField('notes').value = a.notes;
          apptForm.querySelector('button[type=submit]').textContent = 'Save and email the update';
          apptForm.querySelector('[data-reset]').classList.remove('d-none');
          apptField('when').focus();
        }
      } catch (e) { show(apptStatus, 'danger', e.message); }
    });
    if (apptForm) {
      apptForm.querySelector('[data-reset]').addEventListener('click', resetForm);
      apptForm.addEventListener('submit', async event => {
        event.preventDefault();
        const when = apptField('when').value;
        if (!when) return show(apptStatus, 'warning', 'Choose a date and time.');
        try {
          await postJson(editing ? `/api/appointments/${editing}/reschedule` : `/api/requests/${id}/appointments`, { startsAt: new Date(when).toISOString(), durationMin: Number(apptField('len').value), kind: apptField('kind').value, location: apptField('where').value, notes: apptField('notes').value });
          appointments = (await api(`/api/requests/${id}/appointments`)).appointments;
          renderAppointments();
          resetForm();
          show(apptStatus, 'success', 'Saved. The customer was emailed a confirmation with a calendar invite.');
        } catch (e) { show(apptStatus, 'danger', e.message); }
      });
    }
    const apptPanel = request.status === 'draft' ? '' : el('div', { class: 'card card-body p-4 mb-4' }, el('h3', { class: 'h5', text: 'Appointments' }), apptList, apptForm || '', apptStatus);

    async function refresh() {
      request = (await api(`/api/requests/${id}`)).request;
      renderThread();
      statusSelect.value = request.status;
      prioritySelect.value = request.priority || 'normal';
    }

    // Staff controls
    const statusSelect = el('select', { class: 'form-select w-auto', id: 'ticket-status', 'aria-label': 'Request status' }, ...Object.entries(STAFF_LABELS).map(([v, l]) => el('option', { value: v, text: l, ...(v === request.status ? { selected: '' } : {}) })));
    const prioritySelect = el('select', { class: 'form-select w-auto', id: 'ticket-priority', 'aria-label': 'Request priority' }, ...[['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']].map(([v, l]) => el('option', { value: v, text: l, ...(v === (request.priority || 'normal') ? { selected: '' } : {}) })));
    const staffBar = staff ? el('div', { class: 'card card-body p-3 mb-4 d-flex flex-row flex-wrap align-items-center gap-3' }, el('label', { class: 'fw-semibold', for: 'ticket-status', text: 'Status' }), statusSelect, el('label', { class: 'fw-semibold', for: 'ticket-priority', text: 'Priority' }), prioritySelect, el('span', { class: 'text-muted small', text: 'Changing the status emails the customer.' })) : '';
    prioritySelect.addEventListener('change', async () => { try { await postJson(`/api/requests/${id}/priority`, { priority: prioritySelect.value }); await refresh(); } catch (e) { show(status, 'danger', e.message); } });
    statusSelect.addEventListener('change', async () => { try { await postJson(`/api/requests/${id}/status`, { status: statusSelect.value }); await refresh(); } catch (e) { show(status, 'danger', e.message); } });

    // Draft: add photos, then send to our team
    const draftFile = el('input', { class: 'form-control', id: 'more-photos', type: 'file', accept: MEDIA_ACCEPT, multiple: '' });
    const draftAdd = el('button', { class: 'btn btn-outline-dark mt-2', type: 'button', text: 'Upload files' });
    const draftSend = el('button', { class: 'btn btn-brass btn-lg', type: 'button', text: 'Send to Budget Bath Solutions' });
    const draftPanel = el('div', { class: 'card card-body p-4' }, el('p', { class: 'mb-3', text: 'This request is a draft. Add photos if you like, then send it to our team to start the conversation.' }),
      el('label', { class: 'form-label', for: 'more-photos', text: 'Add photos (JPG, PNG or WebP, up to 8 MB each)' }), draftFile, draftAdd, el('div', { class: 'mt-4' }, draftSend), status);
    draftAdd.addEventListener('click', async () => {
      const files = [...draftFile.files];
      if (!files.length) return show(status, 'warning', 'Choose at least one photo.');
      const problem = checkFiles(files);
      if (problem) return show(status, 'danger', problem);
      draftAdd.disabled = true;
      try { await uploadPhotos(id, files, status); location.reload(); } catch (e) { show(status, 'danger', e.message); draftAdd.disabled = false; }
    });
    draftSend.addEventListener('click', async () => {
      draftSend.disabled = true;
      try { await postJson(`/api/requests/${id}/submit`, {}); location.assign(`/account/request/?id=${id}&sent=1`); } catch (e) { show(status, 'danger', e.message); draftSend.disabled = false; }
    });

    // Composer: a message plus photos, each with its own comment
    const body = el('textarea', { class: 'form-control', id: 'ticket-body', rows: '4', maxlength: '4000', placeholder: staff ? 'Reply to the customer...' : 'Write a message to our team...' });
    const files = el('input', { class: 'form-control', id: 'ticket-photos', type: 'file', accept: MEDIA_ACCEPT, multiple: '' });
    const previews = el('div', { class: 'row g-3 mt-1' });
    const internal = staff ? el('input', { class: 'form-check-input', type: 'checkbox', id: 'ticket-internal' }) : null;
    const sendMessage = el('button', { class: 'btn btn-brass', type: 'button', text: 'Send message' });
    let chosen = [];
    const renderPreviews = () => previews.replaceChildren(...chosen.map((c, i) => el('div', { class: 'col-6 col-md-4' }, el('div', { class: 'card h-100' }, c.file.type.startsWith('video/') ? el('video', { src: c.url, class: 'card-img-top', controls: '', preload: 'metadata' }) : el('img', { src: c.url, alt: `Preview of ${c.file.name}`, class: 'card-img-top' }),
      el('div', { class: 'card-body p-2' }, el('input', { class: 'form-control form-control-sm', type: 'text', maxlength: '300', placeholder: 'Add a comment about this photo or video', 'aria-label': `Comment for ${c.file.name}`, value: c.caption }), el('button', { class: 'btn btn-link btn-sm p-0 mt-1', type: 'button', text: 'Remove', 'data-remove': String(i) }))))));
    previews.addEventListener('input', event => { const row = event.target.closest('.col-6'); if (row) chosen[[...previews.children].indexOf(row)].caption = event.target.value; });
    previews.addEventListener('click', event => { const i = event.target.dataset.remove; if (i !== undefined) { URL.revokeObjectURL(chosen[i].url); chosen.splice(Number(i), 1); renderPreviews(); } });
    files.addEventListener('change', () => {
      const picked = [...files.files];
      files.value = '';
      const problem = checkFiles(picked) || (chosen.length + picked.length > 10 ? 'You can attach up to 10 files per message.' : '');
      if (problem) return show(status, 'danger', problem);
      status.className = 'form-status mt-3';
      status.textContent = '';
      chosen.push(...picked.map(file => ({ file, caption: '', url: URL.createObjectURL(file) })));
      renderPreviews();
    });
    sendMessage.addEventListener('click', async () => {
      const text = body.value.trim();
      if (!text && !chosen.length) return show(status, 'warning', 'Write a message or add a photo or video first.');
      sendMessage.disabled = true;
      try {
        const photoIds = [];
        for (const [i, c] of chosen.entries()) {
          show(status, 'secondary', `Uploading file ${i + 1} of ${chosen.length}...`);
          photoIds.push((await uploadFile(id, c.file, c.caption.trim(), pct => { status.textContent = `Uploading file ${i + 1} of ${chosen.length} (${pct}%)...`; })).id);
        }
        await postJson(`/api/requests/${id}/messages`, { body: text, photoIds, ...(staff ? { internal: internal.checked } : {}) });
        body.value = '';
        for (const c of chosen) URL.revokeObjectURL(c.url);
        chosen = [];
        renderPreviews();
        if (internal) internal.checked = false;
        status.className = 'form-status mt-3';
        status.textContent = '';
        await refresh();
      } catch (e) { show(status, 'danger', e.message); }
      sendMessage.disabled = false;
    });
    const canClose = !staff && !['draft', 'closed'].includes(request.status);
    const closeButton = canClose ? el('button', { class: 'btn btn-outline-dark', type: 'button', text: request.status === 'resolved' ? 'Close request' : 'Mark as resolved' }) : '';
    if (canClose) closeButton.addEventListener('click', async () => { try { await postJson(`/api/requests/${id}/status`, { status: request.status === 'resolved' ? 'closed' : 'resolved' }); location.reload(); } catch (e) { show(status, 'danger', e.message); } });
    const composer = el('div', { class: 'card card-body p-4 mt-3' },
      el('label', { class: 'form-label fw-semibold', for: 'ticket-body', text: staff ? 'Reply' : 'Add a message' }), body,
      el('label', { class: 'form-label mt-3', for: 'ticket-photos', text: 'Attach photos (up to 8 MB) or videos (MP4, MOV or WebM, up to 100 MB)' }), files, previews,
      internal ? el('div', { class: 'form-check mt-3' }, internal, el('label', { class: 'form-check-label', for: 'ticket-internal', text: 'Internal note (hidden from the customer, no email sent)' })) : '',
      el('div', { class: 'd-flex flex-wrap gap-2 mt-3' }, sendMessage, closeButton), status);

    box.className = '';
    box.replaceChildren(
      el('p', {}, el('a', { href: staff ? '/account/admin/' : '/account/', text: staff ? '\u2190 All customer requests' : '\u2190 Back to my account' })),
      params.get('sent') ? el('div', { class: 'alert alert-success', text: 'Thank you! We received your request and emailed you a confirmation. We will reply here and by email.' }) : '',
      details, staffBar, apptPanel, request.status === 'draft' ? draftPanel : el('div', {}, el('h3', { class: 'h5', text: 'Conversation' }), thread, composer));

    // Pick up replies without a manual reload.
    if (request.status !== 'draft') setInterval(async () => {
      if (document.hidden) return;
      try { const latest = (await api(`/api/requests/${id}`)).request; if (latest.messages.length !== request.messages.length || latest.status !== request.status) { request = latest; renderThread(); statusSelect.value = request.status; } } catch { /* keep the current view */ }
    }, 30000);
  }

  async function admin() {
    const user = await requireUser();
    if (!user) return;
    const box = document.getElementById('account-root');
    try {
      const { requests } = await api('/api/admin/requests');
      let filter = 'all';
      let query = '';
      let sort = 'priority';
      const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
      const list = el('div', { class: 'request-list' });
      const bar = el('div', { class: 'd-flex flex-wrap gap-2 mb-3', role: 'group', 'aria-label': 'Filter requests' });
      const search = el('input', { class: 'form-control', type: 'search', placeholder: 'Search by customer, title or location', 'aria-label': 'Search requests' });
      const sorter = el('select', { class: 'form-select w-auto', 'aria-label': 'Sort requests' }, el('option', { value: 'priority', text: 'Sort: priority' }), el('option', { value: 'recent', text: 'Sort: latest activity' }));
      const stats = el('div', { class: 'row g-3 mb-4' });
      stats.replaceChildren(stat('Total requests', requests.length, 'a'), stat('Need a reply', requests.filter(r => r.unread).length, 'warn'), stat('High priority', requests.filter(r => ['high', 'urgent'].includes(r.priority) && r.status !== 'closed').length, 'b'), stat('Upcoming visits', requests.filter(r => r.nextAppointment).length, 'c'));
      const render = () => {
        const needle = query.toLowerCase();
        const shown = requests
          .filter(r => filter === 'all' || (filter === 'unread' ? r.unread : filter === 'high' ? ['high', 'urgent'].includes(r.priority) : r.status === filter))
          .filter(r => !needle || `${r.title} ${r.customer.name} ${r.customer.email} ${r.location} ${r.projectType}`.toLowerCase().includes(needle))
          .sort((a, b) => sort === 'priority' ? (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2) || String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)) : String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
        list.replaceChildren(...(shown.length ? shown.map(r => el('a', { class: 'request-card', href: `/account/request/?id=${r.id}` },
          el('div', { class: 'd-flex flex-wrap justify-content-between gap-2' }, el('strong', { text: `${r.title}  #${r.id}` }), el('span', { class: 'd-flex gap-2 flex-wrap' }, r.unread ? el('span', { class: 'badge text-bg-danger', text: 'Needs reply' }) : '', priorityBadge(r), statusBadge(r.status, r.statusLabel, true))),
          el('div', { class: 'small text-muted mt-1', text: `${r.customer.name} <${r.customer.email}> \u00b7 ${r.projectType} \u00b7 ${r.location} \u00b7 ${r.photoCount} file${r.photoCount === 1 ? '' : 's'} \u00b7 ${timeAgo(r.lastMessageAt)}` }),
          r.nextAppointment ? el('div', { class: 'small mt-1 fw-semibold', text: `Next visit: ${dateTime(r.nextAppointment)}` }) : '')) : [el('div', { class: 'empty-state', text: 'Nothing matches.' })]));
        bar.replaceChildren(...[['all', 'All'], ['unread', `Needs reply (${requests.filter(r => r.unread).length})`], ['high', 'High priority'], ...Object.entries(STAFF_LABELS)].map(([v, l]) => el('button', { class: `btn btn-sm ${filter === v ? 'btn-dark' : 'btn-outline-dark'}`, type: 'button', 'data-filter': v, text: l })));
      };
      search.addEventListener('input', () => { query = search.value.trim(); render(); });
      sorter.addEventListener('change', () => { sort = sorter.value; render(); });
      bar.addEventListener('click', event => { if (event.target.dataset.filter) { filter = event.target.dataset.filter; render(); } });
      render();
      box.className = '';
      const cal = await api('/api/calendar/info');
      const feed = el('input', { class: 'form-control form-control-sm', readonly: '', value: cal.feedUrl, 'aria-label': 'Calendar subscription URL' });
      feed.addEventListener('focus', () => feed.select());
      const calendarCard = el('div', { class: 'card card-body p-3 mb-4' }, el('strong', { text: 'Subscribe to all appointments' }),
        el('p', { class: 'small text-muted mb-2', text: `Add this private URL to Apple Calendar, Outlook or Google Calendar ("From URL"). Keep it secret.${cal.googleSync ? ' New appointments are also pushed to the business Google Calendar.' : ''}` }), feed);
      box.replaceChildren(el('p', {}, el('a', { href: '/account/', text: '\u2190 Back to my account' })), calendarCard, stats, el('div', { class: 'd-flex flex-wrap gap-2 mb-3' }, search, sorter), bar, list);
    } catch (e) { show(box, 'danger', e.status === 403 ? 'Your account does not have staff access.' : e.message); }
  }

  async function estimateDetail() {
    const user = await requireUser();
    if (!user) return;
    const box = document.getElementById('account-root');
    const id = Number(params.get('id'));
    const load = async () => (await api(`/api/account/estimates/${id}`)).estimate;
    const row = (label, value, strong) => el('div', { class: `d-flex justify-content-between py-1${strong ? ' fw-bold fs-5 border-top mt-1 pt-2' : ''}` }, el('span', { text: label }), el('span', { text: value }));
    const field = (label, props = {}) => {
      const fid = `f${Math.random().toString(36).slice(2, 8)}`;
      const input = el('input', { class: 'form-control', id: fid, ...props });
      return { input, wrap: el('div', { class: 'mb-3' }, el('label', { class: 'form-label', for: fid, text: label }), input) };
    };
    const render = async e => {
      const note = el('div', { class: 'mt-3', role: 'status', 'aria-live': 'polite' });
      const act = fn => async () => { try { await fn(); } catch (error) { show(note, 'danger', error.message); } };
      const t = e.totals, optionBoxes = new Map();
      const live = () => {
        const extra = e.items.filter(i => i.optional && optionBoxes.get(i.id)?.checked).reduce((a, i) => a + i.priceCents, 0);
        return t.totalCents + extra;
      };
      const itemRows = e.items.filter(i => !i.optional).map(i => el('tr', {}, el('td', { text: i.name }), el('td', { class: 'text-end text-nowrap', text: `${i.qty} ${i.unit}` }), el('td', { class: 'text-end text-nowrap', text: usd(i.priceCents) })));
      const sectionRows = e.sections ? e.sections.map(s => el('tr', {}, el('td', { text: s.name }), el('td', {}), el('td', { class: 'text-end', text: usd(s.totalCents) }))) : [];
      const optionRows = e.items.filter(i => i.optional).map(i => {
        const cb = el('input', { class: 'form-check-input me-2', type: 'checkbox', id: `opt${i.id}`, ...(i.accepted ? { checked: '' } : {}), ...(e.status === 'sent' ? {} : { disabled: '' }) });
        optionBoxes.set(i.id, cb);
        return el('div', { class: 'form-check d-flex justify-content-between border-top py-2' }, el('span', {}, cb, el('label', { class: 'form-check-label', for: `opt${i.id}`, text: `${i.name} (optional)` })), el('span', { text: `+ ${usd(i.priceCents)}` }));
      });
      const docs = e.documents.map(d => {
        const name = field('Type your full name to sign'), agree = el('input', { class: 'form-check-input', type: 'checkbox', id: `da${d.id}` });
        return el('details', { class: 'card card-body mb-2', ...(d.status === 'pending' ? { open: '' } : {}) },
          el('summary', {}, el('strong', { text: d.title }), ' ', el('span', { class: `badge text-bg-${d.status === 'signed' ? 'success' : 'warning'}`, text: d.status === 'signed' ? `Signed ${date(d.signedAt)}` : 'Needs your signature' })),
          el('div', { class: 'pre-wrap border rounded p-3 my-3', text: d.body }), el('p', {}, el('a', { href: `/api/account/estimates/${id}/documents/${d.id}/pdf`, target: '_blank', rel: 'noopener', text: 'Download PDF' })),
          d.status === 'pending' ? el('div', {}, name.wrap, el('div', { class: 'form-check mb-3' }, agree, el('label', { class: 'form-check-label', for: `da${d.id}`, text: 'I have read and agree. Typing my name is my electronic signature.' })),
            Object.assign(el('button', { class: 'btn btn-brass', type: 'button', text: 'Sign document' }), { onclick: act(async () => { await render((await postJson(`/api/account/estimates/${id}/documents/${d.id}/sign`, { name: name.input.value, agree: agree.checked })).estimate); }) }), el('p', { class: 'small text-muted mt-2 mb-0', text: e.consent || '' })) : el('div', { class: 'small text-muted', text: `Signed by ${d.signedName}` }));
      });
      const signName = field('Type your full name to accept this estimate'), signAgree = el('input', { class: 'form-check-input', type: 'checkbox', id: 'sign-agree' });
      const totalLine = row('Total', usd(t.totalCents), true);
      for (const cb of optionBoxes.values()) cb.addEventListener('change', () => { totalLine.lastChild.textContent = usd(live()); });
      const payButton = (kind, label) => Object.assign(el('button', { class: 'btn btn-brass me-2 mb-2', type: 'button', text: label }), { onclick: act(async () => { const { url } = await postJson(`/api/account/estimates/${id}/pay`, { kind }); location.href = url; }) });
      const decline = field('Reason (optional)');
      box.className = '';
      box.replaceChildren(el('p', {}, el('a', { href: '/account/', text: '\u2190 Back to my account' })),
        params.get('paid') ? el('div', { class: 'alert alert-success', text: 'Thank you! Your payment is being confirmed and will appear below in a moment.' }) : '',
        el('div', { class: 'card card-body mb-3' }, el('div', { class: 'd-flex flex-wrap justify-content-between gap-2' }, el('h2', { class: 'h4 mb-0', text: e.title }), el('span', { class: `badge align-self-start text-bg-${e.status === 'accepted' ? 'success' : e.status === 'sent' ? 'primary' : 'secondary'}`, text: e.status === 'sent' ? 'Awaiting your approval' : e.status === 'accepted' ? 'Accepted' : 'Declined' })),
          el('div', { class: 'text-muted small', text: `${e.number}${e.validUntil && e.status === 'sent' ? ` \u00b7 valid until ${date(e.validUntil)}` : ''}` }), e.scope ? el('p', { class: 'pre-wrap mt-3 mb-0', text: e.scope }) : ''),
        el('div', { class: 'card card-body mb-3' }, el('h3', { class: 'h5', text: 'Price breakdown' }),
          el('div', { class: 'table-responsive' }, el('table', { class: 'table table-sm align-middle' }, el('tbody', {}, ...(e.sections ? sectionRows : itemRows)))),
          ...optionRows, row('Subtotal', usd(t.subtotalCents)), t.contingencyCents ? row('Contingency allowance', usd(t.contingencyCents)) : '', t.discountCents ? row('Discount', `-${usd(t.discountCents)}`) : '', t.taxCents ? row('Sales tax', usd(t.taxCents)) : '', totalLine,
          el('div', { class: 'small text-muted mt-2', text: `Deposit to schedule: ${usd(t.depositCents)}` })),
        e.exclusions ? el('div', { class: 'card card-body mb-3' }, el('h3', { class: 'h5', text: 'Not included' }), el('div', { class: 'pre-wrap small', text: e.exclusions })) : '',
        e.terms ? el('div', { class: 'card card-body mb-3' }, el('h3', { class: 'h5', text: 'Terms' }), el('div', { class: 'pre-wrap small', text: e.terms })) : '',
        e.status === 'sent' ? el('div', { class: 'card card-body mb-3' }, el('h3', { class: 'h5', text: 'Approve this estimate' }), signName.wrap,
          el('div', { class: 'form-check mb-3' }, signAgree, el('label', { class: 'form-check-label', for: 'sign-agree', text: 'I have read this estimate and its terms and agree to proceed. Typing my name is my electronic signature.' })), el('p', { class: 'small text-muted', text: e.consent || '' }),
          Object.assign(el('button', { class: 'btn btn-brass', type: 'button', text: 'Sign & accept estimate' }), { onclick: act(async () => { await render((await postJson(`/api/account/estimates/${id}/sign`, { name: signName.input.value, agree: signAgree.checked, optionalIds: [...optionBoxes].filter(([, cb]) => cb.checked).map(([k]) => k) })).estimate); }) }),
          el('hr'), decline.wrap, Object.assign(el('button', { class: 'btn btn-outline-danger btn-sm', type: 'button', text: 'Decline estimate' }), { onclick: act(async () => { if (confirm('Decline this estimate?')) await render((await postJson(`/api/account/estimates/${id}/decline`, { reason: decline.input.value })).estimate); }) })) : '',
        e.status === 'accepted' ? el('div', { class: 'card card-body mb-3' }, el('h3', { class: 'h5', text: 'Payments' }), el('p', { class: 'mb-2', text: `Signed by ${e.signedName} on ${date(e.signedAt)}. Paid ${usd(t.paidCents)}. Balance ${usd(t.balanceCents)}.` }),
          ...e.payments.map(p => el('div', { class: 'small text-muted', text: `${date(p.paidOn)} \u00b7 ${usd(p.amountCents)} \u00b7 ${p.method}` })),
          t.balanceCents > 0 ? el('div', { class: 'mt-3' }, e.payEnabled ? [t.depositDueCents > 0 ? payButton('deposit', `Pay deposit ${usd(t.depositDueCents)}`) : '', payButton('balance', `Pay full balance ${usd(t.balanceCents)}`)] : el('p', { class: 'small text-muted mb-0', text: 'To pay by check, cash or card, please contact us. Online payment is coming soon.' })) : '') : '',
        (e.permits || []).length ? el('div', { class: 'card card-body mb-3' }, el('h3', { class: 'h5', text: 'Permits and inspections' }),
          ...e.permits.map(x => el('div', { class: 'border-bottom py-2' }, el('strong', { text: `${x.type} permit${x.number ? ` #${x.number}` : ''}: ${x.statusLabel}` }),
            el('div', { class: 'small text-muted', text: [x.description, x.appliedOn && `Applied ${date(x.appliedOn)}`, x.issuedOn && `Issued ${date(x.issuedOn)}`, x.expiresOn && `Expires ${date(x.expiresOn)}`, x.status === 'needed' || x.status === 'applied' ? `City review usually takes ${x.reviewDays[0]} to ${x.reviewDays[1]} business days` : ''].filter(Boolean).join(' \u00b7 ') }),
            x.customerNote ? el('div', { class: 'small', text: x.customerNote }) : '',
            ...x.inspections.map(i => el('div', { class: 'small', text: `Inspection: ${i.name}${i.scheduledOn ? ` on ${date(i.scheduledOn)}` : ''} \u2014 ${i.resultLabel}` }))))) : '',
        docs.length ? el('div', {}, el('h3', { class: 'h5', text: 'Legal documents' }), ...docs) : '',
        el('div', { class: 'mt-3 d-flex flex-wrap gap-2' }, el('a', { class: 'btn btn-outline-dark btn-sm', href: `/api/account/estimates/${id}/pdf`, target: '_blank', rel: 'noopener', text: 'Download estimate PDF' })), note);
    };
    await render(await load());
  }

  const run = { dashboard, new: newRequest, request: requestDetail, estimate: estimateDetail, admin }[page];
  if (run) run().catch(error => { const box = document.getElementById('account-root') || root; show(box, 'danger', error.message); });
})();
