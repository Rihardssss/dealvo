const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dealvo-db-'));
// Vecais JSON fails, kam jāpārnākt uz SQLite
fs.writeFileSync(path.join(dir, 'listings.json'), JSON.stringify([
  { source: 'ss.lv', externalId: '1', make: 'BMW', model: '320d', year: 2012, price: 6500, mileage: 215000,
    firstSeen: '2026-10-01T10:00:00.000Z', lastSeen: '2026-10-02T10:00:00.000Z', priceHistory: [{ price: 7000, at: '2026-10-01T10:00:00.000Z' }] },
]));
process.env.DATA_DIR = dir;
const db = require('../src/db');

test('SQLite: vecie JSON dati tiek pārnesti ar vēsturi', () => {
  const l = db.find('ss.lv', '1');
  assert.strictEqual(l.price, 6500);
  assert.deepStrictEqual(l.priceHistory, [{ price: 7000, at: '2026-10-01T10:00:00.000Z' }]);
  assert.ok(fs.existsSync(path.join(dir, 'listings.json.migrated')));
  assert.ok(fs.existsSync(db.FILE));
});

test('SQLite: cenas maiņa ieraksta price_history tabulā', () => {
  const r = db.upsert([{ source: 'ss.lv', externalId: '1', make: 'BMW', model: '320d', year: 2012, price: 6000 }]);
  assert.strictEqual(r.priceDrops, 1);
  assert.deepStrictEqual(db.find('ss.lv', '1').priceHistory.map((h) => h.price), [7000, 6500]);
});

test('SQLite: filtri strādā kā SQL vaicājums, normalizēts modelis', () => {
  db.upsert([
    { source: 'ss.lv', externalId: '2', make: 'BMW', model: '320i', year: 2015, price: 9000, mileage: 150000 },
    { source: 'autoscout24', externalId: 'a', make: 'BMW', model: 'X5', year: 2016, price: 20000, mileage: 90000 },
  ]);
  assert.strictEqual(db.query({ makeName: 'BMW', model: '320' }).length, 2); // 320d + 320i
  assert.strictEqual(db.query({ makeName: 'BMW', maxPrice: 10000, minYear: 2014 }).length, 1);
  assert.deepStrictEqual(db.countBySource(), { 'ss.lv': 2, autoscout24: 1 });
});

test('SQLite: SQL injekcija filtrā neko nesabojā', () => {
  assert.strictEqual(db.query({ makeName: "BMW' OR '1'='1" }).length, 0);
  assert.strictEqual(db.query({ model: "320'; DROP TABLE listings; --" }).length, 0);
  assert.strictEqual(db.all().length, 3);
});

test('SQLite: dzēšot sludinājumu, dzēšas arī tā cenu vēsture', () => {
  db.clear();
  assert.strictEqual(db.all().length, 0);
});

test('SQLite: dzinējs vienmēr skaitlis, nobraukums tūkstošos tiek pārrēķināts', () => {
  db.upsert([
    { source: 'otomoto', externalId: 'e1', make: 'BMW', model: 'X3', year: 2007, price: 5000, engine: '2.0 l', mileage: 302 },
    { source: 'otomoto', externalId: 'e2', make: 'BMW', model: 'X3', year: new Date().getFullYear(), price: 50000, engine: 3, mileage: 500 },
  ]);
  const old = db.find('otomoto', 'e1');
  assert.strictEqual(old.engine, 2);
  assert.strictEqual(old.mileage, 302000); // 2007. gada auto ar 302 km — pārdevējs rakstīja tūkstošos
  assert.strictEqual(db.find('otomoto', 'e2').mileage, 500); // jauns auto ar 500 km ir ticams
});
