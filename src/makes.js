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

// Modeļu nosaukumi atšķiras ("320d" vs "320", "Golf VII" vs "Golf", "C220" vs "C").
// Salīdzināšanai ņemam pirmo vārdu bez dzinēja apzīmējuma.
// Modeļi no vairākiem vārdiem, kurus pirmais vārds vien nesaprot ("Land Cruiser", "Santa Fe")
const MODEL_FIX = {
  Toyota: { land: 'Land Cruiser', rav: 'RAV4', urban: 'Urban Cruiser', mr: 'MR2' },
  Hyundai: { santa: 'Santa Fe' },
  Kia: { pro_ceed: 'ProCeed' },
};

// "Citi" (ss.lv kategorija "citi modeļi") nav konkrēts modelis, tāpēc tādus auto savā starpā nesalīdzinām
const UNKNOWN_MODEL_RE = /^(citi|cits|cita|other|others|inne|inny|andere)$/i;
const isKnownModel = (modelNorm) => Boolean(modelNorm) && !UNKNOWN_MODEL_RE.test(modelNorm);

function normalizeModel(raw, make) {
  const text = String(raw || '').trim();
  const words = text.split(/[\s/]+/);
  const first = words[0] || '';
  if (/^[-–.]+$/.test(first)) return '';
  const makeName = normalizeMake(make);
  const fix = MODEL_FIX[makeName]?.[first.toLowerCase()];
  if (fix) return fix;
  // "Grand C-Max", "Grand Scenic", "New Beetle": pirmais vārds vien modeli nenosaka
  if (/^(grand|new)$/i.test(first) && words[1]) {
    return `${first[0].toUpperCase()}${first.slice(1).toLowerCase()} ${normalizeModel(words.slice(1).join(' '), make)}`;
  }
  // ss.lv "Mazda3", "Mazda6" → "3", "6" (kā citās vietnēs)
  const mazda = makeName === 'Mazda' && text.match(/^mazda\s*(\d)\b/i);
  if (mazda) return mazda[1];
  // ss.lv un otomoto "XC 60", "V 70" → "XC60", "V70" (citādi visi XC modeļi saplūst vienā "XC")
  if (makeName === 'Volvo' && /^(xc|ex|ec|es|v|s|c)$/i.test(first) && /^\d{2}$/.test(words[1] || '')) {
    return first.toUpperCase() + words[1];
  }
  // otomoto u.c.: "Seria 3" / "3 Series" / "3er" (BMW sērija bez konkrēta modeļa) → "3. sērija"
  const series = String(raw || '').match(/^(?:seria|series|serie|reihe)\s*(\d)\b|^(\d)\s*(?:series|er)\b|^(\d)\. sērija$/i);
  if (series && normalizeMake(make) === 'BMW') return `${series[1] || series[2] || series[3]}. sērija`;
  // "Klasa C" / "C-Klasse" / "Classe E" → "C", "E"
  const cls = String(raw || '').match(/^(?:klasa|classe|class|klasse)\s+([a-z]{1,3})\b|^([a-z]{1,3})[- ]?(?:klasse|klasa|class)\b/i);
  if (cls) return (cls[1] || cls[2]).toUpperCase();
  // BMW "320d" / "520i" → "320" / "520"; "A4", "X5", "V60" paliek
  if (/^\d{3}[a-z]{1,2}$/i.test(first)) return first.replace(/[a-z]+$/i, '');
  // Mercedes "C220", "E320d", "GLC300" → "C", "E", "GLC" (klase)
  if (normalizeMake(make) === 'Mercedes') {
    const m = first.match(/^([a-z]{1,3})-?\d{2,3}[a-z]*$/i);
    if (m) return m[1].toUpperCase();
  }
  return first;
}

// Virsbūves tipi (vienoti visiem avotiem)
const BODY_TYPES = ['sedans', 'universālis', 'hečbeks', 'apvidus', 'minivens', 'kupeja', 'kabriolets'];

// Populārākie modeļi katrai markai un to tipiskā virsbūve.
// Izmanto: 1) modeļu izvēlnei meklēšanā, 2) virsbūves noteikšanai, ja vietne to nenorāda.
const S = 'sedans', U = 'universālis', H = 'hečbeks', A = 'apvidus', M = 'minivens', K = 'kupeja', C = 'kabriolets';
const MODEL_CATALOG = {
  Audi: { A1: H, A3: H, A4: S, A5: K, A6: S, A8: S, Q3: A, Q5: A, Q7: A, TT: K },
  BMW: { 116: H, 118: H, 120: H, 318: S, 320: S, 325: S, 330: S, 520: S, 525: S, 530: S, 535: S, 730: S, 740: S, X1: A, X3: A, X5: A, X6: A, Z4: C, i3: H },
  Citroen: { C3: H, C4: H, C5: S, Berlingo: M },
  Ford: { Fiesta: H, Focus: H, Mondeo: S, Kuga: A, Galaxy: M, 'S-Max': M },
  Honda: { Jazz: H, Civic: H, Accord: S, 'CR-V': A },
  Hyundai: { i20: H, i30: H, i40: U, Tucson: A, 'Santa Fe': A },
  Kia: { Rio: H, Ceed: H, Sportage: A, Sorento: A },
  Lexus: { IS: S, ES: S, NX: A, RX: A },
  Mazda: { 2: H, 3: H, 6: S, 'CX-5': A },
  Mercedes: { A: H, B: M, C: S, E: S, S: S, CLA: K, GLC: A, GLE: A, ML: A, Vito: M },
  Nissan: { Micra: H, Leaf: H, Juke: A, Qashqai: A, 'X-Trail': A },
  Opel: { Corsa: H, Astra: H, Insignia: S, Zafira: M, Mokka: A },
  Peugeot: { 208: H, 308: H, 508: S, 3008: A, 5008: A },
  Renault: { Clio: H, Megane: H, Laguna: S, Scenic: M, Captur: A, Kadjar: A },
  Skoda: { Fabia: H, Rapid: H, Octavia: U, Superb: S, Karoq: A, Kodiaq: A },
  Subaru: { Impreza: H, Legacy: U, Outback: U, Forester: A, XV: A },
  Toyota: { Yaris: H, Corolla: H, Prius: H, Avensis: U, Camry: S, 'C-HR': A, RAV4: A, 'Land Cruiser': A },
  Volkswagen: { Polo: H, Golf: H, Jetta: S, Passat: U, Arteon: S, Touran: M, Sharan: M, Caddy: M, Tiguan: A, Touareg: A },
  Volvo: { V40: H, V50: U, V60: U, V70: U, V90: U, XC70: U, S60: S, S80: S, S90: S, XC40: A, XC60: A, XC90: A },
};

// Avotu virsbūves nosaukumi (angliski/vāciski) → mūsu tipi
function bodyLv(raw) {
  const t = String(raw ?? '').toLowerCase();
  if (!t) return null;
  if (/sedan|limousine|limuzīn/.test(t)) return S;
  if (/station|wagon|kombi|estate|touring|avant|variant|sports ?tourer|univers/.test(t)) return U;
  if (/compact|hatch|kleinwagen|small|sportback|hečbek/.test(t)) return H;
  if (/suv|off-?road|gelände|pick-?up|apvid|džip/.test(t)) return A;
  if (/van|mpv|minibus|minivan|minivens/.test(t)) return M;
  if (/coupe|coupé|kupej/.test(t)) return K;
  if (/convertible|cabrio|roadster|kabriol/.test(t)) return C;
  return null;
}

function bodyFor(make, model) {
  const models = MODEL_CATALOG[normalizeMake(make)] || {};
  const key = normalizeModel(model, make).toLowerCase();
  const hit = Object.entries(models).find(([name]) => name.toLowerCase() === key);
  return hit ? hit[1] : null;
}

// BMW sērijas kā ss.lv: 316/318/320/330 → "3. sērija"; X, Z, i un M modeļi paliek atsevišķi
const SERIES_RE = /^(\d)\. sērija$/;
function seriesOf(make, model) {
  if (normalizeMake(make) !== 'BMW') return null;
  const m = String(model || '').match(/^(\d)\d\d[a-z]*$/i) || String(model || '').match(/^(\d)\. sērija$/);
  return m ? `${m[1]}. sērija` : null;
}

module.exports = { MAKE_TABLE, MODEL_CATALOG, BODY_TYPES, normalizeMake, normalizeModel, isKnownModel, bodyLv, bodyFor, seriesOf, SERIES_RE };
