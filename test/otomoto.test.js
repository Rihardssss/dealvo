const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseListPage } = require('../src/scrapers/otomoto');
const { normalizeModel } = require('../src/makes');

const html = fs.readFileSync(path.join(__dirname, 'fixtures/otomoto-list.html'), 'utf8');

test('otomoto: sludinājumi no __NEXT_DATA__, cena eiro', () => {
  const items = parseListPage(html);
  assert.strictEqual(items.length, 3);
  const [a, b, c] = items;
  assert.strictEqual(a.source, 'otomoto');
  assert.strictEqual(a.make, 'BMW');
  assert.strictEqual(a.model, 'X3');
  assert.strictEqual(a.year, 2017);
  assert.strictEqual(a.mileage, 54740);
  assert.strictEqual(a.price, Math.round(52300 / 4.25 / 10) * 10); // PLN → EUR
  assert.strictEqual(a.fuel, 'benzīns');
  assert.strictEqual(a.seller.type, 'dīleris');
  assert.ok(a.image.startsWith('https://'));
  assert.strictEqual(b.price, 57000); // jau eiro
  assert.strictEqual(normalizeModel(c.model, c.make), '3. sērija');
  assert.strictEqual(a.engine, 3); // 2979 cm3 → 3 l (skaitlis, nevis teksts "3.0 l")
});

test('modeļu nosaukumi: Volvo "XC 60", Mazda "Mazda3", "Grand C-Max", "New Beetle"', () => {
  assert.strictEqual(normalizeModel('XC 60', 'Volvo'), 'XC60');
  assert.strictEqual(normalizeModel('XC90', 'Volvo'), 'XC90');
  assert.strictEqual(normalizeModel('V 70', 'Volvo'), 'V70');
  assert.strictEqual(normalizeModel('Mazda3', 'Mazda'), '3');
  assert.strictEqual(normalizeModel('Mazda 6', 'Mazda'), '6');
  assert.strictEqual(normalizeModel('CX-5', 'Mazda'), 'CX-5');
  assert.strictEqual(normalizeModel('Grand C-Max', 'Ford'), 'Grand C-Max');
  assert.strictEqual(normalizeModel('Grand Scenic', 'Renault'), 'Grand Scenic');
  assert.strictEqual(normalizeModel('New Beetle', 'Volkswagen'), 'New Beetle');
  assert.strictEqual(normalizeModel('IS 250', 'Lexus'), 'IS'); // Lexus dzinējs nav modelis
});

test('modeļu nosaukumi no citām valodām', () => {
  assert.strictEqual(normalizeModel('Seria 5', 'BMW'), '5. sērija');
  assert.strictEqual(normalizeModel('Klasa C', 'Mercedes-Benz'), 'C');
  assert.strictEqual(normalizeModel('E-Klasse', 'Mercedes'), 'E');
  assert.strictEqual(normalizeModel('320d', 'BMW'), '320');
});
