#!/usr/bin/env node
// Generates realistic reference photos for every tool and supply in the crew catalog and saves them
// into the tool photo library (same storage the admin upload uses).
// Usage: AI_API_KEY=... node scripts/generate-tool-images.js [--data-dir DIR] [--force] [--only key,key] [--concurrency 3]
// Optional env: AI_BASE_URL (default https://api.openai.com/v1), AI_IMAGE_MODEL (default gpt-image-1), AI_IMAGE_QUALITY (default medium).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../lib/db');
const { CATALOG } = require('../lib/tools');
const { keyOf } = require('../lib/tool-photos');

const arg = (name, fallback = '') => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };

function promptFor(tool) {
  const kind = tool.src === 'ppe' ? 'safety equipment' : tool.src === 'supply' ? 'job-site consumable supply' : 'professional contractor tool';
  return `Realistic product photograph of ${tool.name.toLowerCase()}, a ${kind} used in bathroom remodeling and tile installation. Single subject (or a neat set of the items named), centered, true-to-life materials, wear and proportions, soft studio lighting, natural shadow, plain light-gray seamless background, sharp focus, 1:1 square framing. No text, no logos, no brand names, no people, no watermark.`;
}

async function generate(tool, { base, key, model, quality }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt: promptFor(tool), size: '1024x1024', n: 1, quality, output_format: 'webp', output_compression: 82 }),
      signal: AbortSignal.timeout(180000)
    }).catch(error => ({ ok: false, status: 0, text: async () => error.message }));
    if (res.ok) {
      const item = (await res.json()).data?.[0];
      if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
      if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer());
    }
    if (res.status && res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise(r => setTimeout(r, 2000 * attempt));
  }
  throw new Error('image service unavailable after 3 attempts');
}

const isWebp = b => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
const isPng = b => b.length > 8 && b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
const isJpg = b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

async function main() {
  const key = process.env.AI_API_KEY;
  if (!key) { console.error('AI_API_KEY is required to generate images.'); process.exit(1); }
  const dataDir = path.resolve(arg('data-dir', process.env.DATA_DIR || path.join(__dirname, '..', 'data')));
  const cfg = { base: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''), key, model: process.env.AI_IMAGE_MODEL || 'gpt-image-1', quality: process.env.AI_IMAGE_QUALITY || 'medium' };
  const db = openDb(dataDir);
  const only = new Set(String(arg('only', '')).split(',').filter(Boolean));
  const force = arg('force', false) === true;
  const existing = new Set(db.prepare('SELECT key FROM tool_photos').all().map(r => r.key));
  const seen = new Set();
  const queue = CATALOG.filter(t => {
    const k = keyOf(t.name);
    if (seen.has(k) || (only.size && !only.has(k)) || (!force && existing.has(k))) return false;
    seen.add(k);
    return true;
  });
  console.log(`Generating ${queue.length} of ${CATALOG.length} tool images with ${cfg.model}...`);
  let done = 0, failed = 0;
  const worker = async () => {
    for (let tool; (tool = queue.shift());) {
      const k = keyOf(tool.name);
      try {
        const data = await generate(tool, cfg);
        const ext = isWebp(data) ? '.webp' : isPng(data) ? '.png' : isJpg(data) ? '.jpg' : null;
        if (!ext) throw new Error('unrecognized image format');
        const mime = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
        const file = `tool-${crypto.randomBytes(12).toString('hex')}${ext}`;
        fs.writeFileSync(path.join(dataDir, 'uploads', file), data, { mode: 0o600 });
        const old = db.prepare('SELECT file FROM tool_photos WHERE key = ?').get(k);
        db.prepare('INSERT INTO tool_photos (key, file, mime, credit, source_url, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET file = excluded.file, mime = excluded.mime, credit = excluded.credit, source_url = excluded.source_url, uploaded_by = excluded.uploaded_by, created_at = excluded.created_at')
          .run(k, file, mime, `AI-generated image (${cfg.model})`, '', 'image generator', new Date().toISOString());
        if (old) fs.rmSync(path.join(dataDir, 'uploads', old.file), { force: true });
        done++;
        console.log(`ok   ${k}`);
      } catch (error) {
        failed++;
        console.error(`fail ${k}: ${error.message}`);
      }
    }
  };
  const n = Math.max(1, Math.min(6, Number(arg('concurrency', 3)) || 3));
  await Promise.all(Array.from({ length: n }, worker));
  console.log(`Done: ${done} generated, ${failed} failed. Re-run to retry failures.`);
  process.exit(failed ? 1 : 0);
}

main();
