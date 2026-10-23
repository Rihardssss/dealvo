// Sludinājumu meklēšana pēc filtriem. To izmanto gan /api/listings, gan AI asistents,
// tāpēc filtrēšanas loģika ir vienā vietā.

const db = require('./db');
const { scoreListings } = require('./deals');
const { MAKES } = require('./validate');
const { MODEL_CATALOG, seriesOf } = require('./makes');

// Aizdomīgi lēti auto (>70% zem tirgus) "izdevīgāko" kārtojumā ir beigās, nevis augšā
const dealRank = (l) => (l.suspicious ? -Infinity : l.dealScore ?? -Infinity);
const SORTERS = {
  deal: (a, b) => dealRank(b) - dealRank(a),
  price: (a, b) => a.price - b.price,
  year: (a, b) => b.year - a.year,
  mileage: (a, b) => (a.mileage ?? Infinity) - (b.mileage ?? Infinity),
  newest: (a, b) => String(b.firstSeen).localeCompare(String(a.firstSeen)),
};

// Kešs: visi sludinājumi ar jau aprēķinātu tirgus cenu. Pārrēķina tikai tad, kad dati mainās
// (pēc skenēšanas, ~ik pēc 3 min), nevis katrā pieprasījumā. Meklēšana pa ~10 000 auto atmiņā aizņem dažas ms.
let cache = { version: -1, items: [], byKey: new Map(), stats: null };
const keyOfL = (l) => `${l.source}:${l.externalId}`;

function scoredAll() {
  const v = db.version();
  if (cache.version !== v) {
    const items = scoreListings(db.allLight());
    cache = { version: v, items, byKey: new Map(items.map((l) => [keyOfL(l), l])), stats: null };
  }
  return cache;
}

const lower = (x) => String(x ?? '').toLowerCase();

// Tie paši nosacījumi kā db.query, tikai atmiņā
function matches(l, f, makeName, since) {
  if (makeName && l.makeNorm !== makeName) return false;
  if (f.model) {
    const series = f.model.match(/^(\d)\. sērija$/);
    if (series) {
      if (!(new RegExp(`^${series[1]}\\d\\d$`).test(l.modelNorm || '') || l.modelNorm === f.model)) return false;
    } else if (lower(l.modelNorm) !== lower(f.model) && lower(l.model) !== lower(f.model)) return false;
  }
  if (f.body && l.body !== f.body) return false;
  if (f.fuel && l.fuel !== f.fuel) return false;
  if (f.source && l.source !== f.source) return false;
  if (f.minYear && !(l.year >= f.minYear)) return false;
  if (f.maxYear && !(l.year <= f.maxYear)) return false;
  if (f.minPrice && !(l.price >= f.minPrice)) return false;
  if (f.maxPrice && !(l.price <= f.maxPrice)) return false;
  if (f.maxMileage && !(l.mileage != null && l.mileage <= f.maxMileage)) return false;
  if (since && !(String(l.firstSeen) >= since)) return false;
  if (f.below && !(l.dealScore != null && l.dealScore >= 10 && !l.suspicious)) return false;
  if (f.noSuspicious && l.suspicious) return false;
  return true;
}

const strip = ({ details, detailsAt, dbId, makeNorm, modelNorm, ...l }) => l;

/**
 * Meklē sludinājumus pēc filtriem (no keša, ar jau aprēķinātu tirgus cenu).
 * @param {object} f validēti filtri (skat. validateListingQuery); asistents papildus padod noSuspicious
 * @returns {{total: number, items: object[]}}
 */
function searchListings(f = {}) {
  const makeName = f.make ? MAKES[f.make] : undefined;
  const since = f.sinceHours ? new Date(Date.now() - f.sinceHours * 3600_000).toISOString() : null;
  const items = scoredAll().items.filter((l) => matches(l, f, makeName, since));
  items.sort(SORTERS[f.sort || 'deal']);
  return { total: items.length, items: items.slice(0, f.limit || 60).map(strip) };
}

/** Kopējā statistika (arī kešota). */
function stats() {
  const c = scoredAll();
  if (!c.stats) {
    c.stats = {
      total: c.items.length,
      superDeals: c.items.filter((l) => l.dealLabel === 'super').length,
      goodDeals: c.items.filter((l) => l.dealLabel === 'labs').length,
      priceDrops: c.items.filter((l) => l.priceHistory?.length && l.price < l.priceHistory.at(-1).price).length,
    };
  }
  return c.stats;
}

/**
 * Modeļu saraksts markai: modeļi no datubāzes (ar skaitu) + populārie no kataloga.
 */
function modelsFor(makeSlug) {
  const name = MAKES[makeSlug];
  // Apvienojam vienādus modeļus ar dažādu rakstību ("golf" un "Golf")
  const counts = new Map();
  for (const r of db.modelCounts(name)) {
    const key = r.model.toLowerCase();
    const prev = counts.get(key);
    counts.set(key, { model: prev && prev.count >= r.n ? prev.model : r.model, count: (prev?.count || 0) + r.n });
  }
  // Ja datu vēl nav, rādām populārākos modeļus no kataloga
  if (!counts.size) for (const m of Object.keys(MODEL_CATALOG[name] || {})) counts.set(m.toLowerCase(), { model: m, count: 0 });
  // Alfabētiski, cipari pēc vērtības: 116, 118, 320, 520, X1, X5
  const sorted = [...counts.values()].sort((a, b) => a.model.localeCompare(b.model, 'lv', { numeric: true, sensitivity: 'base' }));
  // BMW: grupējam pa sērijām — vispirms "3. sērija" ar kopējo skaitu, zem tās 316, 318, 320...
  const out = [];
  for (const m of sorted) {
    const series = seriesOf(name, m.model);
    if (!series) { out.push(m); continue; }
    let head = out.find((x) => x.model === series);
    if (!head) { head = { model: series, count: 0, series: true }; out.push(head); }
    head.count += m.count;
    if (m.model !== series) out.push({ ...m, group: series }); // "3. sērija" bez konkrēta modeļa — tikai kopskaitā
  }
  // Mercedes klases kā ss.lv: "C" → "C klase"; "Citi" (ss.lv kategorija) — saraksta beigās
  const CLASSES = ['A', 'B', 'C', 'E', 'G', 'S', 'V', 'R', 'X', 'CL', 'GL', 'SL', 'T'];
  for (const m of out) {
    if (name === 'Mercedes' && CLASSES.includes(m.model)) m.label = `${m.model} klase`;
    if (/^cit(i|s)$/i.test(m.model)) m.label = 'Citi modeļi';
  }
  return [...out.filter((m) => m.label !== 'Citi modeļi'), ...out.filter((m) => m.label === 'Citi modeļi')];
}

/**
 * Konkrēti sludinājumi pēc atslēgām "avots:id", ar aprēķinātu tirgus cenu.
 * Atgriež tajā pašā secībā; nezināmās atslēgas izlaiž.
 */
function getScored(keys) {
  const { byKey } = scoredAll();
  return keys.map((k) => byKey.get(k)).filter(Boolean).map(strip);
}

module.exports = { searchListings, modelsFor, getScored, scoredAll, stats };
