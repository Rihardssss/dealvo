// Deal algoritms — nosaka, cik sludinājums ir lētāks par tirgu.
//
// Katram auto atrodam "līdzīgos" (tā pati marka + modelis, gads ±2, nobraukums ±60 000 km,
// no VISIEM avotiem). Ja līdzīgo ir vismaz MIN_COMPARABLES, aprēķinām to cenu mediānu.
// dealScore = cik % auto ir lētāks par mediānu (pozitīvs = lētāk par tirgu).
// Mediāna, nevis vidējais — jo daži absurdi sludinājumi (1 € vai 999 999 €) to nesabojā.

const MIN_COMPARABLES = 3;
const YEAR_RANGE = 2;
const MILEAGE_RANGE = 60_000;

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const { normalizeMake, normalizeModel } = require('./makes');

const norm = (s) => String(s || '').trim().toLowerCase();
// Atslēga, pēc kuras auto uzskata par "to pašu modeli" arī starp dažādiem avotiem
const modelKey = (l) => `${norm(normalizeMake(l.make))}|${norm(normalizeModel(l.model))}`;

function isComparable(a, b) {
  if (a === b) return false;
  if (modelKey(a) !== modelKey(b)) return false;
  if (Math.abs(a.year - b.year) > YEAR_RANGE) return false;
  if (a.mileage != null && b.mileage != null && Math.abs(a.mileage - b.mileage) > MILEAGE_RANGE) return false;
  return true;
}

function labelFor(score) {
  if (score == null) return null;
  if (score >= 20) return 'super';
  if (score >= 10) return 'labs';
  if (score > -10) return 'tirgus';
  return 'dārgs';
}

/**
 * Pievieno katram sludinājumam marketPrice, dealScore, dealLabel, comparables.
 * Neizmaina oriģinālos objektus.
 */
function scoreListings(listings) {
  // Grupējam pēc marka+modelis, lai nesalīdzinātu katru ar katru (ātrāk)
  const groups = new Map();
  for (const l of listings) {
    const key = modelKey(l);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }

  return listings.map((l) => {
    const group = groups.get(modelKey(l)) || [];
    const comps = group.filter((o) => isComparable(l, o));
    if (comps.length < MIN_COMPARABLES) {
      return { ...l, marketPrice: null, dealScore: null, dealLabel: null, comparables: comps.length };
    }
    const prices = comps.map((c) => c.price);
    const marketPrice = Math.round(median(prices));
    const dealScore = Math.round(((marketPrice - l.price) / marketPrice) * 1000) / 10;
    return {
      ...l,
      marketPrice,
      dealScore,
      dealLabel: labelFor(dealScore),
      comparables: comps.length,
      // Līdzīgo auto cenu diapazons — frontendā zīmē "cenu skalu"
      rangeMin: Math.min(...prices, l.price),
      rangeMax: Math.max(...prices, l.price),
    };
  });
}

module.exports = { scoreListings, median, isComparable, labelFor, MIN_COMPARABLES };
