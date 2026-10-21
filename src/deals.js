// Deal algoritms — nosaka, cik sludinājums ir lētāks par tirgu.
//
// Katram auto atrodam "līdzīgos" (tā pati marka + modelis, gads ±2, nobraukums ±60 000 km,
// no VISIEM avotiem). Ja līdzīgo ir vismaz MIN_COMPARABLES, aprēķinām to cenu mediānu.
// dealScore = cik % auto ir lētāks par mediānu (pozitīvs = lētāk par tirgu).
// Mediāna, nevis vidējais — jo daži absurdi sludinājumi (1 € vai 999 999 €) to nesabojā.

const MIN_COMPARABLES = 3;
const YEAR_RANGE = 2;
const MILEAGE_RANGE = 60_000;
// Ja līdzīgo ir par maz, meklējam plašāk. Plašākajos līmeņos citu gadu auto cenu pielāgojam
// pēc vecuma (auto zaudē ap 8% vērtības gadā), lai 2010. un 2014. gada auto būtu salīdzināmi.
const LEVELS = [
  { years: YEAR_RANGE, km: MILEAGE_RANGE, adjust: false },
  { years: 3, km: 90_000, adjust: true },
  { years: 5, km: 150_000, adjust: true },
];
const YEARLY_LOSS = 0.08;

// Bojāti auto, auto rezerves daļām, eksportam utt. — to cena nav salīdzināma ar normālu auto.
// Tos neizmantojam tirgus cenas aprēķinā un neliekam "izdevīgāko" augšgalā.
const DAMAGED_RE = /rezerves\s*daļ|uz\s*(?:daļām|detaļām)|(?<!nav\s)bojāts|pēc\s*avārijas|nav\s*tehnisk|nebrauc|motora\s*defekt|ātrumkārbas\s*defekt|zerleg|\bteile\b|ersatzteil|motorschaden|getriebeschaden|unfallwagen|(?<!ohne\s|keine\s)mängel|bastler|for\s*parts|not\s*running|запчаст|на\s*разбор|битая/i;
const isDamaged = (l) => DAMAGED_RE.test(`${l.title || ''} ${l.details?.description || ''}`.slice(0, 600));

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const { normalizeMake, normalizeModel } = require('./makes');

const norm = (s) => String(s || '').trim().toLowerCase();
// Atslēga, pēc kuras auto uzskata par "to pašu modeli" arī starp dažādiem avotiem
const modelKey = (l) => `${norm(normalizeMake(l.make))}|${norm(normalizeModel(l.model, l.make))}`;

function isComparable(a, b, level = LEVELS[0]) {
  if (a === b) return false;
  if (a.source === b.source && a.externalId === b.externalId) return false;
  if (modelKey(a) !== modelKey(b)) return false;
  if (Math.abs(a.year - b.year) > level.years) return false;
  if (a.mileage != null && b.mileage != null && Math.abs(a.mileage - b.mileage) > level.km) return false;
  return true;
}

// Līdzīgā auto cena, pārrēķināta uz šī auto gadu
const adjusted = (l, c, level) => (level.adjust ? c.price * (1 - YEARLY_LOSS) ** (c.year - l.year) : c.price);

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
    if (isDamaged(l)) continue;
    const key = modelKey(l);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }

  return listings.map((l) => {
    if (isDamaged(l)) return { ...l, marketPrice: null, dealScore: null, dealLabel: null, comparables: 0, damaged: true };
    const group = groups.get(modelKey(l)) || [];
    let comps = [];
    let level = LEVELS[0];
    for (const lv of LEVELS) {
      comps = group.filter((o) => isComparable(l, o, lv));
      level = lv;
      if (comps.length >= MIN_COMPARABLES) break;
    }
    if (comps.length < MIN_COMPARABLES) {
      return { ...l, marketPrice: null, dealScore: null, dealLabel: null, comparables: comps.length };
    }
    const prices = comps.map((c) => Math.round(adjusted(l, c, level)));
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

module.exports = { scoreListings, median, isComparable, labelFor, isDamaged, MIN_COMPARABLES };
