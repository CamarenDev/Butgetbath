/* Error reporter. Sends every browser error to the server error log with the context needed to understand it.
   It never throws and never blocks the page: every step is wrapped, and reports are rate limited. */
(function () {
  'use strict';
  if (window.__bbsErrors) return;
  var sent = 0, MAX = 25, seen = {}, crumbs = [], ENDPOINT = '/api/client-error';
  var now = function () { return new Date().toISOString(); };
  var cut = function (v, n) { try { return String(v == null ? '' : v).slice(0, n); } catch (e) { return ''; } };
  function crumb(type, text) { try { crumbs.push(now().slice(11, 19) + ' ' + type + ': ' + cut(text, 120)); if (crumbs.length > 12) crumbs.shift(); } catch (e) { /* ignore */ } }

  function send(report) {
    try {
      var key = report.kind + '|' + report.message + '|' + (report.status || '');
      var t = Date.now();
      if (sent >= MAX || (seen[key] && t - seen[key] < 5000)) return;
      seen[key] = t; sent++;
      report.url = location.href.replace(/([?&#](?:token|code|key|password)=)[^&#]*/gi, '$1[hidden]');
      report.context = Object.assign({
        page: location.pathname, referrer: cut(document.referrer, 200), viewport: innerWidth + 'x' + innerHeight, online: navigator.onLine,
        language: navigator.language, secure: isSecureContext, readyState: document.readyState, trail: crumbs.slice()
      }, report.context || {});
      var body = JSON.stringify(report);
      var f = window.__bbsRawFetch || window.fetch;
      if (f) f.call(window, ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true, credentials: 'same-origin' }).catch(function () { /* the reporter must not fail loudly */ });
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('error', function (e) {
    try {
      var t = e.target;
      if (t && t !== window && (t.src || t.href)) {
        send({ kind: 'resource_failed', message: 'Failed to load ' + (t.tagName || 'resource').toLowerCase() + ': ' + cut(t.src || t.href, 300), context: { element: t.tagName } });
        return;
      }
      send({ kind: 'js_error', message: cut(e.message || 'Script error', 600), stack: e.error && e.error.stack, context: { file: cut(e.filename, 300), line: e.lineno, column: e.colno } });
    } catch (x) { /* ignore */ }
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    try {
      var r = e.reason;
      send({ kind: 'unhandled_rejection', message: cut(r && r.message ? r.message : r || 'Promise rejected', 600), stack: r && r.stack });
      e.preventDefault();
    } catch (x) { /* ignore */ }
  });

  document.addEventListener('securitypolicyviolation', function (e) {
    send({ kind: 'csp_violation', level: 'warn', message: 'Blocked by security policy: ' + e.violatedDirective + ' ' + cut(e.blockedURI, 200), context: { source: cut(e.sourceFile, 200), line: e.lineNumber } });
  });

  document.addEventListener('click', function (e) {
    try { var el = e.target && e.target.closest ? e.target.closest('a,button,input,select,summary,[role=button]') : null; if (el) crumb('click', el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' ' + (el.innerText || el.value || el.getAttribute('href') || '').trim()); } catch (x) { /* ignore */ }
  }, true);
  document.addEventListener('submit', function (e) { try { crumb('submit', (e.target.getAttribute('action') || e.target.getAttribute('data-api') || 'form')); } catch (x) { /* ignore */ } }, true);

  // Failed API calls: network errors and 5xx answers. Expected answers (validation, sign-in, not found) are not errors.
  if (window.fetch && !window.__bbsRawFetch) {
    var raw = window.fetch;
    window.__bbsRawFetch = raw;
    window.fetch = function (input, init) {
      var url = '', method = 'GET';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase(); } catch (x) { /* ignore */ }
      var path = url.split('?')[0];
      var mine = path.indexOf('/api/client-error') === 0 || path.indexOf('/api/track') === 0;
      if (!mine) crumb('fetch', method + ' ' + path);
      var p = raw.apply(this, arguments);
      if (mine) return p;
      return p.then(function (res) {
        try {
          if (res && res.status >= 500) {
            res.clone().text().then(function (txt) { send({ kind: 'api_error', message: method + ' ' + path + ' answered ' + res.status, status: res.status, method: method, context: { response: cut(txt, 500) } }); }, function () { send({ kind: 'api_error', message: method + ' ' + path + ' answered ' + res.status, status: res.status, method: method }); });
          }
        } catch (x) { /* ignore */ }
        return res;
      }, function (err) {
        try { if (!(err && err.name === 'AbortError')) send({ kind: 'network_error', message: method + ' ' + path + ' failed: ' + cut(err && err.message, 200), method: method, stack: err && err.stack }); } catch (x) { /* ignore */ }
        throw err;
      });
    };
  }

  window.__bbsErrors = { report: function (error, extra) { send({ kind: 'reported', message: cut(error && error.message ? error.message : error, 600), stack: error && error.stack, context: extra }); } };
  crumb('page', location.pathname);
})();
