// Ievades validācija visiem API pieprasījumiem.
// Viss, kas nāk no lietotāja, tiek pārbaudīts šeit, pirms nonāk līdz skrāperim vai datiem.

const { MAKE_TABLE, BODY_TYPES } = require('./makes');

// slug → nosaukums (piem. 'bmw' → 'BMW'); skrāpēt var tikai šīs markas
const MAKES = Object.fromEntries(Object.entries(MAKE_TABLE).map(([k, v]) => [k, v.name]));
const SOURCE_KEYS = ['sslv', 'autoscout24', 'mobilede'];

const CURRENT_YEAR = new Date().getFullYear();

function toInt(value, { min, max, field }) {
  if (value === undefined || value === null || value === '') return { ok: true, value: undefined };
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return { ok: false, error: `${field}: jābūt veselam skaitlim` };
  const n = Number(str);
  if (n < min || n > max) return { ok: false, error: `${field}: jābūt robežās ${min}–${max}` };
  return { ok: true, value: n };
}

// POST /api/scrape  { make, pages }
function validateScrapeRequest(body) {
  const errors = [];
  const make = typeof body?.make === 'string' ? body.make.trim().toLowerCase() : '';
  if (!make) errors.push('make: obligāts lauks');
  else if (!MAKES[make]) errors.push('make: nezināma marka');

  const pages = toInt(body?.pages ?? 1, { min: 1, max: 5, field: 'pages' });
  if (!pages.ok) errors.push(pages.error);

  let sources = body?.sources ?? ['sslv'];
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > SOURCE_KEYS.length
      || !sources.every((s) => SOURCE_KEYS.includes(s))) {
    errors.push(`sources: atļauts ${SOURCE_KEYS.join(', ')}`);
  } else {
    sources = [...new Set(sources)];
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: { make, pages: pages.value, sources } };
}

// GET /api/listings?make=&model=&minYear=&maxYear=&maxPrice=&maxMileage=&sort=&limit=
function validateListingQuery(q = {}) {
  const errors = [];
  const out = {};

  if (q.make) {
    const make = String(q.make).trim().toLowerCase();
    if (!MAKES[make]) errors.push('make: nezināma marka');
    else out.make = make;
  }
  if (q.model) {
    const model = String(q.model).trim();
    if (model.length > 40 || !/^[\p{L}\p{N} .\-]+$/u.test(model)) errors.push('model: neatļauti simboli');
    else out.model = model;
  }

  if (q.source) {
    const source = String(q.source);
    if (!/^[a-z0-9.\-]{2,30}$/i.test(source)) errors.push('source: neatļauti simboli');
    else out.source = source;
  }
  if (q.fuel) {
    const fuels = ['dīzelis', 'benzīns', 'hibrīds', 'elektro', 'gāze'];
    if (!fuels.includes(q.fuel)) errors.push(`fuel: atļauts ${fuels.join(', ')}`);
    else out.fuel = q.fuel;
  }

  if (q.body) {
    if (!BODY_TYPES.includes(q.body)) errors.push(`body: atļauts ${BODY_TYPES.join(', ')}`);
    else out.body = q.body;
  }

  const numeric = [
    ['minPrice', 1, 10_000_000],
    ['minYear', 1950, CURRENT_YEAR + 1],
    ['maxYear', 1950, CURRENT_YEAR + 1],
    ['maxPrice', 1, 10_000_000],
    ['maxMileage', 0, 2_000_000],
    ['limit', 1, 500],
  ];
  for (const [field, min, max] of numeric) {
    const r = toInt(q[field], { min, max, field });
    if (!r.ok) errors.push(r.error);
    else if (r.value !== undefined) out[field] = r.value;
  }

  if (out.minYear && out.maxYear && out.minYear > out.maxYear) {
    errors.push('minYear nevar būt lielāks par maxYear');
  }
  if (out.minPrice && out.maxPrice && out.minPrice > out.maxPrice) {
    errors.push('minPrice nevar būt lielāka par maxPrice');
  }

  const sorts = ['deal', 'price', 'year', 'mileage', 'newest'];
  if (q.sort) {
    if (!sorts.includes(q.sort)) errors.push(`sort: atļauts ${sorts.join(', ')}`);
    else out.sort = q.sort;
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

module.exports = { MAKES, SOURCE_KEYS, validateScrapeRequest, validateListingQuery };
