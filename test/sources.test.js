const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const as24 = require('../src/scrapers/autoscout24');
const mobile = require('../src/scrapers/mobilede');
const { normalizeMake, normalizeModel } = require('../src/makes');
const { fuelLv } = require('../src/scrapers/http');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');

test('AutoScout24: nolasa sludinājumus no __NEXT_DATA__ JSON', () => {
  const items = as24.parseListPage(fx('as24-nextdata.html'));
  assert.strictEqual(items.length, 2); // trešajam nav cenas → izlaists
  const [a, b] = items;
  assert.strictEqual(a.make, 'BMW');
  assert.strictEqual(a.model, '320');
  assert.strictEqual(a.price, 11490);
  assert.strictEqual(a.mileage, 148000);
  assert.strictEqual(a.year, 2016);
  assert.strictEqual(a.fuel, 'dīzelis');
  assert.strictEqual(a.url, 'https://www.autoscout24.com/offers/bmw-320-d-touring-diesel-black-a1b2c3');
  assert.match(a.image, /^https:\/\//);
  assert.strictEqual(b.fuel, 'hibrīds');
  assert.strictEqual(b.country, 'AT');
});

test('AutoScout24: rezerves variants no <article data-*> atribūtiem', () => {
  const items = as24.parseListPage(fx('as24-articles.html'));
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].make, 'Volkswagen');
  assert.strictEqual(items[0].price, 8990);
  assert.strictEqual(items[0].year, 2014);
});

test('mobile.de: nolasa sludinājumus no window.__INITIAL_STATE__', () => {
  const items = mobile.parseListPage(fx('mobilede-state.html'), 'Audi');
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].model, 'A4');
  assert.strictEqual(items[0].price, 12990);
  assert.strictEqual(items[0].mileage, 135000);
  assert.strictEqual(items[0].year, 2017);
  assert.strictEqual(items[0].url, 'https://suchen.mobile.de/fahrzeuge/details.html?id=381234567');
  assert.strictEqual(items[1].fuel, 'benzīns');
});

test('dažādu avotu nosaukumi tiek normalizēti salīdzināšanai', () => {
  assert.strictEqual(normalizeMake('Mercedes-Benz'), 'Mercedes');
  assert.strictEqual(normalizeMake('VW'), 'Volkswagen');
  assert.strictEqual(normalizeModel('320d'), '320');
  assert.strictEqual(normalizeModel('Golf VII'), 'Golf');
  assert.strictEqual(normalizeModel('A4'), 'A4');
  assert.strictEqual(fuelLv('Electric/Gasoline'), 'hibrīds');
  assert.strictEqual(fuelLv('d'), 'dīzelis');
});

test('virsbūve tiek noteikta pēc avota datiem vai modeļa', () => {
  const { bodyFor, bodyLv } = require('../src/makes');
  assert.strictEqual(bodyFor('Volkswagen', 'Golf VII'), 'hečbeks');
  assert.strictEqual(bodyFor('Mercedes-Benz', 'GLC300'), 'apvidus');
  assert.strictEqual(bodyFor('BMW', '320d'), 'sedans');
  assert.strictEqual(bodyLv('Station wagon'), 'universālis');
  assert.strictEqual(normalizeModel('C220', 'Mercedes'), 'C');
});
