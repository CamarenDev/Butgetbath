document.querySelectorAll('input[data-min-today]').forEach(i => { i.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); });

document.querySelectorAll('form[data-form]').forEach(form => {
  const status = form.querySelector('.form-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    form.classList.add('was-validated');
    if (!form.checkValidity()) {
      status.className = 'form-status mt-3 alert alert-danger';
      status.setAttribute('role', 'alert');
      status.textContent = 'Please correct the marked fields and try again. Your information is still here.';
      return;
    }
    const button = form.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(form));
    data.consent = form.elements.consent.checked;
    data.marketing = Boolean(form.elements.marketing && form.elements.marketing.checked);
    button.disabled = true;
    status.className = 'form-status mt-3 text-muted';
    status.textContent = 'Sending...';
    try {
      const response = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Something went wrong.');
      form.dispatchEvent(new CustomEvent('bbs:submitted'));
      window.location.assign('/thank-you/');
    } catch (error) {
      status.className = 'form-status mt-3 alert alert-danger';
      status.textContent = error.name === 'TimeoutError' || error instanceof TypeError ? 'We could not reach the server. Please check your connection and try again.' : error.message;
      status.setAttribute('role', 'alert');
      button.disabled = false;
    }
  });
});

// Scroll reveal
{
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
    items.forEach(el => io.observe(el));
  } else items.forEach(el => el.classList.add('in'));
}

// Portfolio (projects + reviews), announcement banner and review form. All text goes in via textContent.
{
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
    n.append(...kids);
    return n;
  };
  const containers = document.querySelectorAll('[data-portfolio]');
  const reveal = nodes => { const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null; nodes.forEach(n => io ? io.observe(n) : n.classList.add('in')); };
  const sampleBadge = x => x.sample ? el('span', { class: 'badge-sample', text: 'Sample' }) : '';

  const projectCard = p => el('figure', { class: 'work-card reveal', 'data-cat': p.category },
    el('button', { type: 'button', class: 'work-open', 'data-src': p.image, 'data-title': p.title, 'data-caption': `${p.summary} ${p.county}`.trim(), 'aria-label': `Open ${p.title}` },
      el('img', { src: p.image, alt: p.alt, loading: 'lazy', width: '800', height: '900' }), sampleBadge(p),
      el('figcaption', {}, el('span', { class: 'chip', text: p.category }), el('strong', { text: p.title }), el('small', { text: p.county }))));
  const reviewCard = r => el('blockquote', { class: 'review-card reveal' }, sampleBadge(r),
    el('span', { class: 'stars', role: 'img', 'aria-label': `${r.rating} out of 5 stars`, text: '\u2605'.repeat(r.rating) + '\u2606'.repeat(5 - r.rating) }),
    el('p', { text: `\u201c${r.text}\u201d` }),
    el('footer', {}, el('span', { class: 'avatar', 'aria-hidden': 'true', text: r.name[0] }), el('span', {}, el('strong', { text: r.name }), el('small', { text: r.town }))));

  function lightbox(grid) {
    let dlg = document.getElementById('lightbox');
    if (!dlg) {
      dlg = el('dialog', { class: 'lightbox', id: 'lightbox', 'aria-labelledby': 'lb-caption' },
        el('button', { type: 'button', class: 'lb-close', 'aria-label': 'Close project viewer', text: '\u00d7' }),
        el('button', { type: 'button', class: 'lb-nav lb-prev', 'aria-label': 'Previous project', text: '\u2039' }),
        el('div', { class: 'lb-stage' }),
        el('p', { class: 'lb-caption', id: 'lb-caption', 'aria-live': 'polite' }),
        el('button', { type: 'button', class: 'lb-nav lb-next', 'aria-label': 'Next project', text: '\u203a' }));
      document.body.append(dlg);
    }
    const stage = dlg.querySelector('.lb-stage'), cap = dlg.querySelector('.lb-caption');
    let list = [], i = 0, opener = null;
    const show = n => {
      if (!list.length) return;
      i = (n + list.length) % list.length;
      const b = list[i];
      stage.replaceChildren(el('img', { src: b.dataset.src, alt: b.dataset.title }));
      cap.textContent = `${b.dataset.title} \u2014 ${b.dataset.caption}`;
      dlg.querySelector('.lb-prev').disabled = list.length < 2;
      dlg.querySelector('.lb-next').disabled = list.length < 2;
    };
    grid.addEventListener('click', e => {
      const btn = e.target.closest('.work-open');
      if (!btn) return;
      list = [...grid.querySelectorAll('.work-card:not([hidden]) .work-open')];
      if (!list.length) return;
      opener = btn;
      show(list.indexOf(btn));
      dlg.showModal();
      dlg.querySelector('.lb-close').focus();
    });
    dlg.querySelector('.lb-close').addEventListener('click', () => dlg.close());
    dlg.querySelector('.lb-prev').addEventListener('click', () => show(i - 1));
    dlg.querySelector('.lb-next').addEventListener('click', () => show(i + 1));
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
      if (e.key === 'Home') { e.preventDefault(); show(0); }
      if (e.key === 'End') { e.preventDefault(); show(list.length - 1); }
    });
    dlg.addEventListener('close', () => {
      stage.replaceChildren();
      if (opener && document.contains(opener)) opener.focus();
      opener = null;
    });
  }

  function filters(grid, projects) {
    const bar = document.querySelector('[data-filter-bar]');
    if (!bar) return;
    const cats = ['All', ...new Set(projects.map(p => p.category).filter(Boolean))];
    bar.replaceChildren(...cats.map((c, n) => el('button', { type: 'button', class: `pill${n ? '' : ' active'}`, 'data-filter': c, 'aria-pressed': n ? 'false' : 'true', text: c })));
    bar.addEventListener('click', e => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      bar.querySelectorAll('.pill').forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
      grid.querySelectorAll('.work-card').forEach(c => { c.hidden = btn.dataset.filter !== 'All' && c.dataset.cat !== btn.dataset.filter; });
    });
  }

  if (containers.length) {
    const setState = (box, kind, message) => {
      box.setAttribute('aria-busy', String(kind === 'loading'));
      box.replaceChildren(el('div', { class: `content-state content-state-${kind}`, ...(kind === 'error' && { role: 'alert' }) },
        el('p', { text: message }),
        kind === 'error' ? el('button', { type: 'button', class: 'btn btn-outline-dark', 'data-retry-portfolio': '', text: 'Try again' }) : ''));
    };
    const load = async () => {
      containers.forEach(box => setState(box, 'loading', box.dataset.portfolio === 'reviews' ? 'Loading reviews…' : 'Loading project photos…'));
      try {
        const response = await fetch('/api/public/portfolio');
        if (!response.ok) throw new Error(`Portfolio request failed with status ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.projects) || !Array.isArray(data.reviews)) throw new Error('Portfolio response was not valid');
        const { projects, reviews } = data;
      containers.forEach(box => {
        const limit = Number(box.dataset.limit) || Infinity;
        if (box.dataset.portfolio === 'projects') {
          const items = projects.slice(0, limit);
          box.replaceChildren(...(items.length ? items.map(projectCard) : [el('div', { class: 'content-state content-state-empty' }, el('p', { text: 'Project photos are coming soon.' }))]));
          if (box.id === 'work-grid') filters(box, projects);
          lightbox(box);
        } else {
          const items = reviews.slice(0, limit);
          box.replaceChildren(...(items.length ? items.map(reviewCard) : [el('div', { class: 'content-state content-state-empty' }, el('p', { text: 'Reviews are coming soon.' }))]));
        }
        box.setAttribute('aria-busy', 'false');
        reveal(box.querySelectorAll('.reveal'));
      });
      } catch {
        containers.forEach(box => setState(box, 'error', 'We could not load this right now. Your connection may be offline.'));
      }
    };
    document.addEventListener('click', e => {
      if (e.target.closest('[data-retry-portfolio]')) load();
    });
    load();
  }

  const banner = document.getElementById('site-banner');
  if (banner) fetch('/api/public/site').then(r => r.json()).then(({ banner: text }) => { if (text) { banner.textContent = text; banner.hidden = false; } }).catch(() => {});

  const reviewForm = document.querySelector('[data-review-form]');
  if (reviewForm) {
    const status = reviewForm.querySelector('.form-status');
    reviewForm.addEventListener('submit', async event => {
      event.preventDefault();
      reviewForm.classList.add('was-validated');
      if (!reviewForm.checkValidity()) {
        status.className = 'form-status mt-3 alert alert-danger';
        status.setAttribute('role', 'alert');
        status.textContent = 'Please correct the marked fields and try again.';
        return;
      }
      const button = reviewForm.querySelector('button[type=submit]');
      button.disabled = true;
      status.className = 'form-status mt-3 text-muted';
      status.textContent = 'Submitting your review…';
      try {
        const response = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(new FormData(reviewForm)), rating: Number(reviewForm.elements.rating.value) }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Something went wrong.');
        status.setAttribute('role', 'status');
        status.className = 'form-status mt-3 alert alert-success';
        status.textContent = result.message;
        reviewForm.reset();
        reviewForm.classList.remove('was-validated');
      } catch (error) {
        status.className = 'form-status mt-3 alert alert-danger';
        status.setAttribute('role', 'alert');
        status.textContent = `${error.message} Your review has not been cleared; you can try again.`;
      }
      finally { button.disabled = false; }
    });
  }

  // Visit statistics are recorded server-side only when the admin has switched them on.
  if (!/^\/(admin|account)\//.test(location.pathname) && navigator.sendBeacon) {
    navigator.sendBeacon('/api/track', new Blob([JSON.stringify({ path: location.pathname, referrer: document.referrer })], { type: 'application/json' }));
  }
}

// Print buttons (CSP blocks inline handlers)
document.querySelectorAll('[data-print]').forEach(b => b.addEventListener('click', () => window.print()));
