// Sludinājumu meklēšana pēc filtriem. To izmanto gan /api/listings, gan AI asistents,
// tāpēc filtrēšanas loģika ir vienā vietā.

const db = require('./db');
const { scoreListings } = require('./deals');
const { MAKES } = require('./validate');
const { normalizeMake, normalizeModel, MODEL_CATALOG, seriesOf } = require('./makes');

const SORTERS = {
  deal: (a, b) => (b.dealScore ?? -Infinity) - (a.dealScore ?? -Infinity),
  price: (a, b) => a.price - b.price,
  year: (a, b) => b.year - a.year,
  mileage: (a, b) => (a.mileage ?? Infinity) - (b.mileage ?? Infinity),
  newest: (a, b) => String(b.firstSeen).localeCompare(String(a.firstSeen)),
};

/**
 * Meklē sludinājumus. Filtrēšanu dara SQL vaicājums (db.query), tad katram atrastajam
 * auto aprēķina tirgus cenu no līdzīgiem auto tajā pašā marka+modelis grupā.
 * @param {object} f validēti filtri (skat. validateListingQuery)
 * @returns {{total: number, items: object[]}}
 */
function searchListings(f = {}) {
  const rows = db.query({ ...f, makeName: f.make ? MAKES[f.make] : undefined });

  // Tirgus cenai vajag arī tos līdzīgos auto, kurus filtrs izslēdza (piem. dārgākos)
  const pairs = [...new Map(rows.map((l) => {
    const make = normalizeMake(l.make);
    const model = normalizeModel(l.model, l.make) || null;
    return [`${make}|${model}`, [make, model]];
  })).values()];
  const scored = new Map(scoreListings(db.byModels(pairs)).map((l) => [`${l.source}:${l.externalId}`, l]));
  let items = rows.map((l) => scored.get(`${l.source}:${l.externalId}`) || l);
  if (f.below) items = items.filter((l) => l.dealScore != null && l.dealScore >= 10);

  items.sort(SORTERS[f.sort || 'deal']);
  // Pilnās detaļas sarakstā nesūtām (tās ir /api/listing)
  return { total: items.length, items: items.slice(0, f.limit || 60).map(({ details, detailsAt, dbId, ...l }) => l) };
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
  const rows = keys.map((k) => {
    const i = k.indexOf(':');
    return i > 0 ? db.find(k.slice(0, i), k.slice(i + 1)) : null;
  }).filter(Boolean);
  const pairs = [...new Map(rows.map((l) => {
    const make = normalizeMake(l.make);
    const model = normalizeModel(l.model, l.make) || null;
    return [`${make}|${model}`, [make, model]];
  })).values()];
  const scored = new Map(scoreListings(db.byModels(pairs)).map((l) => [`${l.source}:${l.externalId}`, l]));
  return rows.map((l) => scored.get(`${l.source}:${l.externalId}`) || l)
    .map(({ details, detailsAt, dbId, ...l }) => l);
}

module.exports = { searchListings, modelsFor, getScored };
