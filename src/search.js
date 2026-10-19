// Sludinājumu meklēšana pēc filtriem. To izmanto gan /api/listings, gan AI asistents,
// tāpēc filtrēšanas loģika ir vienā vietā.

const db = require('./db');
const { scoreListings } = require('./deals');
const { MAKES } = require('./validate');
const { normalizeMake } = require('./makes');

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
  if (f.model) items = items.filter((l) => (l.model || '').toLowerCase().includes(f.model.toLowerCase()));
  if (f.source) items = items.filter((l) => l.source === f.source);
  if (f.fuel) items = items.filter((l) => l.fuel === f.fuel);
  if (f.minYear) items = items.filter((l) => l.year >= f.minYear);
  if (f.maxYear) items = items.filter((l) => l.year <= f.maxYear);
  if (f.maxPrice) items = items.filter((l) => l.price <= f.maxPrice);
  if (f.maxMileage) items = items.filter((l) => l.mileage != null && l.mileage <= f.maxMileage);

  items.sort(SORTERS[f.sort || 'deal']);
  return { total: items.length, items: items.slice(0, f.limit || 60) };
}

module.exports = { searchListings };
