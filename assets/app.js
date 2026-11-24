document.querySelectorAll('input[data-min-today]').forEach(i => { i.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); });

document.querySelectorAll('form[data-form]').forEach(form => {
  const status = form.querySelector('.form-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;
    const button = form.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(form));
    data.consent = form.elements.consent.checked;
    button.disabled = true;
    status.className = 'form-status mt-3 text-muted';
    status.textContent = 'Sending...';
    try {
      const response = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Something went wrong.');
      window.location.assign('/thank-you/');
    } catch (error) {
      status.className = 'form-status mt-3 alert alert-danger';
      status.textContent = error.message;
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
    const dlg = document.getElementById('lightbox');
    if (!dlg) return;
    const stage = dlg.querySelector('.lb-stage'), cap = dlg.querySelector('.lb-caption');
    let list = [], i = 0;
    const show = n => {
      i = (n + list.length) % list.length;
      const b = list[i];
      stage.replaceChildren(el('img', { src: b.dataset.src, alt: b.dataset.title }));
      cap.textContent = `${b.dataset.title} \u2014 ${b.dataset.caption}`;
    };
    grid.addEventListener('click', e => {
      const btn = e.target.closest('.work-open');
      if (!btn) return;
      list = [...grid.querySelectorAll('.work-card:not([hidden]) .work-open')];
      show(list.indexOf(btn));
      dlg.showModal();
    });
    dlg.querySelector('.lb-close').addEventListener('click', () => dlg.close());
    dlg.querySelector('.lb-prev').addEventListener('click', () => show(i - 1));
    dlg.querySelector('.lb-next').addEventListener('click', () => show(i + 1));
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); });
    dlg.addEventListener('close', () => stage.replaceChildren());
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
    fetch('/api/public/portfolio').then(r => r.json()).then(({ projects, reviews }) => {
      containers.forEach(box => {
        const limit = Number(box.dataset.limit) || Infinity;
        if (box.dataset.portfolio === 'projects') {
          const items = projects.slice(0, limit);
          box.replaceChildren(...(items.length ? items.map(projectCard) : [el('p', { class: 'text-muted', text: 'Project photos are coming soon.' })]));
          if (box.id === 'work-grid') filters(box, projects);
          lightbox(box);
        } else {
          const items = reviews.slice(0, limit);
          box.replaceChildren(...(items.length ? items.map(reviewCard) : [el('p', { class: 'text-muted', text: 'Reviews are coming soon.' })]));
        }
        reveal(box.querySelectorAll('.reveal'));
      });
    }).catch(() => containers.forEach(box => box.replaceChildren(el('p', { class: 'text-muted', text: 'We could not load this right now. Please try again later.' }))));
  }

  const banner = document.getElementById('site-banner');
  if (banner) fetch('/api/public/site').then(r => r.json()).then(({ banner: text }) => { if (text) { banner.textContent = text; banner.hidden = false; } }).catch(() => {});

  const reviewForm = document.querySelector('[data-review-form]');
  if (reviewForm) {
    const status = reviewForm.querySelector('.form-status');
    reviewForm.addEventListener('submit', async event => {
      event.preventDefault();
      reviewForm.classList.add('was-validated');
      if (!reviewForm.checkValidity()) return;
      const button = reviewForm.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const response = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(new FormData(reviewForm)), rating: Number(reviewForm.elements.rating.value) }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Something went wrong.');
        status.className = 'form-status mt-3 alert alert-success';
        status.textContent = result.message;
        reviewForm.reset();
        reviewForm.classList.remove('was-validated');
      } catch (error) {
        status.className = 'form-status mt-3 alert alert-danger';
        status.textContent = error.message;
      }
      button.disabled = false;
    });
  }

  // Visit statistics are recorded server-side only when the admin has switched them on.
  if (!/^\/(admin|account)\//.test(location.pathname) && navigator.sendBeacon) {
    navigator.sendBeacon('/api/track', new Blob([JSON.stringify({ path: location.pathname, referrer: document.referrer })], { type: 'application/json' }));
  }
}
