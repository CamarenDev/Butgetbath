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
  const dateTime = value => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const photoGrid = photos => el('div', { class: 'row g-3 mt-1' }, ...photos.map(p => el('figure', { class: 'col-6 col-md-4 mb-0' }, el('a', { href: `/api/photos/${p.id}`, target: '_blank', rel: 'noopener' }, el('img', { src: `/api/photos/${p.id}`, alt: p.caption || `Project photo: ${p.name}`, class: 'img-fluid rounded-3 w-100', loading: 'lazy' })), p.caption ? el('figcaption', { class: 'small mt-1 pre-wrap', text: p.caption }) : '')));
  const field = (label, value) => value ? el('p', { class: 'mb-2' }, el('strong', { text: `${label}: ` }), document.createTextNode(value)) : '';
  const requireUser = async () => { try { return (await api('/api/auth/me')).user; } catch (e) { if (e.status === 401) { location.replace('/account/login/'); return null; } throw e; } };

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

  async function dashboard() {
    const user = await requireUser();
    if (!user) return;
    const box = document.getElementById('account-root');
    const { requests } = await api('/api/requests');
    box.className = '';
    box.replaceChildren(
      el('div', { class: 'd-flex flex-wrap justify-content-between align-items-center gap-3 mb-4' },
        el('div', {}, el('h2', { class: 'h3 mb-0', text: `Hi, ${user.name}` }), el('span', { class: 'text-muted', text: user.email })),
        el('div', { class: 'd-flex gap-2' }, user.admin ? el('a', { class: 'btn btn-outline-dark', href: '/account/admin/', text: 'Customer requests' }) : '', el('button', { class: 'btn btn-outline-dark', type: 'button', 'data-logout': '', text: 'Sign out' }))),
      user.verified ? '' : el('div', { class: 'alert alert-warning d-flex flex-wrap justify-content-between align-items-center gap-2' }, el('span', { text: 'Please confirm your email to send project requests. Check your inbox for our message.' }), el('button', { class: 'btn btn-sm btn-dark', type: 'button', 'data-resend': '', text: 'Resend email' })),
      el('div', { class: 'd-flex justify-content-between align-items-center mb-3' }, el('h2', { class: 'h4 mb-0', text: 'Your project requests' }), user.verified ? el('a', { class: 'btn btn-brass', href: '/account/new/', text: 'New request' }) : ''),
      requests.length ? el('div', { class: 'list-group' }, ...requests.map(r => el('a', { class: 'list-group-item list-group-item-action p-3', href: `/account/request/?id=${r.id}` }, el('div', { class: 'd-flex flex-wrap justify-content-between gap-2' }, el('strong', { text: `${r.title}  #${r.id}` }), el('span', { class: 'd-flex gap-2' }, r.unread ? el('span', { class: 'badge text-bg-danger', text: 'New reply' }) : '', statusBadge(r.status, r.statusLabel))), el('div', { class: 'text-muted small mt-1', text: `${r.projectType} \u00b7 ${r.location} \u00b7 ${r.photoCount} photo${r.photoCount === 1 ? '' : 's'} \u00b7 ${r.messageCount} message${r.messageCount === 1 ? '' : 's'} \u00b7 ${date(r.lastMessageAt || r.createdAt)}` })))) : el('div', { class: 'card card-body p-4 text-center' }, el('p', { class: 'mb-0', text: 'No requests yet. Start one and tell us what you are looking for.' })),
      el('div', { class: 'form-check form-switch mt-4' }, el('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: 'notify-pref', ...(user.notifyEmail ? { checked: '' } : {}) }), el('label', { class: 'form-check-label', for: 'notify-pref', text: 'Email me when our team replies or updates a request' })));
    const pref = box.querySelector('#notify-pref');
    pref.addEventListener('change', () => postJson('/api/auth/preferences', { notifyEmail: pref.checked }).catch(() => { pref.checked = !pref.checked; }));
    box.querySelector('[data-logout]').addEventListener('click', logout);
    const resend = box.querySelector('[data-resend]');
    if (resend) resend.addEventListener('click', async () => { resend.disabled = true; try { await postJson('/api/auth/resend-verification', {}); resend.textContent = 'Sent!'; } catch (e) { resend.textContent = e.message; } });
  }

  async function uploadPhotos(id, files, status) {
    let done = 0;
    for (const file of files) {
      status.textContent = `Uploading photo ${done + 1} of ${files.length}...`;
      await api(`/api/requests/${id}/photos`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file });
      done++;
    }
  }
  const checkFiles = files => {
    if (files.length > 10) return 'You can upload up to 10 photos.';
    for (const f of files) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return `"${f.name}" is not a JPG, PNG or WebP image.`;
      if (f.size > 8 * 1024 * 1024) return `"${f.name}" is larger than 8 MB.`;
    }
    return '';
  };

  async function newRequest() {
    if (!await requireUser()) return;
    const requestForm = document.querySelector('form[data-request-form]');
    const status = requestForm.querySelector('.form-status');
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
      const data = Object.fromEntries(['title', 'projectType', 'location', 'timeline', 'budget', 'description'].map(k => [k, requestForm.elements[k].value]));
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
      el('div', { class: 'd-flex flex-wrap justify-content-between gap-2 mb-3' }, el('h2', { class: 'h3 mb-0', text: request.title }), el('span', { class: 'd-flex gap-2 align-items-center' }, el('span', { class: 'text-muted', text: `#${request.id}` }), statusBadge(request.status, request.statusLabel, staff))),
      staff ? field('Customer', `${request.customer.name} <${request.customer.email}>`) : '', staff ? field('Phone', request.customer.phone) : '',
      field('Type', request.projectType), field('County', request.location), field('Timeline', request.timeline), field('Budget', request.budget), field('Created', date(request.createdAt)),
      el('p', { class: 'mt-3 mb-0 pre-wrap', text: request.description }),
      request.photos.length ? el('div', {}, el('h3', { class: 'h6 mt-4 mb-0', text: `Photos with the request (${request.photos.length})` }), photoGrid(request.photos)) : '');

    async function refresh() {
      request = (await api(`/api/requests/${id}`)).request;
      renderThread();
      statusSelect.value = request.status;
    }

    // Staff controls
    const statusSelect = el('select', { class: 'form-select w-auto', id: 'ticket-status', 'aria-label': 'Request status' }, ...Object.entries(STAFF_LABELS).map(([v, l]) => el('option', { value: v, text: l, ...(v === request.status ? { selected: '' } : {}) })));
    const staffBar = staff ? el('div', { class: 'card card-body p-3 mb-4 d-flex flex-row flex-wrap align-items-center gap-3' }, el('label', { class: 'fw-semibold', for: 'ticket-status', text: 'Status' }), statusSelect, el('span', { class: 'text-muted small', text: 'Changing the status emails the customer.' })) : '';
    statusSelect.addEventListener('change', async () => { try { await postJson(`/api/requests/${id}/status`, { status: statusSelect.value }); await refresh(); } catch (e) { show(status, 'danger', e.message); } });

    // Draft: add photos, then send to our team
    const draftFile = el('input', { class: 'form-control', id: 'more-photos', type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: '' });
    const draftAdd = el('button', { class: 'btn btn-outline-dark mt-2', type: 'button', text: 'Upload photos' });
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
    const files = el('input', { class: 'form-control', id: 'ticket-photos', type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: '' });
    const previews = el('div', { class: 'row g-3 mt-1' });
    const internal = staff ? el('input', { class: 'form-check-input', type: 'checkbox', id: 'ticket-internal' }) : null;
    const sendMessage = el('button', { class: 'btn btn-brass', type: 'button', text: 'Send message' });
    let chosen = [];
    const renderPreviews = () => previews.replaceChildren(...chosen.map((c, i) => el('div', { class: 'col-6 col-md-4' }, el('div', { class: 'card h-100' }, el('img', { src: c.url, alt: `Preview of ${c.file.name}`, class: 'card-img-top' }),
      el('div', { class: 'card-body p-2' }, el('input', { class: 'form-control form-control-sm', type: 'text', maxlength: '300', placeholder: 'Add a comment about this photo', 'aria-label': `Comment for ${c.file.name}`, value: c.caption }), el('button', { class: 'btn btn-link btn-sm p-0 mt-1', type: 'button', text: 'Remove', 'data-remove': String(i) }))))));
    previews.addEventListener('input', event => { const row = event.target.closest('.col-6'); if (row) chosen[[...previews.children].indexOf(row)].caption = event.target.value; });
    previews.addEventListener('click', event => { const i = event.target.dataset.remove; if (i !== undefined) { URL.revokeObjectURL(chosen[i].url); chosen.splice(Number(i), 1); renderPreviews(); } });
    files.addEventListener('change', () => {
      const picked = [...files.files];
      files.value = '';
      const problem = checkFiles(picked) || (chosen.length + picked.length > 10 ? 'You can attach up to 10 photos per message.' : '');
      if (problem) return show(status, 'danger', problem);
      status.className = 'form-status mt-3';
      status.textContent = '';
      chosen.push(...picked.map(file => ({ file, caption: '', url: URL.createObjectURL(file) })));
      renderPreviews();
    });
    sendMessage.addEventListener('click', async () => {
      const text = body.value.trim();
      if (!text && !chosen.length) return show(status, 'warning', 'Write a message or add a photo first.');
      sendMessage.disabled = true;
      try {
        const photoIds = [];
        for (const [i, c] of chosen.entries()) {
          show(status, 'secondary', `Uploading photo ${i + 1} of ${chosen.length}...`);
          photoIds.push((await api(`/api/requests/${id}/photos`, { method: 'POST', headers: { 'Content-Type': c.file.type, 'X-Filename': encodeURIComponent(c.file.name), 'X-Caption': encodeURIComponent(c.caption.trim()) }, body: c.file })).id);
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
      el('label', { class: 'form-label mt-3', for: 'ticket-photos', text: 'Attach photos (JPG, PNG or WebP, up to 8 MB each)' }), files, previews,
      internal ? el('div', { class: 'form-check mt-3' }, internal, el('label', { class: 'form-check-label', for: 'ticket-internal', text: 'Internal note (hidden from the customer, no email sent)' })) : '',
      el('div', { class: 'd-flex flex-wrap gap-2 mt-3' }, sendMessage, closeButton), status);

    box.className = '';
    box.replaceChildren(
      el('p', {}, el('a', { href: staff ? '/account/admin/' : '/account/', text: staff ? '\u2190 All customer requests' : '\u2190 Back to my account' })),
      params.get('sent') ? el('div', { class: 'alert alert-success', text: 'Thank you! We received your request and emailed you a confirmation. We will reply here and by email.' }) : '',
      details, staffBar, request.status === 'draft' ? draftPanel : el('div', {}, el('h3', { class: 'h5', text: 'Conversation' }), thread, composer));

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
      const list = el('div', { class: 'list-group' });
      const bar = el('div', { class: 'd-flex flex-wrap gap-2 mb-3', role: 'group', 'aria-label': 'Filter requests' });
      const render = () => {
        const shown = requests.filter(r => filter === 'all' || (filter === 'unread' ? r.unread : r.status === filter));
        list.replaceChildren(...(shown.length ? shown.map(r => el('a', { class: 'list-group-item list-group-item-action p-3', href: `/account/request/?id=${r.id}` },
          el('div', { class: 'd-flex flex-wrap justify-content-between gap-2' }, el('strong', { text: `${r.title}  #${r.id}` }), el('span', { class: 'd-flex gap-2' }, r.unread ? el('span', { class: 'badge text-bg-danger', text: 'Needs reply' }) : '', statusBadge(r.status, r.statusLabel, true))),
          el('div', { class: 'small text-muted mt-1', text: `${r.customer.name} <${r.customer.email}> \u00b7 ${r.projectType} \u00b7 ${r.location} \u00b7 ${r.photoCount} photo${r.photoCount === 1 ? '' : 's'} \u00b7 ${dateTime(r.lastMessageAt)}` }))) : [el('p', { class: 'text-muted', text: 'Nothing here.' })]));
        bar.replaceChildren(...[['all', 'All'], ['unread', `Needs reply (${requests.filter(r => r.unread).length})`], ...Object.entries(STAFF_LABELS)].map(([v, l]) => el('button', { class: `btn btn-sm ${filter === v ? 'btn-dark' : 'btn-outline-dark'}`, type: 'button', 'data-filter': v, text: l })));
      };
      bar.addEventListener('click', event => { if (event.target.dataset.filter) { filter = event.target.dataset.filter; render(); } });
      render();
      box.className = '';
      box.replaceChildren(el('p', {}, el('a', { href: '/account/', text: '\u2190 Back to my account' })), bar, list);
    } catch (e) { show(box, 'danger', e.status === 403 ? 'Your account does not have staff access.' : e.message); }
  }

  const run = { dashboard, new: newRequest, request: requestDetail, admin }[page];
  if (run) run().catch(error => { const box = document.getElementById('account-root') || root; show(box, 'danger', error.message); });
})();
