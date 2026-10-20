// Tulkošana: lapas teksts un sludinājumu apraksti (piem. vācu AutoScout24 apraksts → latviski).
//
// Izmanto Google Translate publisko galapunktu (bez atslēgas). Ja tas nav pieejams un ir
// ANTHROPIC_API_KEY, tulko Claude. Rezultāti tiek kešoti atmiņā, lai tas pats teksts
// netiktu tulkots atkārtoti.

const LANGS = ['lv', 'en', 'ru', 'de', 'lt', 'et'];
const MAX_TEXTS = 80;
const MAX_CHARS = 12000;
const cache = new Map(); // "lv|teksts" → tulkojums
const CACHE_MAX = 20000;

function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

async function google(text, to) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google Translate ${res.status}`);
  const data = await res.json();
  return (data?.[0] || []).map((part) => part?.[0] ?? '').join('');
}

async function claude(text, to) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 4000,
      system: `Translate the user's text into the language with code "${to}". Keep line breaks exactly. Output only the translation.`,
      messages: [{ role: 'user', content: text }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  return data.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

async function translateOne(text, to) {
  try {
    return await google(text, to);
  } catch (err) {
    if (process.env.ANTHROPIC_API_KEY) return claude(text, to);
    throw err;
  }
}

/**
 * Iztulko teksta masīvu. Īsos tekstus (lapas uzrakstus) sūta vienā pieprasījumā, atdalītus
 * ar jaunu rindu; ja rindu skaits nesakrīt, tulko katru atsevišķi.
 */
async function translateTexts(texts, to) {
  const out = texts.map((t) => cache.get(`${to}|${t}`));
  const todo = [...new Set(texts.filter((t, i) => out[i] === undefined))];

  const single = todo.filter((t) => t.includes('\n') || t.length > 400);
  const batchable = todo.filter((t) => !single.includes(t));

  const done = new Map();
  for (let i = 0; i < batchable.length;) {
    const chunk = [];
    let len = 0;
    while (i < batchable.length && len + batchable[i].length < 3500) { len += batchable[i].length + 1; chunk.push(batchable[i++]); }
    if (!chunk.length) chunk.push(batchable[i++]);
    const joined = await translateOne(chunk.join('\n'), to);
    const lines = joined.split('\n');
    if (lines.length === chunk.length) chunk.forEach((t, j) => done.set(t, lines[j].trim()));
    else single.push(...chunk);
  }
  // Atsevišķi (pa 4 paralēli)
  for (let i = 0; i < single.length; i += 4) {
    const part = single.slice(i, i + 4);
    const res = await Promise.all(part.map((t) => translateOne(t, to)));
    part.forEach((t, j) => done.set(t, res[j]));
  }
  for (const [t, v] of done) remember(`${to}|${t}`, v);
  return texts.map((t, i) => out[i] ?? done.get(t) ?? t);
}

function validateTranslate(body) {
  const to = String(body?.to || '');
  if (!LANGS.includes(to)) return { ok: false, errors: [`to: atļauts ${LANGS.join(', ')}`] };
  const texts = body?.texts;
  if (!Array.isArray(texts) || !texts.length || texts.length > MAX_TEXTS || !texts.every((t) => typeof t === 'string')) {
    return { ok: false, errors: [`texts: 1–${MAX_TEXTS} teksti`] };
  }
  if (texts.reduce((n, t) => n + t.length, 0) > MAX_CHARS) return { ok: false, errors: ['Teksts ir par garu'] };
  return { ok: true, value: { to, texts: texts.map((t) => t.trim()) } };
}

module.exports = { translateTexts, validateTranslate, LANGS, _cache: cache };
