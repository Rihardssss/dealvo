const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Testi raksta pagaidu mapē, nevis īstajos datos
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dealradar-'));
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
