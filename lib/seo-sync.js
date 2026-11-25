const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const WATCH = ['content.js', 'seo-content.js', 'site.json', 'gallery.json', 'build.js', 'lib/seo.js', 'assets'];

// Rebuilds the public site (pages, sitemap.xml, robots.txt, llms.txt) whenever source content changes,
// building into a scratch folder and swapping it in so visitors never see a half-written site.
function createSeoSync({ json, fail, currentUser, isAdmin, env = process.env, rootDir = root, spawnImpl = spawn, timeoutMs = 120000, outputLimit = 128 * 1024 }) {
  const dist = path.join(rootDir, 'dist'), next = path.join(rootDir, 'dist.next'), old = path.join(rootDir, 'dist.old');
  const statsFile = path.join(rootDir, 'data', 'seo-state-stats.json');
  const state = { running: false, queued: false, lastRun: null, lastReason: '', lastError: '', lastOutput: '' };
  let active = null;

  function append(output, chunk) {
    output.value = (output.value + String(chunk)).slice(-outputLimit);
  }

  function swap(output) {
    fs.rmSync(old, { recursive: true, force: true });
    let moved = false;
    if (fs.existsSync(dist)) { fs.renameSync(dist, old); moved = true; }
    try {
      fs.renameSync(next, dist);
    } catch (error) {
      if (moved && !fs.existsSync(dist) && fs.existsSync(old)) fs.renameSync(old, dist);
      append(output, `\nSwap failed: ${error.message}`);
      throw error;
    }
    try { fs.rmSync(old, { recursive: true, force: true }); } catch { /* the published build remains valid */ }
  }

  function execute(reason) {
    state.running = true; state.lastReason = reason;
    return new Promise(resolve => {
      const output = { value: '' };
      let child, settled = false, timer, hardTimer, timedOut = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(hardTimer);
        if (ok) {
          try { swap(output); } catch { ok = false; }
        }
        if (!ok) fs.rmSync(next, { recursive: true, force: true });
        state.running = false; state.queued = false; state.lastRun = new Date().toISOString();
        state.lastError = ok ? '' : output.value.trim().slice(-1200) || 'SEO build failed';
        state.lastOutput = ok ? output.value.trim().split('\n').at(-1) || 'Build completed' : '';
        resolve(ok);
      };
      try {
        child = spawnImpl(process.execPath, [path.join(rootDir, 'build.js')], { cwd: rootDir, env: { ...env, BUILD_OUT: next }, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) { append(output, error.message); finish(false); return; }
      child.stdout?.on('data', chunk => append(output, chunk));
      child.stderr?.on('data', chunk => append(output, chunk));
      child.once('error', error => { append(output, error.message); finish(false); });
      child.once('close', code => finish(!timedOut && code === 0));
      timer = setTimeout(() => {
        timedOut = true;
        append(output, `\nSEO build timed out after ${timeoutMs}ms`);
        child.kill('SIGTERM');
        hardTimer = setTimeout(() => { child.kill('SIGKILL'); finish(false); }, 5000);
        hardTimer.unref?.();
      }, timeoutMs);
      timer.unref?.();
    });
  }

  function run(reason, { queueIfRunning = false } = {}) {
    if (active) {
      if (queueIfRunning) state.queued = true;
      return active;
    }
    const work = execute(reason)
      .then(async ok => {
        if (state.queued) {
          state.queued = false;
          active = null;
          return run('queued change');
        }
        return ok;
      })
      .finally(() => { if (active === work) active = null; });
    active = work;
    return work;
  }

  function start() {
    if (env.SEO_AUTO === '0') return () => {};
    let timer = null;
    const trigger = file => { clearTimeout(timer); timer = setTimeout(() => run(`Content changed: ${file || 'source'}`, { queueIfRunning: true }).catch(() => {}), 2000); };
    const watchers = [];
    for (const rel of WATCH) {
      try { watchers.push(fs.watch(path.join(rootDir, rel), { recursive: true }, (_e, file) => trigger(file ? `${rel}/${file}` : rel))); } catch { /* path missing */ }
    }
    return () => { clearTimeout(timer); watchers.forEach(w => w.close()); };
  }

  function status() {
    let stats = null;
    try { stats = JSON.parse(fs.readFileSync(statsFile, 'utf8')); } catch { /* not generated yet */ }
    const files = ['sitemap.xml', 'robots.txt', 'llms.txt'].map(name => { try { const s = fs.statSync(path.join(dist, name)); return { name, bytes: s.size, updatedAt: s.mtime.toISOString() }; } catch { return { name, missing: true }; } });
    return { auto: env.SEO_AUTO !== '0', capability: { state: 'available', reason: '', retryable: true }, ...state, stats, files };
  }

  async function handle(req, res, pathname, method) {
    if (!pathname.startsWith('/api/admin/seo')) return false;
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Please sign in.'), true;
    if (!isAdmin(user)) return fail(res, 403, 'Admin access required.'), true;
    if (method === 'GET' && pathname === '/api/admin/seo') return json(res, 200, status()), true;
    if (method === 'POST' && pathname === '/api/admin/seo/regenerate') {
      const ok = await run(`Manual regenerate by ${user.email}`);
      return json(res, ok ? 200 : 500, status()), true;
    }
    return fail(res, 404, 'Not found.'), true;
  }

  return { handle, start, status, run };
}

module.exports = { createSeoSync };
