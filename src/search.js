// Sludinājumu meklēšana pēc filtriem. To izmanto gan /api/listings, gan AI asistents,
// tāpēc filtrēšanas loģika ir vienā vietā.

const db = require('./db');
const { scoreListings } = require('./deals');
const { MAKES } = require('./validate');
const { normalizeMake, normalizeModel, MODEL_CATALOG } = require('./makes');

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
  const items = rows.map((l) => scored.get(`${l.source}:${l.externalId}`) || l);

  items.sort(SORTERS[f.sort || 'deal']);
  // Pilnās detaļas sarakstā nesūtām (tās ir /api/listing)
  return { total: items.length, items: items.slice(0, f.limit || 60).map(({ details, detailsAt, dbId, ...l }) => l) };
}

/**
 * Modeļu saraksts markai: modeļi no datubāzes (ar skaitu) + populārie no kataloga.
 */
function modelsFor(makeSlug) {
  const name = MAKES[makeSlug];
  const counts = new Map(db.modelCounts(name).map((r) => [r.model, r.n]));
  for (const m of Object.keys(MODEL_CATALOG[name] || {})) if (!counts.has(m)) counts.set(m, 0);
  return [...counts.entries()]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model, 'lv', { numeric: true }));
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
