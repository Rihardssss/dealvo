// Kopīga HTTP palīgfunkcija visiem skrāperiem.

// Serveriem bieži ir IPv6 adrese, bet daļa vietņu (piem. ss.lv) caur IPv6 neatbild,
// un tad fetch met "fetch failed". Tāpēc vispirms mēģinām IPv4.
require('node:dns').setDefaultResultOrder('ipv4first');

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

async function fetchHtml(url, source, extraHeaders = {}, attempt = 1) {
  let res;
  try {
    res = await rawFetch(url, extraHeaders);
  } catch (err) {
    // Tīkla kļūda (nevis vietnes atbilde): vienreiz mēģinām vēlreiz
    if (attempt < 2) { await sleep(1500); return fetchHtml(url, source, extraHeaders, attempt + 1); }
    const why = err.cause?.code || err.cause?.message || err.name;
    throw new Error(`${source}: neizdevās savienoties (${why})`);
  }
  if (res.status === 403 || res.status === 429) throw new BlockedError(source);
  if (!res.ok) throw new Error(`${source} atbildēja ar ${res.status}`);
  const html = await res.text();
  // Bot aizsardzības lapas parasti ir īsas un satur šos vārdus
  if (html.length < 20000 && BLOCK_MARKERS.test(html)) throw new BlockedError(source);
  return html;
}

// Daļa vietņu (ss.lv) bloķē datu centru IP adreses. Tādām vietnēm pieprasījums iet caur
// mūsu Cloudflare Worker (deploy/cloudflare-worker.js), ja .env ir SCRAPE_PROXY un SCRAPE_PROXY_KEY.
const PROXY_HOSTS = /^(www\.)?ss\.lv$/;
function viaProxy(url) {
  if (!process.env.SCRAPE_PROXY) return null;
  try {
    return PROXY_HOSTS.test(new URL(url).hostname) ? `${process.env.SCRAPE_PROXY.replace(/\/$/, '')}/?url=${encodeURIComponent(url)}` : null;
  } catch { return null; }
}

function rawFetch(url, extraHeaders) {
  const proxied = viaProxy(url);
  if (proxied) {
    return fetch(proxied, {
      headers: { 'x-key': process.env.SCRAPE_PROXY_KEY || '', 'x-ua': extraHeaders['User-Agent'] || USER_AGENT },
      signal: AbortSignal.timeout(25000),
    });
  }
  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'lv,en;q=0.9,de;q=0.8',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(20000),
  });
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
