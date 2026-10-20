// ss.lv skrāperis — nolasa vieglo auto sludinājumu sarakstu no ss.lv.
// Parsēšana (parseListPage) ir atdalīta no lejupielādes (fetchMake),
// lai to varētu testēt ar saglabātu HTML failu bez interneta.

const cheerio = require('cheerio');
const { fetchHtml } = require('./http');

const BASE = 'https://www.ss.lv';
const USER_AGENT = 'Mozilla/5.0 (Dealvo skolas projekts; +https://github.com/Rihardssss)';
const DELAY_MS = 1500; // pauze starp lapām, lai nenoslogotu serveri

// "12,300  €" -> 12300 ; "maiņai" / "pērku" -> null
function parsePrice(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!t.includes('€')) return null;
  if (/maiņ|pērk|īrē|dienā|mēn/.test(t)) return null;
  const digits = t.replace(/[^\d]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// "215 tūkst." -> 215000 ; "-" -> null
function parseMileage(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const m = t.match(/([\d\s]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, ''));
  if (!Number.isFinite(n)) return null;
  return t.includes('tūkst') ? n * 1000 : n;
}

function parseYear(text) {
  const m = String(text || '').match(/\b(19[5-9]\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}

// Engine kolonna: "2.0D" -> {engine: 2.0, fuel: 'dīzelis'}; "1.6" -> benzīns; "E" -> elektro
function parseEngine(text) {
  const t = String(text || '').trim();
  if (/^e$/i.test(t)) return { engine: null, fuel: 'elektro' };
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*([DHGd]?)/);
  if (!m) return { engine: null, fuel: null };
  const engine = Number(m[1].replace(',', '.'));
  const suffix = m[2].toUpperCase();
  const fuel = suffix === 'D' ? 'dīzelis' : suffix === 'H' ? 'hibrīds' : suffix === 'G' ? 'gāze' : 'benzīns';
  return { engine, fuel };
}

/**
 * Parsē vienu ss.lv saraksta lapu.
 * @param {string} html  lapas HTML
 * @param {string} makeName  marka (piem. "BMW"), jo saraksta rindās marka nav atsevišķi norādīta
 * @returns {Array<object>} sludinājumi
 */
function parseListPage(html, makeName) {
  const $ = cheerio.load(html);
  const results = [];

  $('tr[id^="tr_"]').each((_, row) => {
    const $row = $(row);
    const id = ($row.attr('id') || '').replace('tr_', '');
    if (!/^\d+$/.test(id)) return; // reklāmas rindas u.c.

    const link = $row.find('a.am').first();
    const href = link.attr('href');
    if (!href) return;

    // Datu kolonnas: modelis, gads, motors, nobraukums, cena (pēdējās 5 šūnas)
    const cells = $row.find('td').toArray().map((td) => $(td).text().replace(/\s+/g, ' ').trim());
    if (cells.length < 5) return;
    const [model, yearT, engineT, mileageT, priceT] = cells.slice(-5);

    const price = parsePrice(priceT);
    const year = parseYear(yearT);
    if (!price || !year) return; // bez cenas vai gada sludinājums nav salīdzināms

    const { engine, fuel } = parseEngine(engineT);
    const img = $row.find('img').first().attr('src') || null;

    results.push({
      source: 'ss.lv',
      externalId: id,
      url: href.startsWith('http') ? href : BASE + href,
      title: link.text().replace(/\s+/g, ' ').trim().slice(0, 200),
      make: makeName,
      model: model || null,
      year,
      engine,
      fuel,
      mileage: parseMileage(mileageT),
      price,
      // ss.lv sarakstā ir mazs sīktēls (.th2.jpg); tā pati bilde lielā izmērā ir .800.jpg
      image: img && img.startsWith('http') ? img.replace(/\.th2\.jpg$/, '.800.jpg') : null,
      thumb: img && img.startsWith('http') ? img : null,
      country: 'LV',
    });
  });

  return results;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kopīgā fetchHtml: IPv4, atkārtots mēģinājums un skaidrs kļūdas iemesls
const fetchPage = (url) => fetchHtml(url, 'ss.lv', { 'User-Agent': USER_AGENT, 'Accept-Language': 'lv,en;q=0.8' });

/**
 * Lejupielādē un parsē vienas markas pirmās N lapas.
 * @param {string} slug  piem. "bmw"
 * @param {string} makeName  piem. "BMW"
 * @param {number} pages  1–5
 */
async function fetchMake(slug, makeName, pages = 1) {
  const all = [];
  for (let p = 1; p <= pages; p++) {
    const url = p === 1
      ? `${BASE}/lv/transport/cars/${slug}/sell/`
      : `${BASE}/lv/transport/cars/${slug}/sell/page${p}.html`;
    const html = await fetchPage(url);
    const items = parseListPage(html, makeName);
    if (items.length === 0) break; // vairāk lapu nav
    all.push(...items);
    if (p < pages) await sleep(DELAY_MS);
  }
  return all;
}

module.exports = { name: 'ss.lv', fetchMake, parseListPage, parsePrice, parseMileage, parseYear, parseEngine };
