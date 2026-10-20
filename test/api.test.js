const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Testi raksta pagaidu mapē, nevis īstajos datos
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dealvo-'));
const app = require('../src/server');

let server, base;
test.before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
test.after(() => server.close());

const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('scenārijs 1: nederīga marka tiek noraidīta (nevar skrāpēt patvaļīgu URL)', async () => {
  const res = await post('/api/scrape', { make: '../../evil.com', pages: 1 });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.match(data.errors.join(), /nezināma marka/);
});

test('scenārijs 2: lapu skaits ārpus robežām tiek noraidīts', async () => {
  const res = await post('/api/scrape', { make: 'bmw', pages: 50 });
  assert.strictEqual(res.status, 400);
});

test('scenārijs 3: demo dati → filtrs pēc cenas un kārtošana pēc deal', async () => {
  await post('/api/demo', {});
  const res = await fetch(base + '/api/listings?maxPrice=8000&sort=deal&limit=500');
  const data = await res.json();
  assert.ok(data.total > 0);
  assert.ok(data.items.every((l) => l.price <= 8000));
  const scores = data.items.map((l) => l.dealScore).filter((s) => s != null);
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i - 1] >= scores[i], 'jābūt kārtotam dilstoši');
});

test('scenārijs 4: nederīgi filtri atgriež 400, nevis avāriju', async () => {
  const res = await fetch(base + '/api/listings?minYear=abc&maxPrice=-5&sort=drop table');
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.errors.length, 3);
});

test('scenārijs 5: atkārtota ielāde nedublē sludinājumus', async () => {
  const before = (await (await fetch(base + '/api/stats')).json()).total;
  const r = await (await post('/api/demo', {})).json();
  const after = (await (await fetch(base + '/api/stats')).json()).total;
  assert.strictEqual(r.added, 0);
  assert.strictEqual(before, after);
});

test('scenārijs 7: nezināms avots tiek noraidīts', async () => {
  const res = await post('/api/scrape', { make: 'bmw', pages: 1, sources: ['ebay'] });
  assert.strictEqual(res.status, 400);
});

test('scenārijs 8: AI asistents (bezsaistes režīms) atrod auto pēc teksta', async () => {
  const res = await post('/api/assistant', { question: 'Volkswagen līdz 8000 eur' });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.mode, 'offline');
  assert.ok(data.answer.length > 10);
  assert.ok(data.items.length > 0);
  assert.ok(data.items.every((l) => l.make === 'Volkswagen' && l.price <= 8000));
});

test('scenārijs 9: modeļu saraksts markai un filtrs pēc virsbūves un gadu diapazona', async () => {
  const models = await (await fetch(base + '/api/models?make=volkswagen')).json();
  assert.ok(models.some((m) => m.model === 'Golf' && m.count > 0));
  const data = await (await fetch(base + '/api/listings?body=apvidus&minYear=2015&maxYear=2020&limit=500')).json();
  assert.ok(data.total > 0);
  assert.ok(data.items.every((l) => l.body === 'apvidus' && l.year >= 2015 && l.year <= 2020));
  const bad = await fetch(base + '/api/listings?body=traktors');
  assert.strictEqual(bad.status, 400);
});

test('scenārijs 10: sludinājuma pilnais skats ar pārdevēju un līdzīgajiem auto', async () => {
  const list = await (await fetch(base + '/api/listings?sort=deal&limit=1')).json();
  const l = list.items[0];
  assert.strictEqual(l.details, undefined); // sarakstā detaļas nesūta
  const res = await fetch(`${base}/api/listing?source=${encodeURIComponent(l.source)}&id=${encodeURIComponent(l.externalId)}`);
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.ok(['dīleris', 'privātpersona'].includes(d.details.seller.type));
  assert.ok(d.details.seller.city);
  assert.ok(Array.isArray(d.similar));
  assert.strictEqual((await fetch(base + '/api/listing?source=x&id=../../etc')).status, 400);
  assert.strictEqual((await fetch(base + '/api/listing?source=ss.lv&id=nav')).status, 404);
});

test('GET /api/listings?below=1 atgriež tikai auto zem tirgus', async () => {
  const res = await fetch(`${base}/api/listings?below=1&limit=500`);
  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.ok(data.items.every((l) => l.dealScore >= 10));
  const bad = await fetch(`${base}/api/listings?below=abc`);
  assert.strictEqual(bad.status, 400);
});
