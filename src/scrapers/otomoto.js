// otomoto.pl skrāperis (Polijas lielākais auto portāls).
//
// otomoto ir Next.js lapa: sludinājumi ir JSON veidā <script id="__NEXT_DATA__">,
// pageProps.urqlState → advertSearch.edges[].node. Cenas lielākoties ir zlotos (PLN),
// tās pārrēķinām eiro pēc kursa PLN_EUR (noklusējumā 4,25 PLN = 1 €).

const { fetchHtml, sleep, digits, yearFrom, fuelLv } = require('./http');
const { normalizeMake } = require('../makes');

const BASE = 'https://www.otomoto.pl';
const DELAY_MS = 2000;
const PLN_PER_EUR = () => Number(process.env.PLN_EUR) || 4.25;

function searchFrom(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }
  const state = data?.props?.pageProps?.urqlState || {};
  for (const entry of Object.values(state)) {
    if (typeof entry?.data !== 'string' || !entry.data.includes('advertSearch')) continue;
    try { return JSON.parse(entry.data).advertSearch; } catch { /* nākamais */ }
  }
  return null;
}

function toEur(amount) {
  const value = Number(amount?.value ?? amount?.units);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (amount.currencyCode === 'EUR') return Math.round(value);
  if (amount.currencyCode === 'PLN') return Math.round(value / PLN_PER_EUR() / 10) * 10;
  return null; // citas valūtas izlaižam
}

// "Seria 3" + versija "330i xDrive" → "330"; bez versijas — "Seria 3" (makes.js to saprot kā 3. sēriju)
function modelFrom(p) {
  const model = p.model?.displayValue || null;
  const series = model && model.match(/^Seria (\d)$/i);
  if (series) {
    const v = String(p.version?.displayValue || '').match(/^M?(\d{3})[a-z]*\b/i);
    if (v && v[1][0] === series[1]) return v[1];
  }
  return model;
}

function parseListPage(html) {
  const search = searchFrom(html);
  if (!search?.edges) return [];
  return search.edges.map((e) => e.node).filter((n) => n?.id).map((n) => {
    const p = Object.fromEntries((n.parameters || []).map((x) => [x.key, x]));
    const img = n.thumbnail?.x2 || n.thumbnail?.x1 || null;
    const dealer = n.sellerLink?.name || null;
    return {
      source: 'otomoto',
      externalId: String(n.id),
      url: n.url,
      title: [n.title, n.shortDescription].filter(Boolean).join(' · ').slice(0, 200),
      make: normalizeMake(p.make?.displayValue),
      model: modelFrom(p),
      year: yearFrom(p.year?.value),
      engine: p.engine_capacity?.value ? `${(Number(p.engine_capacity.value) / 1000).toFixed(1)} l` : null,
      fuel: fuelLv(p.fuel_type?.value),
      body: null,
      gearbox: p.gearbox?.value === 'automatic' ? 'automāts' : p.gearbox?.value === 'manual' ? 'manuāla' : null,
      mileage: digits(p.mileage?.value),
      price: toEur(n.price?.amount),
      image: img,
      thumb: n.thumbnail?.x1 || img,
      country: 'PL',
      seller: {
        type: dealer ? 'dīleris' : 'privātpersona',
        name: dealer ? dealer.slice(0, 80) : null,
        city: n.location?.city?.name || null,
      },
    };
  }).filter((l) => l.price && l.year);
}

async function fetchMake(make, pages = 1) {
  const slug = make.oto ?? make.as24;
  if (!slug) return [];
  const all = [];
  for (let p = 1; p <= pages; p++) {
    // Jaunākie vispirms, lai katrā skenēšanā redzam svaigākos sludinājumus
    const url = `${BASE}/osobowe/${slug}?search%5Border%5D=created_at_first%3Adesc${p > 1 ? `&page=${p}` : ''}`;
    const items = parseListPage(await fetchHtml(url, 'otomoto', { 'Accept-Language': 'pl,en;q=0.8' }));
    if (!items.length) break;
    all.push(...items);
    if (p < pages) await sleep(DELAY_MS);
  }
  return all;
}

module.exports = { name: 'otomoto', label: 'otomoto.pl', fetchMake, parseListPage };
