// AI asistents: lietotājs raksta parastā valodā ("dīzeļa universālis līdz 6000 pēc 2012"),
// asistents atrod piemērotākos auto mūsu datos un paskaidro, kāpēc tie ir labi.
//
// Divi režīmi:
//  1. Claude (ja ir ANTHROPIC_API_KEY) — modelis pats izsauc rīku search_cars ar filtriem,
//     saņem rezultātus no MŪSU datubāzes un uzraksta atbildi. Modelis neko neizdomā,
//     jo redz tikai to, ko atgriež rīks.
//  2. Bezsaistes (bez atslēgas vai ja API nav pieejams) — vienkāršs latviešu valodas
//     parsētājs izvelk filtrus no teksta. Tā prezentācija strādā vienmēr.
//
// Asistents saprot trīs veida jautājumus:
//  - meklēšana:      "dīzeļa VW līdz 7000"            → atrod auto
//  - turpinājums:     "un kaut ko lētāku?"              → maina iepriekšējos filtrus
//  - salīdzināšana:   "salīdzini pirmos divus"          → salīdzina rādītos auto
//  - novērtējums:     "vai šis ir labs pirkums?"        → novērtē konkrētu auto
// Lai to saprastu, lapa līdzi sūta kontekstu: iepriekšējos filtrus un rādīto auto ID.

const { searchListings, getScored } = require('./search');
const { validateListingQuery, MAKES } = require('./validate');
const { MODEL_CATALOG } = require('./makes');

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const MAX_STEPS = 4;
const CURRENT_YEAR = new Date().getFullYear();

const fmt = new Intl.NumberFormat('lv-LV');
const eur = (n) => `${fmt.format(n)} €`;

// ---------------------------------------------------------------------------
// Bezsaistes parsētājs
// ---------------------------------------------------------------------------

const MAKE_WORDS = {
  ...Object.fromEntries(Object.entries(MAKES).map(([slug, name]) => [name.toLowerCase(), slug])),
  vw: 'volkswagen', folcis: 'volkswagen', golfs: 'volkswagen',
  merss: 'mercedes', mersis: 'mercedes', 'mercedes-benz': 'mercedes', benz: 'mercedes',
  bembis: 'bmw', bēmītis: 'bmw', audiks: 'audi', škoda: 'skoda', citroën: 'citroen', tojota: 'toyota',
};

// Modeļi no kataloga: "golfs" → VW Golf, "octavia" → Skoda Octavia, "320d" → BMW 320.
// Ciparu modeļus (Mazda 3, Peugeot 308) atpazīstam tikai tad, ja marka arī ir minēta.
const SLUG_BY_NAME = Object.fromEntries(Object.entries(MAKES).map(([slug, name]) => [name, slug]));
const MODEL_WORDS = Object.entries(MODEL_CATALOG).flatMap(([makeName, models]) =>
  Object.keys(models).map((model) => ({ model, make: SLUG_BY_NAME[makeName], numeric: /^\d+$/.test(model) })))
  .filter((m) => m.make)
  .sort((a, b) => b.model.length - a.model.length);

function findModel(t, make) {
  for (const m of MODEL_WORDS) {
    if (make && m.make !== make) continue;
    const w = m.model.toLowerCase().replace(/[-]/g, '\\-');
    // "320d" bez markas → BMW 320
    if (m.numeric && !make && m.make === 'bmw' && new RegExp(`[\\s,.?!(]${w}[di][\\s,.?!)]`).test(t)) return m;
    // Ciparu un īsos modeļus (Mazda 3, Mercedes C, Lexus ES — "es" ir arī vārds) — tikai ar marku
    const short = m.numeric || (m.model.length <= 2 && !/\d/.test(m.model));
    if (short && !make) continue;
    // Gariem modeļiem atļaujam latviešu galotnes: golfs, golfu, passatu, octaviu
    const ending = m.model.length >= 4 && !/\d/.test(m.model) ? '(?:s|u|a|am|ā|i|us)?' : m.numeric ? '(?:[di]|xd|xi)?' : '';
    if (new RegExp(`[\\s,.?!(]${w}${ending}[\\s,.?!)]`).test(t)) return m;
  }
  return null;
}

// Mērķis → virsbūve (ja lietotājs nenosauc virsbūvi pats)
const PURPOSES = [
  [/ģimen|gimen|bērn|bern|family/, 'universālis', 'ģimenei ērtāks ir universālis ar lielu bagāžnieku'],
  [/pilsēt|pilset|students?|studentam|pirm(ais|o) auto|city/, 'hečbeks', 'pilsētai un pirmajam auto parasti der kompakts hečbeks'],
  [/bezceļ|bezcel|lauk|ziem|off-?road|4x4|pilnpiedz/, 'apvidus', 'laukiem un ziemai noderēs apvidus auto'],
];

const HELP_RE = /^(sveiki|sveiks|čau|cau|labdien|hi|hello|hey|palīdz|palidz|ko (tu )?(māki|proti|vari)|help)\b/;
// Rasistiski un homofobiski apvainojumi (LV/EN/RU, arī ar cipariem burtu vietā). Uz tādiem jautājumiem neatbildam.
const ABUSE_RE = new RegExp([
  'n[i1!ī]+g+(?:[e3]r|a|ah|uh)(?!i[jy]?a)', 'n[eē][gģ]er', 'ниг+ер', 'faggot', 'p[iī]d[ao]r', 'пид[оа]р', 'педик',
  'ž[iī]d(?:s|i|u|us|iem|am|a)?(?!\\p{L})', 'жид(?:ы|ов|ам|у|а)?(?!\\p{L})', 'kikes?(?!\\p{L})', 'chinks?(?!\\p{L})',
].map((p) => `(?<!\\p{L})${p}`).join('|'), 'iu');
// Vārdi, pēc kuriem saprotam, ka jautājums ir par auto, pat ja filtru tajā nav ("parādi izdevīgākos auto")
const CAR_RE = /auto|mašīn|masin|mašin|spēkrat|\bcars?\b|vehicle|izdevīg|izdevig|piedāvāj|piedavaj|sludināj|sludinaj|tirg|deal|lēt|dārg|pirk|meklē|mekle/;
// "7 cilvēkiem", "pārvadāt 8 pasažierus"
const SEATS_RE = /(\d{1,3})\s*(?:cilvēk|cilvek|pasažier|pasazier|person|people|passeng|sēdviet|sedviet|vietīg|vietig)/;
const PRICE_Q_RE =/cik (maksā|maksa|izmaksā|vidēji|parasti)|vidēj(a|ā) cena|tirgus cena|kāda ir cena|how much|average price/;

function num(text) {
  const t = String(text).toLowerCase().replace(/\s/g, '').replace(',', '.');
  const k = /k$|tūkst/.test(t);
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(k ? n * 1000 : n) : null;
}

function parseQuestion(q) {
  const t = ` ${q.toLowerCase()} `;
  const f = {};

  for (const [word, slug] of Object.entries(MAKE_WORDS)) {
    if (new RegExp(`[\\s,.?!]${word.replace(/[-]/g, '\\-')}[\\s,.?!]`).test(t)) { f.make = slug; break; }
  }

  {
    // BMW sērija: "3. sērija", "3 series", "trešā sērija", "3er"
    const ser = t.match(/[\s(](\d)\.?\s*(?:sērij|serij|series)|[\s(](\d)er[\s,.?!]/);
    const m = findModel(t, f.make);
    if (ser && (!f.make || f.make === 'bmw')) { f.make = 'bmw'; f.model = `${ser[1] || ser[2]}. sērija`; }
    else if (m) { f.make = m.make; f.model = m.model; }
  }

  // Cenu diapazons: "no 3000 līdz 6000", "3000-6000 €", "starp 3k un 6k"
  const range = t.match(/(?:no|starp|between|from)?\s*(\d[\d\s.,]*k?)\s*(?:-|–|līdz|un|to|and)\s*(\d[\d\s.,]*k?)\s*(?:€|eur|eiro)/)
    || t.match(/(?:starp|between)\s*(\d[\d.,]*k?)\s*(?:un|and|-)\s*(\d[\d.,]*k?)/);
  if (range) {
    const a = num(range[1]);
    const b = num(range[2]);
    if (a >= 300 && b > a && b <= 500000) { f.minPrice = a; f.maxPrice = b; }
  }

  const price = !f.maxPrice && (t.match(/(?:līdz|max|maks\.?|zem|lētāk(?:s|u)? par|budžets?|under|below|up to|max\.?)\s*([\d\s.,]+k?)\s*(?:€|eur|eiro)?/)
    || t.match(/([\d\s.,]+k?)\s*(?:€|eur|eiro)/)
    || t.match(/\s(\d{1,3}(?:[.,]\d)?k)(?=[\s,.]|$)/));
  if (price) {
    const n = num(price[1]);
    if (n && n >= 300 && n <= 500000) f.maxPrice = n;
  }

  const km = t.match(/(?:līdz|max|zem|mazāk par)\s*([\d\s.,]+k?)\s*(?:km|tūkst\.?\s*km)/) || t.match(/([\d\s.,]+k?)\s*km/);
  if (km) {
    let n = num(km[1]);
    if (n && n < 2000) n *= 1000; // "200 km" gandrīz vienmēr nozīmē 200 tūkst.
    if (n) f.maxMileage = n;
  }

  const yearFrom = t.match(/(?:pēc|no|sākot no|jaunāk(?:s|u)? par|vismaz|after|newer than|from)\s*(19[89]\d|20[0-3]\d)/) || t.match(/(19[89]\d|20[0-3]\d)\s*\+/);
  if (yearFrom) f.minYear = Number(yearFrom[1]) + (/pēc|jaunāk|after|newer/.test(yearFrom[0]) ? 1 : 0);
  const yearTo = t.match(/(?:līdz|ne jaunāk(?:s|u)? par)\s*(19[89]\d|20[0-3]\d)\s*(?:g|gad)/);
  if (yearTo) f.maxYear = Number(yearTo[1]);
  if (/jaun(s|u|āk)\b|jauns auto/.test(t) && !f.minYear) f.minYear = CURRENT_YEAR - 5;

  if (/dīze[lļ]|dize[lļ]|diesel/.test(t)) f.fuel = 'dīzelis';
  else if (/benzīn|benzin|petrol|gasoline/.test(t)) f.fuel = 'benzīns';
  else if (/hibrīd|hibrid|hybrid/.test(t)) f.fuel = 'hibrīds';
  else if (/elektr|electric|\bev\b/.test(t)) f.fuel = 'elektro';

  const bodies = [
    [/univers|kombi|wagon|estate|touring|avant/, 'universālis'], [/apvid|suv|džip|dzip|krosover/, 'apvidus'], [/sedan/, 'sedans'],
    [/hečbek|hecbek|hatch/, 'hečbeks'], [/miniven|ģimenes auto|vens\b/, 'minivens'],
    [/kupej|coupe/, 'kupeja'], [/kabriol|cabrio/, 'kabriolets'],
  ];
  for (const [re, body] of bodies) if (re.test(t)) { f.body = body; break; }
  const seats = t.match(SEATS_RE);
  if (!f.body && seats && Number(seats[1]) >= 6) f.body = 'minivens';
  if (!f.body && !f.model) {
    for (const [re, body] of PURPOSES) if (re.test(t)) { f.body = body; break; }
  }

  if (/mazs? nobrauk|maz nobrauk|mazāko nobrauk|low mileage/.test(t)) f.sort = 'mileage';
  else if (/lētāk|lētu|lēts|lēti|cheap/.test(t) && !/deal|izdevīg|atlaid/.test(t)) f.sort = 'price';
  else if (/jaunāk|newest/.test(t) && !f.minYear) f.sort = 'year';
  else f.sort = 'deal';

  return f;
}

function describeFilters(f) {
  const parts = [];
  if (f.make) parts.push(MAKES[f.make]);
  if (f.model) parts.push(f.model);
  if (f.fuel) parts.push(f.fuel);
  if (f.body) parts.push(f.body);
  if (f.minYear && f.minYear === f.maxYear) parts.push(`${f.minYear}. gads`);
  else {
    if (f.minYear) parts.push(`no ${f.minYear}. gada`);
    if (f.maxYear) parts.push(`līdz ${f.maxYear}. gadam`);
  }
  if (f.minPrice && f.maxPrice) parts.push(`${eur(f.minPrice)}–${eur(f.maxPrice)}`);
  else if (f.minPrice) parts.push(`no ${eur(f.minPrice)}`);
  else if (f.maxPrice) parts.push(`līdz ${eur(f.maxPrice)}`);
  if (f.maxMileage) parts.push(`līdz ${fmt.format(f.maxMileage)} km`);
  return parts.join(', ');
}

function searchAnswer(filters, prefix = 'Atradu', note = '') {
  // Aizdomīgi lētus (>70% zem tirgus) neiesakām
  const { total, items } = searchListings({ ...filters, limit: 6, noSuspicious: true });
  const what = describeFilters(filters);
  const extra = note ? ` ${note[0].toUpperCase()}${note.slice(1)}.` : '';
  if (!total) {
    // Pamēģinām mīkstāk: bez virsbūves un nobraukuma, ar 20% lielāku budžetu
    const soft = { ...filters };
    delete soft.body; delete soft.maxMileage;
    if (soft.maxPrice) soft.maxPrice = Math.round(soft.maxPrice * 1.2 / 500) * 500;
    const alt = JSON.stringify(soft) !== JSON.stringify(filters) ? searchListings({ ...soft, limit: 6, noSuspicious: true }) : { total: 0, items: [] };
    if (alt.total) {
      return {
        intent: 'search', filters: soft, items: alt.items,
        answer: `Ar šiem nosacījumiem${what ? ` (${what})` : ''} neatradu neko.${extra} Ja nedaudz atvieglo (${describeFilters(soft) || 'bez virsbūves un nobraukuma'}), ir ${fmt.format(alt.total)} auto. Lūk, labākie no tiem.`,
      };
    }
    return {
      intent: 'search', filters, items: [],
      answer: `Neatradu nevienu auto${what ? ` (${what})` : ''}.${extra} Pamēģini palielināt budžetu vai noņemt kādu nosacījumu.`,
    };
  }
  const best = items[0];
  const lines = [`${prefix} ${fmt.format(total)} auto${what ? ` (${what})` : ''}.${extra}`];
  if (best.dealScore != null && best.dealScore > 0) {
    lines.push(
      `Izdevīgākais ir ${best.make} ${best.model}, ${best.year}, par ${eur(best.price)}. ` +
      `Līdzīgi auto maksā ap ${eur(best.marketPrice)}, tātad tas ir par ${fmt.format(best.dealScore)}% lētāks.`
    );
  } else {
    lines.push(`Pirmais sarakstā ir ${best.make} ${best.model}, ${best.year}, par ${eur(best.price)}.`);
  }
  if (best.dealScore > 35) lines.push('Cena ir aizdomīgi zema, tāpēc to noteikti pārbaudi.');
  else if (best.mileage > 300000) lines.push('Tam ir liels nobraukums, tāpēc pirms pirkšanas vērts pārbaudīt servisa vēsturi.');
  return { intent: 'search', filters, items, answer: lines.join(' ').replace(/ \n/g, '\n') };
}

// ---------- "Cik maksā Golf 2015?" ----------

function priceAnswer(filters) {
  const { total, items } = searchListings({ ...filters, sort: 'price', limit: 500 });
  const what = describeFilters(filters) || 'visiem auto';
  if (total < 3) return { intent: 'price', filters, items: [], answer: `Par ${what} man ir par maz datu (${total} sludinājumi), lai pateiktu tipisku cenu.` };
  const prices = items.map((l) => l.price).sort((a, b) => a - b);
  const q = (p) => prices[Math.min(prices.length - 1, Math.floor(p * prices.length))];
  const top = searchListings({ ...filters, sort: 'deal', limit: 3, noSuspicious: true }).items;
  return {
    intent: 'price', filters, items: top,
    answer: `${what[0].toUpperCase()}${what.slice(1)}: ${fmt.format(total)} sludinājumi. Tipiskā cena ir ap ${eur(q(0.5))}, ` +
      `lielākā daļa maksā no ${eur(q(0.25))} līdz ${eur(q(0.75))} (lētākais ${eur(prices[0])}).` +
      (top.length ? ' Zemāk ir izdevīgākie no tiem.' : ''),
  };
}

const HELP_TEXT = 'Sveiki! Es meklēju lietotus auto Dealvo datos un salīdzinu tos ar tirgu. Vari rakstīt, piemēram:\n' +
  '• „dīzeļa universālis līdz 7000 € pēc 2013”\n• „golfs līdz 5000”\n• „cik maksā Octavia 2016?”\n' +
  '• „auto ģimenei no 4000 līdz 8000 eur”\nPēc tam vari prasīt „un lētāku?”, „salīdzini pirmos divus” vai „vai pirmais ir labs pirkums?”.';
const OFF_TOPIC_TEXT = 'Es palīdzu tikai atrast lietotus auto Dealvo datos. Pastāsti, kādu auto meklē: marku, budžetu, gadu vai kam tas vajadzīgs, piemēram, „golfs līdz 5000” vai „auto ģimenei līdz 8000 €”.';
const ABUSE_TEXT = 'Uz šādiem jautājumiem neatbildu. Ja meklē auto, pastāsti, kādu: marku, budžetu, gadu vai kam tas vajadzīgs.';

// ---------- Jautājuma veida noteikšana ----------

const COMPARE_RE = /salīdzin|kur(š|s|u) (ir )?(labāk|labak|izvēlēt)|kuru (izvēlēties|ņemt|pirkt)|vai pirmais vai otrais/;
const EVALUATE_RE = /vai (šis|tas|pirmais|šo|to)|labs pirkums|vērts (pirkt|ņemt)|ko (tu )?domā par|novērtē|kā (tev )?(šķiet|liekas)|vai (ir )?(labs|izdevīg)/;
const REFINE_RE = /lētāk|lētāku|dārgāk|jaunāk|vecāk|mazāk(u)? (km|nobrauk)|mazāku nobrauk|vēl |citu|cits|tādu pašu|bet |^un |^bet /;

function intentOf(q, ctx) {
  const t = q.toLowerCase().trim();
  const shown = ctx.ids?.length || 0;
  if (COMPARE_RE.test(t) && (shown >= 2 || ctx.focus)) return 'compare';
  if (EVALUATE_RE.test(t) && (ctx.focus || shown >= 1)) return 'evaluate';
  if (ctx.filters && REFINE_RE.test(t)) return 'refine';
  return 'search';
}

// "otro", "trešo" u.c. — kuru no rādītajiem auto lietotājs domā
function pickIndex(t) {
  if (/otr(o|ais|ā)|2\./.test(t)) return 1;
  if (/treš(o|ais|ā)|3\./.test(t)) return 2;
  if (/ceturt(o|ais|ā)|4\./.test(t)) return 3;
  return 0;
}

// ---------- Turpinājums: "un kaut ko lētāku?" ----------

function refineFilters(q, prev, shownItems) {
  const t = ` ${q.toLowerCase()} `;
  const parsed = parseQuestion(q);
  const f = { ...prev };
  // Ja jautājumā ir konkrētas vērtības (marka, cena, gads...), tās aizvieto iepriekšējās
  for (const k of ['make', 'model', 'fuel', 'body', 'minYear', 'maxYear', 'maxPrice', 'maxMileage']) {
    if (parsed[k] !== undefined) f[k] = parsed[k];
  }
  if (parsed.make && parsed.make !== prev.make) delete f.model; // cita marka → modelis vairs neder

  const prices = shownItems.map((l) => l.price).sort((a, b) => a - b);
  const mid = (arr) => arr[Math.floor(arr.length / 2)];
  const round = (n, step) => Math.max(step, Math.round(n / step) * step);

  if (/lētāk|lētāku/.test(t) && parsed.maxPrice === undefined) {
    const base = prev.maxPrice || (prices.length ? mid(prices) : null);
    if (base) f.maxPrice = round(base * 0.8, 500);
  }
  if (/dārgāk/.test(t)) {
    const base = prev.maxPrice || (prices.length ? prices[prices.length - 1] : null);
    if (base) { f.minPrice = round(base, 500); delete f.maxPrice; }
  }
  if (/jaunāk/.test(t) && parsed.minYear === undefined) {
    const years = shownItems.map((l) => l.year).sort((a, b) => a - b);
    const base = prev.minYear || (years.length ? mid(years) : null);
    if (base) f.minYear = Math.min(CURRENT_YEAR, base + 2);
  }
  if (/mazāk(u)? (km|nobrauk)|mazāku nobrauk|mazs nobrauk/.test(t) && parsed.maxMileage === undefined) {
    const kms = shownItems.map((l) => l.mileage).filter((n) => n != null).sort((a, b) => a - b);
    const base = prev.maxMileage || (kms.length ? mid(kms) : null);
    if (base) f.maxMileage = round(base * 0.75, 10000);
  }
  f.sort = parsed.sort && parsed.sort !== 'deal' ? parsed.sort : (prev.sort || 'deal');
  return f;
}

// ---------- Viena auto novērtējums ----------

function factsAbout(l) {
  const age = Math.max(1, CURRENT_YEAR - l.year);
  const kmPerYear = l.mileage != null ? Math.round(l.mileage / age) : null;
  const prev = l.priceHistory?.length ? l.priceHistory.at(-1).price : null;
  return { age, kmPerYear, priceDrop: prev && l.price < prev ? prev : null };
}

function evaluate(l) {
  const { age, kmPerYear, priceDrop } = factsAbout(l);
  const name = `${l.make} ${l.model}, ${l.year}, par ${eur(l.price)}`;
  const plus = [];
  const minus = [];

  if (l.dealScore == null) {
    minus.push('līdzīgu auto ir par maz, tāpēc nevaru droši pateikt, vai cena ir laba');
  } else if (l.suspicious) {
    minus.push(`cena ir par ${fmt.format(l.dealScore)}% zemāka nekā līdzīgiem auto (tipiski ${eur(l.marketPrice)}), un tik liela starpība parasti nozīmē kļūdu sludinājumā vai slēptu problēmu`);
  } else if (l.dealScore >= 20) {
    plus.push(`cena ir par ${fmt.format(l.dealScore)}% zemāka nekā līdzīgiem auto (tipiski ${eur(l.marketPrice)})`);
  } else if (l.dealScore >= 10) {
    plus.push(`cena ir par ${fmt.format(l.dealScore)}% zem tirgus`);
  } else if (l.dealScore > -10) {
    plus.push(`cena atbilst tirgum (līdzīgi auto ap ${eur(l.marketPrice)})`);
  } else {
    minus.push(`tas ir par ${fmt.format(Math.abs(l.dealScore))}% dārgāks nekā līdzīgi auto`);
  }

  if (kmPerYear != null) {
    if (kmPerYear > 30000) minus.push(`liels nobraukums: vidēji ${fmt.format(kmPerYear)} km gadā`);
    else if (kmPerYear < 13000) plus.push(`mazs nobraukums: vidēji ${fmt.format(kmPerYear)} km gadā`);
  } else {
    minus.push('nobraukums nav norādīts');
  }
  if (age > 15) minus.push(`auto ir ${age} gadus vecs, rēķinies ar remonta izmaksām`);
  else if (age <= 5) plus.push('salīdzinoši jauns auto');
  if (priceDrop) plus.push(`cena jau samazināta (bija ${eur(priceDrop)})`);
  if (l.seller?.type === 'dīleris') plus.push('pārdod dīleris, var jautāt par garantiju');

  const score = plus.length - minus.length + (l.dealScore >= 20 && !l.suspicious ? 1 : 0);
  const verdict = l.dealScore != null && l.dealScore > 35
    ? 'Cena ir aizdomīgi zema, tāpēc pirms pirkšanas obligāti pārbaudi auto vēsturi (avārijas, nobraukums, dokumenti).'
    : score >= 2 ? 'Kopumā izskatās pēc laba piedāvājuma, bet pirms pirkšanas pārbaudi auto tehniskajā stacijā.'
      : score >= 0 ? 'Tas ir normāls piedāvājums: ne īpaši izdevīgs, ne slikts.'
        : 'Es pameklētu vēl, jo ir vairāki mīnusi.';

  const text = [`${name}.`];
  if (plus.length) text.push(`Plusi: ${plus.join('; ')}.`);
  if (minus.length) text.push(`Mīnusi: ${minus.join('; ')}.`);
  text.push(verdict);
  return { text: text.join(' '), score };
}

// ---------- Divu auto salīdzinājums ----------

function compare(a, b) {
  const fa = factsAbout(a);
  const fb = factsAbout(b);
  const points = (l, f) => (l.suspicious ? 0 : l.dealScore ?? 0) + (l.year - 2000) - (f.kmPerYear ?? 25000) / 2500;
  const pa = points(a, fa);
  const pb = points(b, fb);
  const label = (l) => `${l.make} ${l.model} (${l.year}, ${eur(l.price)})`;
  // Ja abi ir viens modelis, atšķiram tos pēc gada un cenas
  const same = `${a.make} ${a.model}` === `${b.make} ${b.model}`;
  const nm = (l) => (same ? `${l.year}. gada ${l.model} par ${eur(l.price)}` : `${l.make} ${l.model}`);
  const lines = [`Salīdzinu: ${label(a)} un ${label(b)}.`];

  const diff = (better, worse, what) => lines.push(`${better[0].toUpperCase()}${better.slice(1)} ${what}.`);
  for (const l of [a, b]) if (l.suspicious) lines.push(`${nm(l)[0].toUpperCase()}${nm(l).slice(1)} ir aizdomīgi lēts (${fmt.format(l.dealScore)}% zem tirgus), tāpēc vispirms pārbaudi, vai sludinājumā nav kļūdas.`);
  if (a.dealScore != null && b.dealScore != null && !a.suspicious && !b.suspicious && Math.abs(a.dealScore - b.dealScore) >= 5) {
    const [x, y] = a.dealScore > b.dealScore ? [a, b] : [b, a];
    diff(nm(x), y, `ir izdevīgāks pret tirgu (${fmt.format(x.dealScore)}% pret ${fmt.format(y.dealScore)}%)`);
  }
  if (a.year !== b.year) {
    const [x, y] = a.year > b.year ? [a, b] : [b, a];
    diff(nm(x), y, `ir jaunāks par ${x.year - y.year} ${x.year - y.year === 1 ? 'gadu' : 'gadiem'}`);
  }
  if (fa.kmPerYear != null && fb.kmPerYear != null && Math.abs(fa.kmPerYear - fb.kmPerYear) >= 3000) {
    const [x, fx, fy] = fa.kmPerYear < fb.kmPerYear ? [a, fa, fb] : [b, fb, fa];
    diff(nm(x), null, `ir mazāk braukts (${fmt.format(fx.kmPerYear)} pret ${fmt.format(fy.kmPerYear)} km gadā)`);
  }
  if (a.price !== b.price) {
    const [x, y] = a.price < b.price ? [a, b] : [b, a];
    diff(nm(x), y, `ir lētāks par ${eur(y.price - x.price)}`);
  }
  const winner = Math.abs(pa - pb) < 3 ? null : pa > pb ? a : b;
  lines.push(winner
    ? `Kopumā es izvēlētos ${label(winner)}.`
    : 'Abi ir līdzīgi labi, tāpēc izšķir stāvoklis un servisa vēsture.');
  return lines.join(' ');
}

// ---------- Bezsaistes atbilde ----------

function offlineAnswer(question, ctx = {}) {
  const intent = intentOf(question, ctx);
  const t = question.toLowerCase().trim();

  if (HELP_RE.test(t) && t.split(/\s+/).length <= 6) {
    return { mode: 'offline', intent: 'help', filters: ctx.filters || null, items: [], answer: HELP_TEXT };
  }
  if (PRICE_Q_RE.test(t)) {
    const f = parseQuestion(question);
    // "cik maksā golfs 2015?" — gads bez "pēc/no" nozīmē tieši to gadu
    const y = t.match(/\b(19[89]\d|20[0-3]\d)\b/);
    if (y && !f.minYear && !f.maxYear) { f.minYear = Number(y[1]); f.maxYear = Number(y[1]); }
    delete f.sort;
    return { mode: 'offline', ...priceAnswer(f) };
  }

  if (intent === 'compare') {
    const keys = ctx.focus ? [ctx.focus, ...(ctx.ids || []).filter((k) => k !== ctx.focus)] : ctx.ids;
    const cars = getScored(keys.slice(0, 2));
    if (cars.length >= 2) {
      return { mode: 'offline', intent, filters: ctx.filters || null, items: cars, answer: compare(cars[0], cars[1]) };
    }
  }
  if (intent === 'evaluate') {
    const key = ctx.focus || ctx.ids[Math.min(pickIndex(t), ctx.ids.length - 1)];
    const [car] = getScored([key]);
    if (car) return { mode: 'offline', intent, filters: ctx.filters || null, items: [car], answer: evaluate(car).text };
  }
  if (intent === 'refine') {
    const shown = ctx.ids?.length ? getScored(ctx.ids) : [];
    const filters = refineFilters(question, ctx.filters, shown);
    return { mode: 'offline', ...searchAnswer(filters, 'Labi, tagad atradu'), intent };
  }
  const filters = parseQuestion(question);
  // Nekas no jautājuma neattiecas uz auto ("tu esi robots?") → nerādām nejaušu auto sarakstu
  const hasFilters = Object.keys(filters).some((k) => k !== 'sort') || filters.sort !== 'deal';
  if (!hasFilters && !CAR_RE.test(t)) {
    return { mode: 'offline', intent: 'off-topic', filters: null, items: [], answer: OFF_TOPIC_TEXT };
  }
  const seats = Number(t.match(SEATS_RE)?.[1]);
  const purpose = !filters.model && PURPOSES.find(([re, body]) => re.test(t) && filters.body === body);
  const note = seats > 9 && filters.body === 'minivens'
    ? `vieglajā auto ir ne vairāk kā 9 sēdvietas, tāpēc ${seats} cilvēkiem vajag autobusu. Dealvo ir tikai vieglie auto, un ietilpīgākie no tiem ir minivens`
    : seats >= 6 && filters.body === 'minivens' ? `${seats} cilvēkiem der minivens`
      : purpose ? purpose[2] : '';
  return { mode: 'offline', ...searchAnswer(filters, 'Atradu', note) };
}

// ---------------------------------------------------------------------------
// Claude režīms
// ---------------------------------------------------------------------------

const SYSTEM = `Tu esi Dealvo asistents. Dealvo salīdzina lietotu auto sludinājumus no ss.lv, AutoScout24 un otomoto.pl un aprēķina, cik katrs auto ir lētāks vai dārgāks par līdzīgiem auto (dealScore procentos; pozitīvs = lētāk par tirgu).

Noteikumi:
- Lai atrastu auto, VIENMĒR izsauc rīku search_cars. Nekad neizdomā auto, cenas vai sludinājumus — runā tikai par to, ko atgrieza rīks.
- Ja lietotājs turpina iepriekšējo sarunu ("un kaut ko lētāku?", "bet dīzeli?"), ņem vērā iepriekšējos filtrus (tie ir dotajā kontekstā) un izsauc search_cars ar izmainītiem filtriem.
- Ja lietotājs prasa salīdzināt auto vai novērtēt konkrētu auto ("vai šis ir labs pirkums?"), izsauc get_cars ar to ID no konteksta un salīdzini cenu pret tirgu, nobraukumu gadā, vecumu un pārdevēju. Beigās pasaki skaidru ieteikumu.
- Ja rezultātu nav, pamēģini vēlreiz ar mīkstākiem filtriem (piem. lielāks budžets), ne vairāk kā 2 reizes.
- Atbildi tajā valodā, kurā lietotājs jautā (parasti latviski), īsi (2–5 teikumi), draudzīgi. Ja iesaki vairākus auto, uzskaiti tos numurētā sarakstā. Ieteic 1–3 konkrētus auto ar cenu, gadu un to, cik % tie ir lētāki par tirgu.
- Ja auto ir ļoti liels nobraukums vai aizdomīgi zema cena (vairāk kā 35% zem tirgus), iesaki to pārbaudīt pirms pirkšanas.
- search_cars aizdomīgi lētus auto (vairāk nekā 70% zem tirgus) neatgriež. Ja get_cars rezultātā aizdomigs=true, nesauc to par izdevīgu pirkumu: paskaidro, ka tik liela starpība parasti nozīmē kļūdu sludinājumā vai slēptu problēmu.
- Ja jautājums nav par auto meklēšanu, pieklājīgi pasaki, ka palīdzi tikai ar auto meklēšanu Dealvo datos, un neizsauc rīkus.
- Ja jautājumā ir aizskaroši, rasistiski vai naidīgi vārdi, neatkārto tos, nemeklē auto un īsi pasaki, ka uz tādiem jautājumiem neatbildi.
- Tu neesi finanšu konsultants; nesoli, ka darījums noteikti ir labs.`;

const TOOLS = [{
  name: 'search_cars',
  description: 'Meklē auto Dealvo datubāzē. Atgriež kopējo skaitu un līdz 8 labākajiem rezultātiem ar cenu, tirgus cenu un dealScore.',
  input_schema: {
    type: 'object',
    properties: {
      make: { type: 'string', enum: Object.keys(MAKES), description: 'Marka (slug)' },
      model: { type: 'string', description: 'Modelis, piem. "Golf", "320", "A4"' },
      fuel: { type: 'string', enum: ['dīzelis', 'benzīns', 'hibrīds', 'elektro', 'gāze'] },
      body: { type: 'string', enum: ['sedans', 'universālis', 'hečbeks', 'apvidus', 'minivens', 'kupeja', 'kabriolets'], description: 'Virsbūve' },
      minPrice: { type: 'integer', description: 'Minimālā cena eiro' },
      minYear: { type: 'integer' },
      maxYear: { type: 'integer' },
      maxPrice: { type: 'integer', description: 'Maksimālā cena eiro' },
      maxMileage: { type: 'integer', description: 'Maksimālais nobraukums km' },
      sort: { type: 'string', enum: ['deal', 'price', 'year', 'mileage'], description: 'deal = lielākā atlaide pret tirgu' },
    },
  },
}, {
  name: 'get_cars',
  description: 'Atgriež konkrētu auto pilnu informāciju pēc ID (no konteksta vai search_cars rezultātiem): cena, tirgus cena, dealScore, nobraukums gadā, vecums, pārdevējs, cenu vēsture. Izmanto salīdzināšanai un novērtējumam.',
  input_schema: {
    type: 'object',
    properties: { ids: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'ID formātā "avots:id"' } },
    required: ['ids'],
  },
}];

// Kompakts rezultāts modelim (mazāk tokenu, nav URL un bilžu)
const compact = (l) => ({
  id: `${l.source}:${l.externalId}`,
  auto: `${l.make} ${l.model}`,
  gads: l.year,
  cena: l.price,
  tirgus_cena: l.marketPrice,
  dealScore: l.dealScore,
  nobraukums: l.mileage,
  degviela: l.fuel,
  virsbuve: l.body,
  avots: l.source,
  ...(l.suspicious ? { aizdomigs: true } : {}),
});

const ID_RE = /^[\p{L}\p{N}.\-]{2,30}:[\w\-]{1,64}$/u;

function getCarsTool(input) {
  const ids = Array.isArray(input?.ids) ? input.ids.filter((i) => typeof i === 'string' && ID_RE.test(i)).slice(0, 4) : [];
  const items = getScored(ids);
  return {
    items,
    result: items.map((l) => {
      const f = factsAbout(l);
      return { ...compact(l), vecums_gadi: f.age, km_gada: f.kmPerYear, cena_samazinata_no: f.priceDrop,
        pardevejs: l.seller?.type || null, lidzigo_skaits: l.comparables ?? 0 };
    }),
  };
}

function runTool(input) {
  // Modeļa ievadi validējam tāpat kā lietotāja ievadi — modelim neuzticamies vairāk
  const v = validateListingQuery(Object.fromEntries(
    Object.entries(input || {}).filter(([, val]) => val !== null && val !== undefined).map(([k, val]) => [k, String(val)])
  ));
  if (!v.ok) return { filters: null, result: { kļūdas: v.errors } };
  const { total, items } = searchListings({ ...v.value, limit: 8, noSuspicious: true });
  return { filters: v.value, items, result: { kopā: total, rezultāti: items.map(compact) } };
}

async function callClaude(messages) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, tools: TOOLS, messages }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function contextText(ctx) {
  const parts = [];
  if (ctx.filters) parts.push(`Iepriekšējie meklēšanas filtri: ${JSON.stringify(ctx.filters)}`);
  if (ctx.ids?.length) {
    parts.push(`Lietotājam šobrīd rādītie auto (secībā): ${JSON.stringify(getScored(ctx.ids).map(compact))}`);
  }
  if (ctx.focus) parts.push(`Lietotājs jautā par šo konkrēto auto: ${ctx.focus}`);
  return parts.length ? `[Konteksts no lapas]\n${parts.join('\n')}\n\n` : '';
}

async function claudeAnswer(question, ctx = {}, history = []) {
  const messages = [];
  for (const h of history) {
    messages.push({ role: 'user', content: h.q }, { role: 'assistant', content: h.a });
  }
  messages.push({ role: 'user', content: contextText(ctx) + question });
  let lastFilters = ctx.filters || null;
  let lastItems = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callClaude(messages);
    messages.push({ role: 'assistant', content: reply.content });

    const calls = reply.content.filter((c) => c.type === 'tool_use');
    if (reply.stop_reason !== 'tool_use' || !calls.length) {
      const answer = reply.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      return { mode: 'claude', filters: lastFilters, items: lastItems.slice(0, 6), answer };
    }

    const results = calls.map((call) => {
      const out = call.name === 'search_cars' ? runTool(call.input)
        : call.name === 'get_cars' ? getCarsTool(call.input)
          : { result: { kļūda: 'nezināms rīks' } };
      if (out.items?.length) lastItems = out.items;
      if (out.filters) lastFilters = out.filters;
      return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out.result) };
    });
    messages.push({ role: 'user', content: results });
  }
  return { mode: 'claude', filters: lastFilters, items: lastItems.slice(0, 6), answer: 'Lūk, ko atradu.' };
}

// ---------------------------------------------------------------------------

function validateQuestion(q) {
  if (typeof q !== 'string') return 'Jautājumam jābūt tekstam';
  const t = q.trim();
  if (t.length < 2) return 'Uzraksti, kādu auto meklē';
  if (t.length > 400) return 'Jautājums ir par garu (max 400 simboli)';
  return null;
}

/**
 * Pārbauda lapas sūtīto kontekstu un sarunas vēsturi. Nederīgas daļas vienkārši izmet.
 */
function cleanContext(raw = {}) {
  const ctx = {};
  if (raw && typeof raw === 'object') {
    if (raw.filters && typeof raw.filters === 'object') {
      const v = validateListingQuery(Object.fromEntries(Object.entries(raw.filters)
        .filter(([, val]) => val !== null && val !== undefined && val !== '').map(([k, val]) => [k, String(val)])));
      if (v.ok && Object.keys(v.value).length) ctx.filters = v.value;
    }
    if (Array.isArray(raw.ids)) ctx.ids = raw.ids.filter((i) => typeof i === 'string' && ID_RE.test(i)).slice(0, 10);
    if (typeof raw.focus === 'string' && ID_RE.test(raw.focus)) ctx.focus = raw.focus;
  }
  return ctx;
}

function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-4)
    .filter((h) => h && typeof h.q === 'string' && typeof h.a === 'string')
    .map((h) => ({ q: h.q.slice(0, 400), a: h.a.slice(0, 1200) }));
}

async function ask(question, rawContext, rawHistory) {
  const q = question.trim();
  const ctx = cleanContext(rawContext);
  const history = cleanHistory(rawHistory);
  // Pirms Claude: aizskarošus jautājumus neapstrādājam vispār (arī lai par tiem nemaksātu API)
  if (ABUSE_RE.test(q)) return { mode: 'offline', intent: 'refused', filters: null, items: [], answer: ABUSE_TEXT };
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await claudeAnswer(q, ctx, history);
    } catch (err) {
      console.error('Claude kļūda, izmantoju bezsaistes režīmu:', err.message);
    }
  }
  return offlineAnswer(q, ctx);
}

module.exports = { ask, parseQuestion, offlineAnswer, validateQuestion, runTool, refineFilters, evaluate, compare, intentOf, cleanContext };
