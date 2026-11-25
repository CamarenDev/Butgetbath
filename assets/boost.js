/* Site enhancements (numbered in the project change list). Every feature is isolated so one failure cannot stop the others. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var run = function (fn) { try { fn(); } catch (e) { if (window.__bbsErrors) window.__bbsErrors.report(e, { feature: fn.name }); } };
  var saveData = navigator.connection && navigator.connection.saveData;

  // 4 Save-Data: switch off decorative motion
  run(function saveDataMode() { if (saveData) document.documentElement.classList.add('save-data'); });

  // 1 Prefetch internal pages on hover/touch
  run(function prefetch() {
    if (saveData || !('relList' in document.createElement('link')) || !document.createElement('link').relList.supports('prefetch')) return;
    var done = {};
    var go = function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.origin !== location.origin || a.hash && a.pathname === location.pathname || done[a.pathname] || /^\/(api|admin|estimator|employee)\b/.test(a.pathname) || a.target === '_blank') return;
      done[a.pathname] = 1;
      var l = document.createElement('link'); l.rel = 'prefetch'; l.href = a.pathname; document.head.append(l);
    };
    document.addEventListener('mouseover', go, { passive: true });
    document.addEventListener('touchstart', go, { passive: true });
  });

  // 2 Async decoding and fade-in; 3 broken images get a neutral placeholder
  run(function images() {
    var svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><rect width="400" height="260" fill="#e8eefc"/><path d="M0 200l110-80 80 60 70-50 140 90v40H0z" fill="#c7d6f7"/><circle cx="300" cy="70" r="26" fill="#fff"/></svg>');
    $$('img').forEach(function (img) {
      img.decoding = 'async';
      if (!img.complete) { img.classList.add('img-loading'); img.addEventListener('load', function () { img.classList.remove('img-loading'); }, { once: true }); }
      img.addEventListener('error', function () { img.classList.remove('img-loading'); if (img.dataset.fallback) return; img.dataset.fallback = '1'; img.src = svg; });
      if (img.complete && img.naturalWidth === 0 && img.src && !img.dataset.fallback) { img.dataset.fallback = '1'; img.src = svg; }
    });
  });

  // 6 Highlight the current section in the table of contents
  run(function scrollspy() {
    var links = $$('a[href^="#"]', $('.toc, [aria-label="On this page"], .article-toc') || document.createElement('div'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {}; links.forEach(function (a) { var t = document.getElementById(decodeURIComponent(a.hash.slice(1))); if (t) map[t.id] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { links.forEach(function (a) { a.classList.remove('toc-active'); }); map[e.target.id].classList.add('toc-active'); } });
    }, { rootMargin: '-80px 0px -65% 0px' });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  });

  // 7 Header hides while scrolling down on phones and returns on scroll up
  run(function autoHide() {
    var h = $('header, .site-header'); if (!h) return;
    var last = window.scrollY, ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY, open = $('.navbar-collapse.show');
        h.classList.toggle('header-hidden', innerWidth < 992 && y > last + 4 && y > 240 && !open);
        if (y < last - 4) h.classList.remove('header-hidden');
        last = y; ticking = false;
      });
    }, { passive: true });
  });

  // 8 Copyable links on article headings
  run(function headingAnchors() {
    $$('.article h2[id], .article h3[id]').forEach(function (h) {
      var a = document.createElement('a'); a.className = 'heading-anchor'; a.href = '#' + h.id; a.setAttribute('aria-label', 'Link to this section'); a.textContent = '#';
      a.addEventListener('click', function () { try { navigator.clipboard.writeText(location.origin + location.pathname + '#' + h.id); } catch (e) { /* link still works */ } });
      h.append(a);
    });
  });

  // 9 Press / to jump to search
  run(function slashSearch() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || /input|textarea|select/i.test((e.target.tagName || '')) || e.target.isContentEditable) return;
      var s = $('input[type=search]'); if (s) { e.preventDefault(); s.focus(); }
    });
  });

  // 10 Mark the current page in the menu; 26 name unlabeled controls
  run(function a11y() {
    $$('.navbar a[href]').forEach(function (a) { if (a.pathname === location.pathname && a.pathname !== '/' && !a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page'); });
    $$('button:not([aria-label]), a:not([aria-label])').forEach(function (el) {
      if (el.textContent.trim() || el.getAttribute('title')) return;
      var img = $('img[alt]', el), t = img && img.alt || (el.getAttribute('href') || '').replace(/^tel:|^mailto:/, '') || el.className.match(/(close|prev|next|top|menu)/i);
      if (t) el.setAttribute('aria-label', Array.isArray(t) ? t[0] : t);
    });
    // 21 Status messages are announced to screen readers
    $$('.form-status').forEach(function (s) { if (!s.hasAttribute('role')) { s.setAttribute('role', 'status'); s.setAttribute('aria-live', 'polite'); } });
  });

  // 25 External links are safe and announced
  run(function external() {
    $$('a[href^="http"]').forEach(function (a) {
      if (a.origin === location.origin) return;
      a.rel = (a.rel + ' noopener noreferrer').trim();
      if (!a.hasAttribute('aria-label') && a.textContent.trim()) a.setAttribute('aria-label', a.textContent.trim() + ' (opens another site)');
    });
  });

  // 22 Open or closed now, from the business hours (Mon-Fri 8am-6pm Central)
  run(function openNow() {
    var bar = $('.utility-bar .container'); if (!bar) return;
    var p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date());
    var d = p.find(function (x) { return x.type === 'weekday'; }).value, h = Number(p.find(function (x) { return x.type === 'hour'; }).value) % 24;
    var open = !/Sat|Sun/.test(d) && h >= 8 && h < 18;
    var b = document.createElement('span'); b.className = 'open-badge ' + (open ? 'is-open' : 'is-closed'); b.textContent = open ? 'Open now' : 'Closed. Book online anytime';
    bar.prepend(b);
  });

  // 23 Offline notice
  run(function offline() {
    var n;
    var show = function () { if (n) return; n = document.createElement('div'); n.className = 'offline-bar'; n.setAttribute('role', 'status'); n.textContent = 'You are offline. Forms will work again when you reconnect.'; document.body.prepend(n); };
    var hide = function () { if (n) { n.remove(); n = null; } };
    window.addEventListener('offline', show); window.addEventListener('online', hide);
    if (!navigator.onLine) show();
  });

  // 24 Count-up numbers when they scroll into view
  run(function countUp() {
    var els = $$('[data-count]'); if (!els.length || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return; io.unobserve(e.target);
        var end = Number(e.target.dataset.count), t0 = performance.now();
        (function step(t) { var k = Math.min((t - t0) / 1200, 1); e.target.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))).toLocaleString(); if (k < 1) requestAnimationFrame(step); })(t0);
      });
    });
    els.forEach(function (el) { io.observe(el); });
  });

  // Forms
  // 12 character counter, 19 autocomplete, 20 prefill from the URL
  run(function formBasics() {
    $$('textarea[maxlength]').forEach(function (t) {
      var c = document.createElement('div'); c.className = 'char-count small text-muted'; c.setAttribute('aria-hidden', 'true'); t.after(c);
      var upd = function () { c.textContent = t.value.length + ' / ' + t.maxLength; }; t.addEventListener('input', upd); upd();
    });
    var ac = { name: 'name', email: 'email', phone: 'tel', city: 'address-level2', zip: 'postal-code', address: 'street-address' };
    $$('form input[name], form textarea[name]').forEach(function (i) { var a = ac[i.name]; if (a && !i.autocomplete) i.autocomplete = a; });
    var q = new URLSearchParams(location.search), svc = q.get('service');
    if (svc) $$('select[name=interest], select[name=project]').forEach(function (s) { $$('option', s).forEach(function (o) { if (o.textContent.toLowerCase().indexOf(svc.toLowerCase()) > -1) s.value = o.value; }); });
  });

  // 13 busy submit button, 14 unsaved changes warning
  run(function submitState() {
    var dirty = false, sending = false;
    $$('form.lead-form, form[data-api]').forEach(function (f) {
      f.addEventListener('input', function () { dirty = true; }, { passive: true });
      f.addEventListener('submit', function () {
        var b = $('button[type=submit]', f); if (!b || !f.checkValidity()) return;
        sending = true; b.classList.add('is-busy'); b.setAttribute('aria-busy', 'true');
        setTimeout(function () { sending = false; b.classList.remove('is-busy'); b.removeAttribute('aria-busy'); }, 8000);
      });
    });
    window.addEventListener('beforeunload', function (e) { if (dirty && !sending && !$('.thank-you')) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('bbs:sent', function () { dirty = false; });
    window.addEventListener('pagehide', function () { dirty = false; });
  });

  // 15 caps lock, 16 show or hide password, 18 strength meter
  run(function passwords() {
    $$('input[type=password]').forEach(function (i) {
      var wrap = document.createElement('div'); wrap.className = 'pw-wrap'; i.parentNode.insertBefore(wrap, i); wrap.append(i);
      var t = document.createElement('button'); t.type = 'button'; t.className = 'pw-toggle'; t.textContent = 'Show'; t.setAttribute('aria-label', 'Show password'); t.setAttribute('aria-pressed', 'false');
      t.addEventListener('click', function () { var s = i.type === 'password'; i.type = s ? 'text' : 'password'; t.textContent = s ? 'Hide' : 'Show'; t.setAttribute('aria-label', s ? 'Hide password' : 'Show password'); t.setAttribute('aria-pressed', String(s)); });
      var caps = document.createElement('div'); caps.className = 'pw-hint text-warning-emphasis small'; caps.hidden = true; caps.textContent = 'Caps Lock is on.'; caps.setAttribute('role', 'status');
      wrap.append(t); wrap.after(caps);
      i.addEventListener('keyup', function (e) { caps.hidden = !(e.getModifierState && e.getModifierState('CapsLock')); });
      i.addEventListener('blur', function () { caps.hidden = true; });
      if (/new|password/.test(i.autocomplete || '') && i.autocomplete === 'new-password' || /new-password/.test(i.autocomplete)) {
        var m = document.createElement('div'); m.className = 'pw-meter'; m.setAttribute('aria-live', 'polite'); caps.after(m);
        i.addEventListener('input', function () {
          var v = i.value, s = (v.length >= 12) + (v.length >= 16) + /[a-z]/.test(v) * /[A-Z]/.test(v) + /\d/.test(v) + /[^A-Za-z0-9]/.test(v);
          var label = !v ? '' : s <= 1 ? 'Weak' : s <= 3 ? 'Fair' : 'Strong';
          m.dataset.level = label.toLowerCase(); m.textContent = label ? 'Password strength: ' + label : '';
        });
      }
    });
  });

  // 17 Suggest the right address for common email typos
  run(function emailTypos() {
    var fix = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gamil.com': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'icloud.con': 'icloud.com' };
    $$('input[type=email]').forEach(function (i) {
      var h = document.createElement('div'); h.className = 'small mt-1'; h.setAttribute('role', 'status'); i.after(h);
      i.addEventListener('blur', function () {
        var p = i.value.trim().split('@'), good = p.length === 2 && fix[p[1].toLowerCase()];
        h.textContent = ''; if (!good) return;
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-link btn-sm p-0'; b.textContent = p[0] + '@' + good;
        b.addEventListener('click', function () { i.value = p[0] + '@' + good; h.textContent = ''; });
        h.append('Did you mean ', b, '?');
      });
    });
  });
})();
