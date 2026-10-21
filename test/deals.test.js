const test = require('node:test');
const assert = require('node:assert');
const { scoreListings, median } = require('../src/deals');

const car = (id, price, year = 2015, mileage = 150000, extra = {}) =>
  ({ source: 't', externalId: id, make: 'VW', model: 'Golf', year, mileage, price, ...extra });

test('mediāna', () => {
  assert.strictEqual(median([3, 1, 2]), 2);
  assert.strictEqual(median([1, 2, 3, 4]), 2.5);
  assert.strictEqual(median([]), null);
});

test('lēts auto tiek atzīmēts kā super deals', () => {
  const list = [car('a', 6000), car('b', 6200), car('c', 5800), car('d', 6100), car('cheap', 4500)];
  const cheap = scoreListings(list).find((l) => l.externalId === 'cheap');
  // tirgus = mediāna no 6000,6200,5800,6100 = 6050 → 4500 ir ~25.6% lētāk
  assert.strictEqual(cheap.marketPrice, 6050);
  assert.ok(cheap.dealScore > 25 && cheap.dealScore < 26);
  assert.strictEqual(cheap.dealLabel, 'super');
});

test('neviens absurds sludinājums nesabojā tirgus cenu (mediāna)', () => {
  const list = [car('a', 6000), car('b', 6100), car('c', 5900), car('troll', 999999), car('x', 6000)];
  const x = scoreListings(list).find((l) => l.externalId === 'x');
  assert.ok(x.marketPrice < 7000);
});

test('ja līdzīgo ir par maz, deal score netiek izdomāts', () => {
  const list = [car('a', 6000), car('b', 5000)];
  assert.strictEqual(scoreListings(list)[0].dealScore, null);
});

test('nesalīdzina ar citu modeli, citu gadu vai ļoti atšķirīgu nobraukumu', () => {
  const list = [
    car('target', 5000),
    car('old', 1000, 2005), car('old2', 1000, 2006), car('old3', 1000, 2004),
    car('km', 1000, 2015, 400000), car('km2', 1000, 2015, 390000), car('km3', 1000, 2015, 380000),
    car('passat', 1000, 2015, 150000, { model: 'Passat' }),
  ];
  const t = scoreListings(list).find((l) => l.externalId === 'target');
  assert.strictEqual(t.comparables, 0);
});

test('ja līdzīgo ir maz, meklē plašāk un pielāgo cenu pēc gada', () => {
  const car = (id, year, price, mileage = 150000) => ({ source: 'x', externalId: id, make: 'BMW', model: '320', year, price, mileage });
  const list = [car('a', 2010, 5000), car('b', 2013, 7000), car('c', 2007, 4000), car('d', 2014, 9000)];
  const [a] = scoreListings(list);
  assert.strictEqual(a.comparables, 3);
  assert.ok(a.marketPrice > 4000 && a.marketPrice < 7000, `tirgus cena ${a.marketPrice}`);
  assert.ok(a.dealScore != null);
});

test('bojāti auto un auto rezerves daļām netiek salīdzināti un nav "izdevīgākie"', () => {
  const c = (id, price, title) => ({ source: 'x', externalId: id, make: 'VW', model: 'Golf', year: 2012, price, mileage: 200000, title });
  const list = [c('a', 400, 'Golf uz daļām'), c('b', 5000, 'Golf'), c('c', 5200, 'Golf unfallfrei'), c('d', 4800, 'Golf bez defektiem'), c('e', 5100, 'Golf')];
  const scored = scoreListings(list);
  assert.strictEqual(scored[0].damaged, true);
  assert.strictEqual(scored[0].dealScore, null);
  assert.ok(scored.slice(1).every((l) => !l.damaged && l.comparables === 3));
});
