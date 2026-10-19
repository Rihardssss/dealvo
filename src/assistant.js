// AI asistents: lietotājs raksta parastā valodā ("dīzeļa universālis līdz 6000 pēc 2012"),
// asistents atrod piemērotākos auto mūsu datos un paskaidro, kāpēc tie ir labi.
//
// Divi režīmi:
//  1. Claude (ja ir ANTHROPIC_API_KEY) — modelis pats izsauc rīku search_cars ar filtriem,
//     saņem rezultātus no MŪSU datubāzes un uzraksta atbildi. Modelis neko neizdomā,
//     jo redz tikai to, ko atgriež rīks.
//  2. Bezsaistes (bez atslēgas vai ja API nav pieejams) — vienkāršs latviešu valodas
//     parsētājs izvelk filtrus no teksta. Tā prezentācija strādā vienmēr.

const { searchListings } = require('./search');
const { validateListingQuery, MAKES } = require('./validate');

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
    if (new RegExp(`[\\s,.]${word.replace(/[-]/g, '\\-')}[\\s,.]`).test(t)) { f.make = slug; break; }
  }

  const price = t.match(/(?:līdz|max|maks\.?|zem|lētāk(?:s|u)? par|budžets?)\s*([\d\s.,]+k?)\s*(?:€|eur|eiro)?/)
    || t.match(/([\d\s.,]+k?)\s*(?:€|eur|eiro)/)
    || t.match(/\s(\d{1,3}(?:[.,]\d)?k)(?=[\s,.]|$)/);
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

  const yearFrom = t.match(/(?:pēc|no|sākot no|jaunāk(?:s|u)? par|vismaz)\s*(19[89]\d|20[0-3]\d)/) || t.match(/(19[89]\d|20[0-3]\d)\s*\+/);
  if (yearFrom) f.minYear = Number(yearFrom[1]) + (/pēc|jaunāk/.test(yearFrom[0]) ? 1 : 0);
  const yearTo = t.match(/(?:līdz|ne jaunāk(?:s|u)? par)\s*(19[89]\d|20[0-3]\d)\s*(?:g|gad)/);
  if (yearTo) f.maxYear = Number(yearTo[1]);
  if (/jaun(s|u|āk)\b|jauns auto/.test(t) && !f.minYear) f.minYear = CURRENT_YEAR - 5;

  if (/dīze[lļ]|dize[lļ]|diesel/.test(t)) f.fuel = 'dīzelis';
  else if (/benzīn|benzin/.test(t)) f.fuel = 'benzīns';
  else if (/hibrīd|hibrid|hybrid/.test(t)) f.fuel = 'hibrīds';
  else if (/elektr|electric|\bev\b/.test(t)) f.fuel = 'elektro';

  const bodies = [
    [/univers|kombi/, 'universālis'], [/apvid|suv|džip|dzip|krosover/, 'apvidus'], [/sedan/, 'sedans'],
    [/hečbek|hecbek|hatch/, 'hečbeks'], [/miniven|ģimenes auto|vens\b/, 'minivens'],
    [/kupej|coupe/, 'kupeja'], [/kabriol|cabrio/, 'kabriolets'],
  ];
  for (const [re, body] of bodies) if (re.test(t)) { f.body = body; break; }

  if (/mazs? nobrauk|maz nobrauk|mazāko nobrauk/.test(t)) f.sort = 'mileage';
  else if (/lētāk|lētu|lēts|lēti/.test(t) && !/deal|izdevīg|atlaid/.test(t)) f.sort = 'price';
  else if (/jaunāk/.test(t) && !f.minYear) f.sort = 'year';
  else f.sort = 'deal';

  return f;
}

function describeFilters(f) {
  const parts = [];
  if (f.make) parts.push(MAKES[f.make]);
  if (f.model) parts.push(f.model);
  if (f.fuel) parts.push(f.fuel);
  if (f.body) parts.push(f.body);
  if (f.minYear) parts.push(`no ${f.minYear}. gada`);
  if (f.maxYear) parts.push(`līdz ${f.maxYear}. gadam`);
  if (f.maxPrice) parts.push(`līdz ${eur(f.maxPrice)}`);
  if (f.maxMileage) parts.push(`līdz ${fmt.format(f.maxMileage)} km`);
  return parts.join(', ');
}

function offlineAnswer(question) {
  const filters = parseQuestion(question);
  const { total, items } = searchListings({ ...filters, limit: 6 });
  const what = describeFilters(filters);

  if (!total) {
    return {
      mode: 'offline',
      filters,
      items: [],
      answer: `Neatradu nevienu auto${what ? ` (${what})` : ''}. Pamēģini palielināt budžetu vai noņemt kādu nosacījumu.`,
    };
  }
  const best = items[0];
  const lines = [`Atradu ${total} auto${what ? ` (${what})` : ''}.`];
  if (best.dealScore != null && best.dealScore > 0) {
    lines.push(
      `Izdevīgākais ir ${best.make} ${best.model}, ${best.year}, par ${eur(best.price)}. ` +
      `Līdzīgi auto maksā ap ${eur(best.marketPrice)}, tātad tas ir par ${fmt.format(best.dealScore)}% lētāks.`
    );
  } else {
    lines.push(`Pirmais sarakstā ir ${best.make} ${best.model}, ${best.year}, par ${eur(best.price)}.`);
  }
  if (best.mileage > 300000) lines.push('Tam ir liels nobraukums, tāpēc pirms pirkšanas vērts pārbaudīt servisa vēsturi.');
  return { mode: 'offline', filters, items, answer: lines.join(' ') };
}

// ---------------------------------------------------------------------------
// Claude režīms
// ---------------------------------------------------------------------------

const SYSTEM = `Tu esi DealRadar asistents. DealRadar salīdzina lietotu auto sludinājumus no ss.lv, AutoScout24 un mobile.de un aprēķina, cik katrs auto ir lētāks vai dārgāks par līdzīgiem auto (dealScore procentos; pozitīvs = lētāk par tirgu).

Noteikumi:
- Lai atrastu auto, VIENMĒR izsauc rīku search_cars. Nekad neizdomā auto, cenas vai sludinājumus — runā tikai par to, ko atgrieza rīks.
- Ja rezultātu nav, pamēģini vēlreiz ar mīkstākiem filtriem (piem. lielāks budžets), ne vairāk kā 2 reizes.
- Atbildi latviski, īsi (2–5 teikumi), draudzīgi. Ieteic 1–3 konkrētus auto ar cenu, gadu un to, cik % tie ir lētāki par tirgu.
- Ja auto ir ļoti liels nobraukums vai aizdomīgi zema cena (vairāk kā 35% zem tirgus), iesaki to pārbaudīt pirms pirkšanas.
- Ja jautājums nav par auto meklēšanu, pieklājīgi pasaki, ka palīdzi tikai ar auto meklēšanu DealRadar datos.
- Tu neesi finanšu konsultants; nesoli, ka darījums noteikti ir labs.`;

const TOOLS = [{
  name: 'search_cars',
  description: 'Meklē auto DealRadar datubāzē. Atgriež kopējo skaitu un līdz 8 labākajiem rezultātiem ar cenu, tirgus cenu un dealScore.',
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
});

function runTool(input) {
  // Modeļa ievadi validējam tāpat kā lietotāja ievadi — modelim neuzticamies vairāk
  const v = validateListingQuery(Object.fromEntries(
    Object.entries(input || {}).filter(([, val]) => val !== null && val !== undefined).map(([k, val]) => [k, String(val)])
  ));
  if (!v.ok) return { filters: null, result: { kļūdas: v.errors } };
  const { total, items } = searchListings({ ...v.value, limit: 8 });
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

async function claudeAnswer(question) {
  const messages = [{ role: 'user', content: question }];
  let lastFilters = null;
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
      const out = call.name === 'search_cars' ? runTool(call.input) : { result: { kļūda: 'nezināms rīks' } };
      if (out.items?.length) { lastItems = out.items; lastFilters = out.filters; }
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

async function ask(question) {
  const q = question.trim();
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await claudeAnswer(q);
    } catch (err) {
      console.error('Claude kļūda, izmantoju bezsaistes režīmu:', err.message);
    }
  }
  return offlineAnswer(q);
}

module.exports = { ask, parseQuestion, offlineAnswer, validateQuestion, runTool };
