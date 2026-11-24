'use strict';
// Photo estimating. Sends bathroom photos to a vision-capable AI model (OpenAI-compatible chat API) and turns what it
// sees into estimator inputs. Photos are only sent when staff confirms the customer agreed, and they are never stored.
// Configure with AI_API_KEY (required), AI_MODEL and AI_BASE_URL (optional).

const IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGES = 4, MAX_BYTES = 6 * 1024 * 1024;

const ENUMS = {
  bathType: ['full', 'master', 'hall', 'half', 'powder'], shower: ['none', 'tub_surround', 'walk_in'], showerStyle: ['tile', 'prefab'],
  flooring: ['tile', 'lvp', 'vinyl', 'none'], condition: ['good', 'fair', 'poor'], level: ['basement', 'first', 'upper'],
  glassType: ['none', 'curtain', 'slider', 'frameless', 'panel'], vanityType: ['single', 'double'], toiletMode: ['replace', 'rebuild', 'keep'],
  tilePattern: ['standard', 'diagonal', 'herringbone']
};
const NUMBERS = { length: [3, 30], width: [3, 30], ceilingHeight: [7, 14], homeYear: [1800, 2100], vanities: [0, 4], windowCount: [0, 4] };
const FLAGS = ['demo', 'bench', 'niche', 'heatedFloor', 'newTub', 'drywall', 'fan', 'lighting', 'paint', 'plumbingChanges'];

const PROMPT = `You are a senior bathroom remodeling estimator looking at photos of a customer's existing bathroom.
Return only JSON with these keys:
- "inputs": object using only these keys (omit anything you cannot judge): ${Object.entries(ENUMS).map(([k, v]) => `${k} (${v.join('|')})`).join('; ')}; numbers ${Object.entries(NUMBERS).map(([k, [lo, hi]]) => `${k} (${lo}-${hi})`).join(', ')}; booleans ${FLAGS.join(', ')}.
- "observations": array of short strings describing what you see that affects price (fixtures, tile, damage, mold, water stains, tub type, ventilation, lighting, ceiling, window, access).
- "risks": array of short strings about hidden conditions to confirm on site (rot, leaks, old wiring, drain location, lead or asbestos era finishes).
- "assumptions": array of short strings naming every dimension or choice you estimated rather than saw.
- "confidence": number 0 to 1.
Estimate room size from standard fixture dimensions (tub 60 in long, toilet about 28 in deep, vanity 30 to 36 in high, door 80 in high). Do not invent a home year unless finishes clearly date it. Never include personal information about people in the photos.`;

const text = (v, max = 220) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const list = (v, n = 8) => (Array.isArray(v) ? v : []).map(x => text(x)).filter(Boolean).slice(0, n);

// Only known keys with valid values leave this function, whatever the model returned.
function sanitize(raw) {
  const source = raw && typeof raw === 'object' && raw.inputs && typeof raw.inputs === 'object' ? raw.inputs : {};
  const inputs = {};
  for (const [k, allowed] of Object.entries(ENUMS)) if (allowed.includes(source[k])) inputs[k] = source[k];
  for (const [k, [lo, hi]] of Object.entries(NUMBERS)) { const n = Number(source[k]); if (source[k] !== null && source[k] !== '' && Number.isFinite(n) && n >= lo && n <= hi) inputs[k] = n; }
  for (const k of FLAGS) if (typeof source[k] === 'boolean') inputs[k] = source[k];
  const confidence = Number(raw?.confidence);
  return { inputs, observations: list(raw?.observations), risks: list(raw?.risks), assumptions: list(raw?.assumptions), confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0 };
}

function validImages(images) {
  if (!Array.isArray(images) || !images.length || images.length > MAX_IMAGES) return false;
  let bytes = 0;
  for (const image of images) { if (typeof image !== 'string' || !IMAGE.test(image)) return false; bytes += image.length * 0.75; }
  return bytes <= MAX_BYTES;
}

async function analyze({ images, notes = '', env = process.env, fetchImpl = (...a) => fetch(...a) }) {
  if (!env.AI_API_KEY) return { status: 503, error: 'AI photo estimating is not set up yet. Add AI_API_KEY on the server.' };
  if (!validImages(images)) return { status: 400, error: `Add 1 to ${MAX_IMAGES} JPEG, PNG or WebP photos, up to 6 MB in total.` };
  const base = String(env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  let response;
  try {
    response = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL || 'gpt-4.1', response_format: { type: 'json_object' }, temperature: 0.2,
        messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: [{ type: 'text', text: `Staff notes: ${text(notes, 500) || 'none'}` }, ...images.map(url => ({ type: 'image_url', image_url: { url, detail: 'high' } }))] }]
      }),
      signal: AbortSignal.timeout(60000)
    });
  } catch { return { status: 502, error: 'The AI service did not respond. Try again in a moment.' }; }
  if (!response.ok) return { status: 502, error: 'The AI service could not read these photos. Try clearer photos.' };
  let parsed;
  try { parsed = JSON.parse((await response.json())?.choices?.[0]?.message?.content || ''); } catch { return { status: 502, error: 'The AI answer could not be understood. Try again.' }; }
  return { status: 200, result: sanitize(parsed) };
}

module.exports = { analyze, sanitize, validImages };
