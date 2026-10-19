// Kopīga HTTP palīgfunkcija visiem skrāperiem.

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

class BlockedError extends Error {
  constructor(source) {
    super(`${source} bloķē automātisku nolasīšanu (bot aizsardzība). Mēģini vēlāk vai izmanto citu avotu.`);
    this.name = 'BlockedError';
    this.blocked = true;
  }
}

const BLOCK_MARKERS = /captcha|zugriff verweigert|access denied|are you a robot|cf-chl|px-captcha|unusual traffic/i;

async function fetchHtml(url, source, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'lv,en;q=0.9,de;q=0.8',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 403 || res.status === 429) throw new BlockedError(source);
  if (!res.ok) throw new Error(`${source} atbildēja ar ${res.status}`);
  const html = await res.text();
  // Bot aizsardzības lapas parasti ir īsas un satur šos vārdus
  if (html.length < 20000 && BLOCK_MARKERS.test(html)) throw new BlockedError(source);
  return html;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "12.990 €" / "€ 12,990" / "12 990" → 12990
function digits(text) {
  const n = Number(String(text ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// "03/2015", "03-2015", "2015" → 2015
function yearFrom(text) {
  const m = String(text ?? '').match(/(19[5-9]\d|20\d\d)/);
  return m ? Number(m[1]) : null;
}

// Degvielas nosaukumi no dažādām valodām → latviski
function fuelLv(raw) {
  const t = String(raw ?? '').toLowerCase();
  if (!t) return null;
  if (/hybrid|hibr|elektro\/|electric\/|\/electric/.test(t)) return 'hibrīds';
  if (/^e$|electric|elektro/.test(t)) return 'elektro';
  if (/^d$|diesel|dīz/.test(t)) return 'dīzelis';
  if (/lpg|cng|gas\b|gāz|autogas/.test(t)) return 'gāze';
  if (/^b$|petrol|gasoline|benzin|benz/.test(t)) return 'benzīns';
  return null;
}

module.exports = { fetchHtml, sleep, digits, yearFrom, fuelLv, BlockedError, USER_AGENT };
