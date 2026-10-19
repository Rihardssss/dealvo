const express = require('express');
const path = require('path');
const db = require('./db');
const sslv = require('./scrapers/sslv');
const demo = require('./scrapers/demo');
const { scoreListings } = require('./deals');
const { MAKES, validateScrapeRequest, validateListingQuery } = require('./validate');

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Vienkāršas drošības galvenes
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  next();
});

let scrapeInProgress = false;

app.get('/api/makes', (req, res) => {
  res.json(Object.entries(MAKES).map(([slug, name]) => ({ slug, name })));
});

app.get('/api/listings', (req, res) => {
  const v = validateListingQuery(req.query);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  const f = v.value;

  let items = scoreListings(db.all());
  if (f.make) items = items.filter((l) => l.make.toLowerCase() === MAKES[f.make].toLowerCase());
  if (f.model) items = items.filter((l) => (l.model || '').toLowerCase().includes(f.model.toLowerCase()));
  if (f.minYear) items = items.filter((l) => l.year >= f.minYear);
  if (f.maxYear) items = items.filter((l) => l.year <= f.maxYear);
  if (f.maxPrice) items = items.filter((l) => l.price <= f.maxPrice);
  if (f.maxMileage) items = items.filter((l) => l.mileage != null && l.mileage <= f.maxMileage);

  const sorters = {
    deal: (a, b) => (b.dealScore ?? -Infinity) - (a.dealScore ?? -Infinity),
    price: (a, b) => a.price - b.price,
    year: (a, b) => b.year - a.year,
    mileage: (a, b) => (a.mileage ?? Infinity) - (b.mileage ?? Infinity),
    newest: (a, b) => String(b.firstSeen).localeCompare(String(a.firstSeen)),
  };
  items.sort(sorters[f.sort || 'deal']);

  res.json({ total: items.length, items: items.slice(0, f.limit || 60) });
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

app.post('/api/scrape', async (req, res) => {
  const v = validateScrapeRequest(req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  if (scrapeInProgress) return res.status(429).json({ errors: ['Skrāpēšana jau notiek, pagaidi'] });

  scrapeInProgress = true;
  try {
    const items = await sslv.fetchMake(v.value.make, MAKES[v.value.make], v.value.pages);
    const result = db.upsert(items);
    res.json({ source: 'ss.lv', found: items.length, ...result });
  } catch (err) {
    console.error(err);
    res.status(502).json({ errors: [`Neizdevās nolasīt ss.lv: ${err.message}`] });
  } finally {
    scrapeInProgress = false;
  }
});

app.post('/api/demo', (req, res) => {
  const result = db.upsert(demo.generate());
  res.json({ source: 'demo', ...result });
});

app.delete('/api/listings', (req, res) => {
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
