// Atļautās markas un to identifikatori katrā avotā.
// Skrāpēt var tikai šīs markas — lietotājs nevar likt serverim pieprasīt patvaļīgu URL.
//   sslv  — ss.lv URL daļa
//   as24  — AutoScout24 URL daļa
//   mobile — mobile.de iekšējais markas ID (null = šim avotam nezināms, tiek izlaists)

const MAKE_TABLE = {
  audi:       { name: 'Audi',       sslv: 'audi',       as24: 'audi',          mobile: 1900 },
  bmw:        { name: 'BMW',        sslv: 'bmw',        as24: 'bmw',           mobile: 3500 },
  citroen:    { name: 'Citroen',    sslv: 'citroen',    as24: 'citroen',       mobile: 5900 },
  ford:       { name: 'Ford',       sslv: 'ford',       as24: 'ford',          mobile: 9000 },
  honda:      { name: 'Honda',      sslv: 'honda',      as24: 'honda',         mobile: 11000 },
  hyundai:    { name: 'Hyundai',    sslv: 'hyundai',    as24: 'hyundai',       mobile: 11600 },
  kia:        { name: 'Kia',        sslv: 'kia',        as24: 'kia',           mobile: 13200 },
  lexus:      { name: 'Lexus',      sslv: 'lexus',      as24: 'lexus',         mobile: null },
  mazda:      { name: 'Mazda',      sslv: 'mazda',      as24: 'mazda',         mobile: 16800 },
  mercedes:   { name: 'Mercedes',   sslv: 'mercedes',   as24: 'mercedes-benz', mobile: 17200 },
  nissan:     { name: 'Nissan',     sslv: 'nissan',     as24: 'nissan',        mobile: 18700 },
  opel:       { name: 'Opel',       sslv: 'opel',       as24: 'opel',          mobile: 19000 },
  peugeot:    { name: 'Peugeot',    sslv: 'peugeot',    as24: 'peugeot',       mobile: 19300 },
  renault:    { name: 'Renault',    sslv: 'renault',    as24: 'renault',       mobile: 20700 },
  skoda:      { name: 'Skoda',      sslv: 'skoda',      as24: 'skoda',         mobile: 22900 },
  subaru:     { name: 'Subaru',     sslv: 'subaru',     as24: 'subaru',        mobile: null },
  toyota:     { name: 'Toyota',     sslv: 'toyota',     as24: 'toyota',        mobile: 24100 },
  volkswagen: { name: 'Volkswagen', sslv: 'volkswagen', as24: 'volkswagen',    mobile: 25200 },
  volvo:      { name: 'Volvo',      sslv: 'volvo',      as24: 'volvo',         mobile: 25100 },
};

// Dažādi avoti vienu marku sauc dažādi ("Mercedes-Benz" vs "Mercedes", "VW").
// Normalizējam, lai salīdzināšana strādātu starp avotiem.
const ALIASES = {
  'mercedes-benz': 'Mercedes', 'mercedes benz': 'Mercedes', mercedes: 'Mercedes',
  vw: 'Volkswagen', 'škoda': 'Skoda', 'citroën': 'Citroen',
};

function normalizeMake(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (ALIASES[t]) return ALIASES[t];
  const hit = Object.values(MAKE_TABLE).find((m) => m.name.toLowerCase() === t);
  return hit ? hit.name : String(raw || '').trim();
}

// Modeļu nosaukumi atšķiras ("320d" vs "320", "Golf VII" vs "Golf").
// Salīdzināšanai ņemam pirmo vārdu bez dzinēja burtiem.
function normalizeModel(raw) {
  const first = String(raw || '').trim().split(/[\s/]+/)[0] || '';
  // "320d" / "520i" / "118d" → "320" / "520" / "118"; "A4" un "X5" paliek
  return /^\d{3}[a-z]{1,2}$/i.test(first) ? first.replace(/[a-z]+$/i, '') : first;
}

module.exports = { MAKE_TABLE, normalizeMake, normalizeModel };
