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
 * @param {object} f validēti filtri (skat. validateListingQuery)
 * @returns {{total: number, items: object[]}}
 */
function searchListings(f = {}) {
  let items = scoreListings(db.all());
  if (f.make) {
    const name = MAKES[f.make].toLowerCase();
    items = items.filter((l) => normalizeMake(l.make).toLowerCase() === name);
  }
  if (f.model) {
    // Salīdzinām normalizētus nosaukumus: "320d" = "320", "C220" = "C"
    const want = f.model.toLowerCase();
    items = items.filter((l) => normalizeModel(l.model, l.make).toLowerCase() === want
      || (l.model || '').toLowerCase() === want);
  }
  if (f.body) items = items.filter((l) => l.body === f.body);
  if (f.minPrice) items = items.filter((l) => l.price >= f.minPrice);
  if (f.source) items = items.filter((l) => l.source === f.source);
  if (f.fuel) items = items.filter((l) => l.fuel === f.fuel);
  if (f.minYear) items = items.filter((l) => l.year >= f.minYear);
  if (f.maxYear) items = items.filter((l) => l.year <= f.maxYear);
  if (f.maxPrice) items = items.filter((l) => l.price <= f.maxPrice);
  if (f.maxMileage) items = items.filter((l) => l.mileage != null && l.mileage <= f.maxMileage);

  items.sort(SORTERS[f.sort || 'deal']);
  return { total: items.length, items: items.slice(0, f.limit || 60) };
}

/**
 * Modeļu saraksts markai: modeļi no datubāzes (ar skaitu) + populārie no kataloga.
 */
function modelsFor(makeSlug) {
  const name = MAKES[makeSlug];
  const counts = new Map();
  for (const l of db.all()) {
    if (normalizeMake(l.make) !== name) continue;
    const m = normalizeModel(l.model, l.make);
    if (m) counts.set(m, (counts.get(m) || 0) + 1);
  }
  for (const m of Object.keys(MODEL_CATALOG[name] || {})) if (!counts.has(m)) counts.set(m, 0);
  return [...counts.entries()]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model, 'lv', { numeric: true }));
}

module.exports = { searchListings, modelsFor };
