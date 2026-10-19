// Ievades validācija visiem API pieprasījumiem.
// Viss, kas nāk no lietotāja, tiek pārbaudīts šeit, pirms nonāk līdz skrāperim vai datiem.

// Atļautās markas (ss.lv URL "slug" formātā). Ārpus šī saraksta neko neskrāpējam,
// tāpēc lietotājs nevar likt serverim pieprasīt patvaļīgus URL.
const MAKES = {
  'audi': 'Audi',
  'bmw': 'BMW',
  'citroen': 'Citroen',
  'ford': 'Ford',
  'honda': 'Honda',
  'hyundai': 'Hyundai',
  'kia': 'Kia',
  'lexus': 'Lexus',
  'mazda': 'Mazda',
  'mercedes': 'Mercedes',
  'nissan': 'Nissan',
  'opel': 'Opel',
  'peugeot': 'Peugeot',
  'renault': 'Renault',
  'skoda': 'Skoda',
  'subaru': 'Subaru',
  'toyota': 'Toyota',
  'volkswagen': 'Volkswagen',
  'volvo': 'Volvo',
};

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

  return errors.length ? { ok: false, errors } : { ok: true, value: { make, pages: pages.value } };
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

  const numeric = [
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

  const sorts = ['deal', 'price', 'year', 'mileage', 'newest'];
  if (q.sort) {
    if (!sorts.includes(q.sort)) errors.push(`sort: atļauts ${sorts.join(', ')}`);
    else out.sort = q.sort;
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

module.exports = { MAKES, validateScrapeRequest, validateListingQuery };
