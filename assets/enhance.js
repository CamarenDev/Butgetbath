(() => {
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
    n.append(...kids);
    return n;
  };

  // Sticky header shadow, back-to-top button and reading progress
  const header = document.querySelector('.site-header');
  const toTop = el('button', { type: 'button', class: 'to-top', 'aria-label': 'Back to top', text: '\u2191' });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  document.body.append(toTop);
  const article = document.querySelector('.article');
  let bar;
  if (article) { bar = el('div', { class: 'read-progress', 'aria-hidden': 'true' }, el('span')); document.body.append(bar); }
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    toTop.classList.toggle('show', y > 600);
    if (bar && article) {
      const r = article.getBoundingClientRect(), total = r.height - window.innerHeight;
      bar.firstChild.style.width = `${Math.min(100, Math.max(0, total > 0 ? (-r.top / total) * 100 : 100))}%`;
    }
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // Collapse the mobile menu after choosing a link
  document.querySelectorAll('#nav a').forEach(a => a.addEventListener('click', () => {
    const nav = document.getElementById('nav');
    if (nav && nav.classList.contains('show') && window.bootstrap) window.bootstrap.Collapse.getOrCreateInstance(nav).hide();
  }));

  // Article extras: reading time, share/copy link and table of contents
  if (article) {
    const words = article.textContent.trim().split(/\s+/).length;
    const meta = el('div', { class: 'article-meta' }, el('span', { text: `${Math.max(1, Math.round(words / 200))} min read` }));
    const share = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', text: navigator.share ? 'Share' : 'Copy link' });
    share.addEventListener('click', async () => {
      try {
        if (navigator.share) await navigator.share({ title: document.title, url: location.href });
        else { await navigator.clipboard.writeText(location.href); share.textContent = 'Link copied'; setTimeout(() => { share.textContent = 'Copy link'; }, 2000); }
      } catch { /* user cancelled */ }
    });
    meta.append(share);
    const heads = [...article.querySelectorAll('h2')];
    article.prepend(...[meta, heads.length >= 3 ? (() => {
      const list = el('ol');
      heads.forEach((h, i) => {
        if (!h.id) h.id = `section-${i + 1}`;
        list.append(el('li', {}, el('a', { href: `#${h.id}`, text: h.textContent })));
      });
      return el('nav', { class: 'toc', 'aria-label': 'On this page' }, el('strong', { text: 'On this page' }), list);
    })() : ''].filter(Boolean));
  }

  // Forum search: hide non-matching topic cards and empty categories
  const search = document.querySelector('[data-forum-search]');
  if (search) {
    const cards = [...document.querySelectorAll('.guide-card')].map(a => ({ box: a.parentElement, text: a.textContent.toLowerCase() }));
    const count = document.querySelector('[data-forum-count]');
    search.addEventListener('input', () => {
      const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      cards.forEach(c => { const ok = terms.every(t => c.text.includes(t)); c.box.hidden = !ok; if (ok) shown++; });
      document.querySelectorAll('.container > .mb-5[id]').forEach(sec => { sec.hidden = !sec.querySelector('.col-md-6:not([hidden])'); });
      count.textContent = terms.length ? `${shown} topic${shown === 1 ? '' : 's'} found` : '';
    });
  }

  // Lightbox swipe
  const dlg = document.getElementById('lightbox');
  if (dlg) {
    let x0 = null;
    dlg.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) dlg.querySelector(dx < 0 ? '.lb-next' : '.lb-prev')?.click();
    });
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

  // Motion: floating particles in hero bands, staggered reveals and pointer-aware buttons
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  if (!calm.matches) {
    document.querySelectorAll('.hero, .page-hero, .cta-band').forEach(band => {
      const canvas = el('canvas', { class: 'particles', 'aria-hidden': 'true' });
      band.prepend(canvas);
      const ctx = canvas.getContext('2d');
      let w = 0, h = 0, dots = [], raf = 0, visible = false, mouse = null;
      const resize = () => {
        const r = band.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
        w = r.width; h = r.height;
        canvas.width = w * dpr; canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const n = Math.min(70, Math.round(w * h / 14000));
        dots = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2.2, vx: (Math.random() - .5) * .25, vy: -.1 - Math.random() * .35, a: .25 + Math.random() * .5 }));
      };
      const tick = () => {
        ctx.clearRect(0, 0, w, h);
        for (const d of dots) {
          d.x += d.vx; d.y += d.vy;
          if (mouse) { const dx = d.x - mouse.x, dy = d.y - mouse.y, dist = Math.hypot(dx, dy); if (dist < 110) { d.x += dx / dist * 1.2; d.y += dy / dist * 1.2; } }
          if (d.y < -5) { d.y = h + 5; d.x = Math.random() * w; }
          if (d.x < -5) d.x = w + 5; else if (d.x > w + 5) d.x = -5;
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fillStyle = `rgba(255,236,200,${d.a})`; ctx.fill();
        }
        for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
          const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
          if (dist < 90) { ctx.strokeStyle = `rgba(225,183,111,${.18 * (1 - dist / 90)})`; ctx.beginPath(); ctx.moveTo(dots[i].x, dots[i].y); ctx.lineTo(dots[j].x, dots[j].y); ctx.stroke(); }
        }
        raf = visible ? requestAnimationFrame(tick) : 0;
      };
      band.addEventListener('pointermove', e => { const r = band.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
      band.addEventListener('pointerleave', () => { mouse = null; });
      new ResizeObserver(resize).observe(band);
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(tick); }).observe(band);
      resize();
    });

    document.querySelectorAll('.row > [class*="col-"] > .card, .review-grid > *, .steps > .step').forEach(n => {
      const i = [...n.parentElement.children].indexOf(n.parentElement.classList.contains('row') ? n : n);
      n.style.transitionDelay = `${Math.min(i, 6) * 70}ms`;
    });

    document.querySelectorAll('.btn-brass').forEach(btn => btn.addEventListener('pointermove', e => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--mx', `${e.clientX - r.left}px`);
      btn.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
  }

  // Forms: phone formatting, inline errors, focus first invalid field, remember drafts
  document.querySelectorAll('input[type=tel]').forEach(input => input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10);
    if (d.length === 10 || (input.value.match(/\D/g) || []).every(c => ' ()-'.includes(c))) {
      input.value = d.length > 6 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : d;
    }
  }));

  document.querySelectorAll('form[data-form]').forEach(form => {
    const key = `draft:${location.pathname}:${form.id || form.querySelector('[name=type]')?.value || 'form'}`;
    const fields = [...form.querySelectorAll('input[name],select[name],textarea[name]')].filter(f => !['password', 'hidden', 'checkbox'].includes(f.type) && f.name !== 'website');
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || '{}');
      if (Date.now() - (saved._t || 0) > 864e5) sessionStorage.removeItem(key);
      else fields.forEach(f => { if (saved[f.name] && !f.value) f.value = saved[f.name]; });
    } catch { /* storage unavailable */ }
    form.addEventListener('input', () => {
      try { sessionStorage.setItem(key, JSON.stringify({ ...Object.fromEntries(fields.map(f => [f.name, f.value])), _t: Date.now() })); } catch { /* storage unavailable */ }
    });
    form.addEventListener('submit', () => {
      const bad = [...form.querySelectorAll(':invalid')];
      form.querySelectorAll('.field-error').forEach(n => n.remove());
      form.querySelectorAll('[aria-invalid]').forEach(n => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
      bad.forEach(f => {
        const id = `${f.id || f.name}-error`;
        f.setAttribute('aria-invalid', 'true');
        f.setAttribute('aria-describedby', id);
        const target = f.closest('.form-check') || f;
        target.insertAdjacentElement('afterend', el('div', { class: 'field-error', id, text: f.validationMessage }));
      });
      if (bad[0]) bad[0].focus();
    });
    // Clear the draft once the request has gone through (the page then navigates to /thank-you/)
    form.addEventListener('submit', () => { if (form.checkValidity()) setTimeout(() => { try { sessionStorage.removeItem(key); } catch { /* ignore */ } }, 1500); });
  });
})();
