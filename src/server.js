const express = require('express');
const path = require('path');
const db = require('./db');
const demo = require('./scrapers/demo');
const { SOURCES, scrapeMake } = require('./scrapers');
const { scoreListings } = require('./deals');
const { searchListings, modelsFor } = require('./search');
const assistant = require('./assistant');
const { MAKE_TABLE } = require('./makes');
const { MAKES, validateScrapeRequest, validateListingQuery } = require('./validate');

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Vienkāršas drošības galvenes
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  next();
});

let scrapeInProgress = false;

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

app.get('/api/config', (req, res) => res.json({
  adminRequired: Boolean(ADMIN_TOKEN),
  assistant: process.env.ANTHROPIC_API_KEY ? 'claude' : 'offline',
  sources: Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label, country: s.country })),
}));

app.get('/api/makes', (req, res) => {
  res.json(Object.entries(MAKES).map(([slug, name]) => ({ slug, name })));
});

app.get('/api/models', (req, res) => {
  const make = String(req.query.make || '').toLowerCase();
  if (!MAKES[make]) return res.status(400).json({ errors: ['make: nezināma marka'] });
  res.json(modelsFor(make));
});

app.get('/api/listings', (req, res) => {
  const v = validateListingQuery(req.query);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  res.json(searchListings(v.value));
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
  res.json(await assistant.ask(req.body.question));
});

app.get('/api/stats', (req, res) => {
  const scored = scoreListings(db.all());
  const bySource = {};
  for (const l of scored) bySource[l.source] = (bySource[l.source] || 0) + 1;
  res.json({
    total: scored.length,
    bySource,
    superDeals: scored.filter((l) => l.dealLabel === 'super').length,
    goodDeals: scored.filter((l) => l.dealLabel === 'labs').length,
    priceDrops: scored.filter((l) => l.priceHistory?.length && l.price < l.priceHistory.at(-1).price).length,
  });
});

app.post('/api/scrape', requireAdmin, async (req, res) => {
  const v = validateScrapeRequest(req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  if (scrapeInProgress) return res.status(429).json({ errors: ['Skrāpēšana jau notiek, pagaidi'] });

  scrapeInProgress = true;
  try {
    const { make, pages, sources } = v.value;
    const { items, report } = await scrapeMake(MAKE_TABLE[make], sources, pages);
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
  console.error(err);
  res.status(err.status || 500).json({ errors: ['Servera kļūda'] });
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`DealRadar darbojas: http://localhost:${PORT}`));
}

module.exports = app;
