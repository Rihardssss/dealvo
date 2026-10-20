// AI asistenta saruna bezsaistes režīmā: turpinājums, salīdzināšana, novērtējums
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dealvo-chat-'));
delete process.env.ANTHROPIC_API_KEY;
const db = require('../src/db');
const demo = require('../src/scrapers/demo');
const assistant = require('../src/assistant');

db.upsert(demo.generate());
const ids = (items) => items.map((l) => `${l.source}:${l.externalId}`);

test('turpinājums: "un kaut ko lētāku?" samazina iepriekšējo cenu', async () => {
  const first = await assistant.ask('Volkswagen līdz 8000 eur');
  assert.strictEqual(first.filters.maxPrice, 8000);
  const next = await assistant.ask('un kaut ko lētāku?', { filters: first.filters, ids: ids(first.items) });
  assert.strictEqual(next.intent, 'refine');
  assert.strictEqual(next.filters.make, 'volkswagen');
  assert.ok(next.filters.maxPrice < 8000);
  assert.ok(next.items.every((l) => l.price <= next.filters.maxPrice));
});

test('turpinājums: cita marka saglabā pārējos filtrus', async () => {
  const next = await assistant.ask('un audi?', { filters: { make: 'volkswagen', maxPrice: 9000, fuel: 'dīzelis' } });
  assert.strictEqual(next.filters.make, 'audi');
  assert.strictEqual(next.filters.maxPrice, 9000);
  assert.strictEqual(next.filters.fuel, 'dīzelis');
});

test('salīdzināšana: "salīdzini pirmos divus" salīdzina rādītos auto', async () => {
  const first = await assistant.ask('BMW');
  const r = await assistant.ask('salīdzini pirmos divus', { filters: first.filters, ids: ids(first.items) });
  assert.strictEqual(r.intent, 'compare');
  assert.strictEqual(r.items.length, 2);
  assert.match(r.answer, /Salīdzinu/);
  assert.match(r.answer, /izvēlētos|līdzīgi labi/);
});

test('novērtējums: "vai šis ir labs pirkums?" par konkrētu auto', async () => {
  const first = await assistant.ask('Toyota');
  const focus = ids(first.items)[0];
  const r = await assistant.ask('vai šis ir labs pirkums?', { focus });
  assert.strictEqual(r.intent, 'evaluate');
  assert.strictEqual(ids(r.items)[0], focus);
  assert.match(r.answer, /Plusi|Mīnusi/);
});

test('nederīgs konteksts tiek ignorēts, nevis avarē', () => {
  const ctx = assistant.cleanContext({ filters: { maxPrice: 'abc' }, ids: ['../../x', 'ss.lv:123', 42], focus: "'; DROP" });
  assert.deepStrictEqual(ctx, { ids: ['ss.lv:123'] });
});
