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

test('ar auto nesaistīts jautājums nesaņem nejaušu auto sarakstu', async () => {
  for (const q of ['tu esi gejs?', 'kāds šodien laiks?', 'pastāsti joku']) {
    const r = await assistant.ask(q);
    assert.strictEqual(r.intent, 'off-topic', q);
    assert.strictEqual(r.items.length, 0);
    assert.strictEqual(r.filters, null);
  }
  // Bez filtriem, bet par auto — joprojām meklē
  assert.ok((await assistant.ask('parādi izdevīgākos auto')).items.length > 0);
});

test('aizskarošs jautājums tiek noraidīts, arī ja tajā ir vārds "auto"', async () => {
  for (const q of ['man vajag auto lai parvadatu 30 niggerus', 'N1GG3R auto', 'kur pirkt auto pidariem']) {
    const r = await assistant.ask(q, { filters: { make: 'bmw' }, ids: ['demo:1'] });
    assert.strictEqual(r.intent, 'refused', q);
    assert.strictEqual(r.items.length, 0);
    assert.strictEqual(r.filters, null);
  }
  // Parasti vārdi netiek uzskatīti par apvainojumiem
  for (const q of ['negribu dārgu auto', 'auto no Nigērijas', 'Nigeria', 'žigulis līdz 2000']) {
    assert.notStrictEqual((await assistant.ask(q)).intent, 'refused', q);
  }
});

test('daudz pasažieru: minivens, un par 9 vairāk — paskaidro, ka vajag autobusu', async () => {
  assert.strictEqual(assistant.parseQuestion('auto 7 cilvēkiem').body, 'minivens');
  assert.strictEqual(assistant.parseQuestion('man vajag auto lai pārvadātu 30 cilvēkus').body, 'minivens');
  // Paskaidrojums ir arī tad, ja minivenu nav un meklēšana tiek atvieglota
  assert.match((await assistant.ask('man vajag auto lai pārvadātu 30 cilvēkus')).answer, /autobus/);
});

test('aizdomīgi lēts auto nav izdevīgāko augšā un asistents to neiesaka', async () => {
  const search = require('../src/search');
  const l = (id, price) => ({ source: 'ss.lv', externalId: `susp-${id}`, make: 'Lexus', model: 'Testmodelis', year: 2015, mileage: 150000, price, title: 'Lexus Testmodelis' });
  db.upsert([l(1, 15000), l(2, 15500), l(3, 14500), l(4, 15200), l('fake', 900)]);
  const fake = 'ss.lv:susp-fake';
  const keyOf = (x) => `${x.source}:${x.externalId}`;

  const byPrice = search.searchListings({ make: 'lexus', model: 'Testmodelis', sort: 'price' }).items;
  assert.strictEqual(keyOf(byPrice[0]), fake); // sarakstā pēc cenas tas ir, bet atzīmēts
  assert.strictEqual(byPrice[0].suspicious, true);
  const byDeal = search.searchListings({ make: 'lexus', model: 'Testmodelis', sort: 'deal' }).items;
  assert.strictEqual(keyOf(byDeal.at(-1)), fake);
  assert.ok(!search.searchListings({ make: 'lexus', below: true }).items.some((x) => keyOf(x) === fake));

  for (const q of ['lēts lexus testmodelis', 'lexus testmodelis']) {
    const r = await assistant.ask(q);
    assert.ok(r.items.length > 0, q);
    assert.ok(!r.items.some((x) => x.suspicious), q);
  }
  const ev = await assistant.ask('vai šis ir labs pirkums?', { focus: fake });
  assert.match(ev.answer, /Mīnusi: cena ir par \d/);
  assert.match(ev.answer, /aizdomīgi zema/);
});
