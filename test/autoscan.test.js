const test = require('node:test');
const assert = require('node:assert');
const { createAutoScan } = require('../src/autoscan');

function fakeDb() {
  let rows = [{ source: 'demo-auto.lv', externalId: 'd1', make: 'BMW', lastSeen: new Date().toISOString() }];
  return {
    all: () => rows,
    upsert: (items) => { rows.push(...items); return { added: items.length, updated: 0, priceDrops: 0 }; },
    clearDemo: () => { const n = rows.length; rows = rows.filter((r) => !r.source.startsWith('demo')); return n - rows.length; },
    prune: () => 0,
  };
}
const makes = { bmw: { name: 'BMW' }, audi: { name: 'Audi' } };

test('automātiskā skenēšana: veca marka tiek atjaunota, svaiga nē, un demo dati pazūd', async () => {
  const db = fakeDb();
  const calls = [];
  const scrape = async (make) => {
    calls.push(make.name);
    return { items: [{ source: 'ss.lv', externalId: 'x', make: make.name, lastSeen: new Date().toISOString() }], report: [] };
  };
  const auto = createAutoScan({ db, scrape, makes, sources: ['sslv'], log: () => {} });

  assert.strictEqual(auto.ensureFresh('bmw'), true); // nekad nav skenēta
  await new Promise((r) => setTimeout(r, 10));
  assert.deepStrictEqual(calls, ['BMW']);
  assert.ok(db.all().every((r) => !r.source.startsWith('demo')));
  assert.strictEqual(auto.ensureFresh('bmw'), false); // tikko atjaunota
  assert.strictEqual(auto.nextMake(), 'audi'); // fonā nākamā ir tā, kas visilgāk nav skenēta
  assert.strictEqual(auto.ensureFresh('nav-tadas'), false);
});

test('automātiskā skenēšana: vienlaikus tikai viena', async () => {
  let release;
  const scrape = () => new Promise((r) => { release = () => r({ items: [], report: [] }); });
  const auto = createAutoScan({ db: fakeDb(), scrape, makes, sources: ['sslv'], log: () => {} });
  auto.ensureFresh('bmw');
  assert.strictEqual(auto.status().running, 'BMW');
  assert.strictEqual(auto.ensureFresh('audi'), false);
  release();
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(auto.status().running, null);
});
