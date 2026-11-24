const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DISALLOW = ['/api/', '/admin/', '/account/', '/employee/', '/estimator/', '/thank-you/', '/handyman-application/test/', '/*?nc='];
const priorityFor = url => url === '/' ? '1.0' : /^\/(services|service-areas|contact|bathroom-remodel-cost)\/?/.test(url) ? '0.8' : '0.6';
// Build-date stamps (modified_time, dateModified) are stripped so only real content edits move lastmod.
const hashOf = html => crypto.createHash('sha256').update(html.replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, '')).digest('hex').slice(0, 16);

// pages: [{ url, html, noindex }]. lastmod only moves when a page's rendered HTML changes, tracked in statePath.
function generateSeoFiles({ site, pages, intro, keyPages, towns, statePath, today = new Date().toISOString().slice(0, 10) }) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* first run */ }
  const next = {};
  let changed = 0;
  const indexable = pages.filter(p => !p.noindex);
  for (const p of indexable) {
    const hash = hashOf(p.html || '');
    const prev = state[p.url];
    if (!prev || prev.hash !== hash) changed++;
    next[p.url] = { hash, lastmod: prev && prev.hash === hash ? prev.lastmod : today };
  }
  const removed = Object.keys(state).filter(u => !next[u]).length;
  const latest = Object.values(next).reduce((m, v) => v.lastmod > m ? v.lastmod : m, '');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${indexable.map(p => `<url><loc>${site.url}${p.url}</loc><lastmod>${next[p.url].lastmod}</lastmod><changefreq>${p.url === '/' ? 'weekly' : 'monthly'}</changefreq><priority>${priorityFor(p.url)}</priority>${p.url === '/' ? `<image:image><image:loc>${site.url}/og-image.png</image:loc></image:image>` : ''}</url>`).join('\n')}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\n${DISALLOW.map(d => `Disallow: ${d}`).join('\n')}\n\nSitemap: ${site.url}/sitemap.xml\n`;
  const llms = `# ${site.name}\n\n> ${intro}\n\n## Key pages\n${keyPages.map(u => `- ${site.url}${u}`).join('\n')}\n\n## Towns served\n${towns.map(t => `- ${t.name}, IL: ${site.url}${t.url}`).join('\n')}\n\n## All indexed pages\n${indexable.map(p => `- ${site.url}${p.url}`).join('\n')}\n`;

  const stats = { generatedAt: new Date().toISOString(), pages: indexable.length, changed, removed, lastmod: latest };
  return { files: { 'sitemap.xml': sitemap, 'robots.txt': robots, 'llms.txt': llms }, state: next, stats };
}

function saveSeoState(statePath, state, stats) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state));
  fs.writeFileSync(statePath.replace(/\.json$/, '-stats.json'), JSON.stringify(stats));
}

module.exports = { generateSeoFiles, saveSeoState };
