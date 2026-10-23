const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi');
const db = require('./db');
const demo = require('./scrapers/demo');
const { SOURCES, scrapeMake } = require('./scrapers');
const search = require('./search');
const { searchListings, modelsFor } = search;
const assistant = require('./assistant');
const translate = require('./translate');
const { getListing } = require('./listing-details');
const { createAutoScan } = require('./autoscan');
const { MAKE_TABLE } = require('./makes');
const { MAKES, validateScrapeRequest, validateListingQuery } = require('./validate');

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '10kb' }));
// Lapa: app.js un app.css saitēm pieliekam versiju (?v=...), lai pēc atjaunināšanas
// pārlūks un Cloudflare neizmantotu vecos failus no keša.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VERSION = Date.now().toString(36);
const fs = require('fs');
function sendIndex(req, res) {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
    .replace(/(href|src)="(app\.(?:css|js))"/g, `$1="$2?v=${VERSION}"`);
  res.set('Cache-Control', 'no-cache').type('html').send(html);
}
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, file) => {
    if (/\.(js|css)$/.test(file)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

// Vienkāršas drošības galvenes
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  next();
});

let scrapeInProgress = false;

// Automātiskā skenēšana (izslēgt: AUTO_SCAN=0). mobile.de pēc noklusējuma neiekļauts, jo bloķē.
const AUTO_SCAN = process.env.AUTO_SCAN !== '0' && require.main === module;
const autoscan = createAutoScan({
  db,
  scrape: scrapeMake,
  makes: MAKE_TABLE,
  sources: (process.env.AUTO_SCAN_SOURCES || 'sslv,autoscout24,otomoto').split(',').map((s) => s.trim()).filter((s) => SOURCES[s]),
  // Lapas katram avotam: ss.lv ~30 auto lapā, AutoScout24 20 auto lapā
  pages: process.env.AUTO_SCAN_PAGES
    ? Number(process.env.AUTO_SCAN_PAGES)
    : { sslv: 5, autoscout24: 10, mobilede: 2, otomoto: 8 },
  staleMinutes: Number(process.env.AUTO_SCAN_STALE_MINUTES) || 60,
});

// Admin aizsardzība: kad lapa ir publiska internetā, datus mainīt (skenēt, ielādēt demo,
// dzēst) var tikai ar ADMIN_TOKEN. Lokāli bez ADMIN_TOKEN viss ir atļauts.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const crypto = require('crypto');
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const given = Buffer.from(String(req.get('x-admin-token') || ''));
  const expected = Buffer.from(ADMIN_TOKEN);
  if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return next();
  res.status(401).json({ errors: ['Nepareiza admin parole'] });
}

// Vienkāršs pieprasījumu limits: max 120 pieprasījumi minūtē no vienas IP
const hits = new Map();
app.use('/api', (req, res, next) => {
  const ip = req.get('cf-connecting-ip') || req.ip;
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > 60_000) { h.n = 0; h.t = now; }
  h.n++;
  hits.set(ip, h);
  if (h.n > 120) return res.status(429).json({ errors: ['Pārāk daudz pieprasījumu, pagaidi minūti'] });
  next();
});

// API dokumentācija, kurā var izmēģināt pieprasījumus: /api-docs (apraksts: /api/openapi.json, src/openapi.js).
// swaggerUrl ir fiksēts, tāpēc ar ?url=... saitē nevar ielādēt svešu aprakstu.
app.get('/api/openapi.json', (req, res) => res.json(openapi));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
  swaggerUrl: '/api/openapi.json',
  customSiteTitle: 'Dealvo API',
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: { tryItOutEnabled: true, displayRequestDuration: true, persistAuthorization: true },
}));

app.get('/api/config', (req, res) => res.json({
  adminRequired: Boolean(ADMIN_TOKEN),
  assistant: process.env.ANTHROPIC_API_KEY ? 'claude' : 'offline',
  sources: Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label, country: s.country })),
}));

app.get('/api/makes', (req, res) => {
  const counts = db.makeCounts();
  res.json(Object.entries(MAKES).map(([slug, name]) => ({ slug, name, count: counts[name] || 0 })));
});

app.get('/api/models', (req, res) => {
  const make = String(req.query.make || '').toLowerCase();
  if (!MAKES[make]) return res.status(400).json({ errors: ['make: nezināma marka'] });
  res.json(modelsFor(make));
});

// Viena sludinājuma pilnais skats (detaļas tiek ielādētas no oriģinālās lapas un saglabātas 24 h)
const detailHits = new Map();
app.get('/api/listing', async (req, res) => {
  const source = String(req.query.source || '');
  const id = String(req.query.id || '');
  if (!/^[\p{L}\p{N}.\-]{2,30}$/u.test(source) || !/^[\w\-]{1,64}$/.test(id)) {
    return res.status(400).json({ errors: ['Nederīgs sludinājuma identifikators'] });
  }
  const ip = req.get('cf-connecting-ip') || req.ip;
  const now = Date.now();
  const recent = (detailHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) return res.status(429).json({ errors: ['Pārāk daudz pieprasījumu, pagaidi minūti'] });
  detailHits.set(ip, [...recent, now]);

  try {
    const listing = await getListing(source, id);
    if (!listing) return res.status(404).json({ errors: ['Sludinājums nav atrasts'] });
    res.json(listing);
  } catch (err) {
    console.error(`[listing] ${source}:${id}`, err);
    res.status(500).json({ errors: ['Neizdevās atvērt sludinājumu, mēģini vēlreiz'] });
  }
});

app.get('/api/listings', (req, res) => {
  const v = validateListingQuery(req.query);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  // Ja lietotājs skatās marku ar veciem datiem, atjaunojam to fonā
  const refreshing = AUTO_SCAN && v.value.make ? autoscan.ensureFresh(v.value.make) : false;
  res.json({ ...searchListings(v.value), refreshing });
});

// AI asistents — atsevišķs, stingrāks limits (katrs pieprasījums var maksāt API naudu)
const askHits = new Map();
app.post('/api/assistant', async (req, res) => {
  const err = assistant.validateQuestion(req.body?.question);
  if (err) return res.status(400).json({ errors: [err] });
  const ip = req.get('cf-connecting-ip') || req.ip;
  const now = Date.now();
  const recent = (askHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return res.status(429).json({ errors: ['Pārāk daudz jautājumu, pagaidi minūti'] });
  askHits.set(ip, [...recent, now]);
  try {
    res.json(await assistant.ask(req.body.question, req.body.context, req.body.history));
  } catch (err) {
    console.error('[assistant]', err);
    res.status(500).json({ errors: ['Asistents šobrīd nevar atbildēt, mēģini vēlreiz'] });
  }
});

// Tulkošana (lapas valodas izvēle un "Tulkot aprakstu")
app.post('/api/translate', async (req, res) => {
  const v = translate.validateTranslate(req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  try {
    res.json({ texts: await translate.translateTexts(v.value.texts, v.value.to) });
  } catch (err) {
    console.error('Tulkošanas kļūda:', err.message);
    res.status(502).json({ errors: ['Tulkošana šobrīd nav pieejama'] });
  }
});

app.get('/api/scan-status', (req, res) => res.json({ enabled: AUTO_SCAN, ...autoscan.status() }));

app.get('/api/stats', (req, res) => {
  res.json({ ...search.stats(), bySource: db.countBySource(), lastScanAt: autoscan.status().lastScanAt });
});

app.post('/api/scrape', requireAdmin, async (req, res) => {
  const v = validateScrapeRequest(req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  if (scrapeInProgress) return res.status(429).json({ errors: ['Skrāpēšana jau notiek, pagaidi'] });

  scrapeInProgress = true;
  try {
    const { make, pages, sources } = v.value;
    const { items, report } = await scrapeMake(MAKE_TABLE[make], sources, pages);
    if (items.length) db.clearDemo();
    const result = db.upsert(items);
    res.json({ found: items.length, ...result, report });
  } catch (err) {
    console.error(err);
    res.status(502).json({ errors: [`Neizdevās nolasīt datus: ${err.message}`] });
  } finally {
    scrapeInProgress = false;
  }
});

app.post('/api/demo', requireAdmin, (req, res) => {
  const result = db.upsert(demo.generate());
  res.json({ source: 'demo', ...result });
});

app.delete('/api/listings', requireAdmin, (req, res) => {
  db.clear();
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  // Nederīgs JSON vai pārāk liels pieprasījums ir klienta kļūda, nevis servera
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ errors: ['Nederīgs pieprasījums'] });
  console.error(err);
  res.status(500).json({ errors: ['Servera kļūda'] });
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Dealvo darbojas: http://localhost:${PORT}`));
  if (AUTO_SCAN) autoscan.start(Number(process.env.AUTO_SCAN_MINUTES) || 3);
}

module.exports = app;

// Ja kaut kur paliek nenoķerta kļūda, to pierakstām žurnālā, nevis apturam visu serveri
process.on('unhandledRejection', (err) => console.error('[nenoķerta kļūda]', err));
