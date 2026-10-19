const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseListPage, parsePrice, parseMileage, parseEngine } = require('../src/scrapers/sslv');

const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'sslv-bmw.html'), 'utf8');

test('ss.lv: nolasa derīgos sludinājumus, izlaiž reklāmas un "maiņai"', () => {
  const items = parseListPage(html, 'BMW');
  assert.strictEqual(items.length, 3);
  assert.deepStrictEqual(items.map((i) => i.externalId), ['55001234', '55001235', '55001237']);
});

test('ss.lv: pareizi parsē laukus', () => {
  const [bmw320] = parseListPage(html, 'BMW');
  assert.strictEqual(bmw320.make, 'BMW');
  assert.strictEqual(bmw320.model, '320');
  assert.strictEqual(bmw320.year, 2012);
  assert.strictEqual(bmw320.price, 6500);
  assert.strictEqual(bmw320.mileage, 215000);
  assert.strictEqual(bmw320.fuel, 'dīzelis');
  assert.strictEqual(bmw320.url, 'https://www.ss.lv/msg/lv/transport/cars/bmw/320/abcd1.html');
});

test('ss.lv: trūkstošs nobraukums un elektroauto', () => {
  const items = parseListPage(html, 'BMW');
  assert.strictEqual(items[1].mileage, null);
  assert.strictEqual(items[2].fuel, 'elektro');
});

test('palīgfunkcijas', () => {
  assert.strictEqual(parsePrice('12,300  €'), 12300);
  assert.strictEqual(parsePrice('maiņai'), null);
  assert.strictEqual(parsePrice('15 €/dienā'), null);
  assert.strictEqual(parseMileage('99 tūkst.'), 99000);
  assert.strictEqual(parseMileage('-'), null);
  assert.deepStrictEqual(parseEngine('1.6'), { engine: 1.6, fuel: 'benzīns' });
});
