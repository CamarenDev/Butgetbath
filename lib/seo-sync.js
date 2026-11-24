const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const WATCH = ['content.js', 'seo-content.js', 'site.json', 'gallery.json', 'build.js', 'lib/seo.js', 'assets'];

// Rebuilds the public site (pages, sitemap.xml, robots.txt, llms.txt) whenever source content changes,
// building into a scratch folder and swapping it in so visitors never see a half-written site.
function createSeoSync({ json, fail, currentUser, isAdmin, env = process.env }) {
  const dist = path.join(root, 'dist'), next = path.join(root, 'dist.next'), old = path.join(root, 'dist.old');
  const statsFile = path.join(root, 'data', 'seo-state-stats.json');
  const state = { running: false, queued: false, lastRun: null, lastReason: '', lastError: '', lastOutput: '' };

  function run(reason) {
    if (state.running) { state.queued = true; return Promise.resolve(false); }
    state.running = true; state.lastReason = reason;
    return new Promise(resolve => {
      const child = spawn(process.execPath, [path.join(root, 'build.js')], { cwd: root, env: { ...env, BUILD_OUT: next }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', d => { output += d; });
      child.stderr.on('data', d => { output += d; });
      const finish = ok => {
        if (ok) {
          try { fs.rmSync(old, { recursive: true, force: true }); fs.renameSync(dist, old); fs.renameSync(next, dist); fs.rmSync(old, { recursive: true, force: true }); }
          catch (error) { ok = false; output += `\nSwap failed: ${error.message}`; if (!fs.existsSync(dist) && fs.existsSync(old)) fs.renameSync(old, dist); }
        } else fs.rmSync(next, { recursive: true, force: true });
        state.running = false; state.lastRun = new Date().toISOString(); state.lastError = ok ? '' : output.trim().slice(-600); state.lastOutput = ok ? output.trim().split('\n').pop() : '';
        if (state.queued) { state.queued = false; run('queued change').then(resolve); } else resolve(ok);
      };
      child.on('error', error => { output += error.message; finish(false); });
      child.on('close', code => finish(code === 0));
    });
  }

  function start() {
    if (env.SEO_AUTO === '0') return () => {};
    let timer = null;
    const trigger = file => { clearTimeout(timer); timer = setTimeout(() => run(`Content changed: ${file || 'source'}`).catch(() => {}), 2000); };
    const watchers = [];
    for (const rel of WATCH) {
      try { watchers.push(fs.watch(path.join(root, rel), { recursive: true }, (_e, file) => trigger(file ? `${rel}/${file}` : rel))); } catch { /* path missing */ }
    }
    return () => { clearTimeout(timer); watchers.forEach(w => w.close()); };
  }

  function status() {
    let stats = null;
    try { stats = JSON.parse(fs.readFileSync(statsFile, 'utf8')); } catch { /* not generated yet */ }
    const files = ['sitemap.xml', 'robots.txt', 'llms.txt'].map(name => { try { const s = fs.statSync(path.join(dist, name)); return { name, bytes: s.size, updatedAt: s.mtime.toISOString() }; } catch { return { name, missing: true }; } });
    return { auto: env.SEO_AUTO !== '0', ...state, stats, files };
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
