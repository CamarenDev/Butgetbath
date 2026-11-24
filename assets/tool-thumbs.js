// Shared helper: small reference photos for tools on crew checklists (window.BBSTools).
(() => {
  let tools = null, pending = null;
  const key = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
  const load = () => pending || (pending = fetch('/api/tools/library').then(r => r.ok ? r.json() : { tools: [] }).then(d => { tools = new Map(d.tools.filter(t => t.photo).map(t => [t.key, t])); }).catch(() => { tools = new Map(); pending = null; }));
  const thumb = name => {
    const t = tools && tools.get(key(name));
    if (!t) return null;
    const src = `/api/tools/photo/${t.key}?v=${t.v}`;
    const a = document.createElement('a'), img = document.createElement('img');
    a.href = src; a.target = '_blank'; a.rel = 'noopener'; a.className = 'tool-thumb-link'; a.title = `What a ${name} looks like${t.credit ? ` (photo: ${t.credit})` : ''}`;
    img.src = src; img.alt = name; img.className = 'tool-thumb'; img.loading = 'lazy'; img.width = 48; img.height = 48;
    a.append(img);
    return a;
  };
  window.BBSTools = { key, load, thumb };
  load();
})();
