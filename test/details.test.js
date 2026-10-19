const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseSslv, parseAutoscout, parseJsonLd, isAllowedUrl } = require('../src/scrapers/details');
const as24 = require('../src/scrapers/autoscout24');
const mobile = require('../src/scrapers/mobilede');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');

test('ss.lv detaļas: bildes, tehniskie dati, vieta; tālrunis netiek saglabāts', () => {
  const d = parseSslv(fx('sslv-detail.html'));
  assert.deepStrictEqual(d.photos, ['https://i.ss.lv/gallery/7/1/1.800.jpg', 'https://i.ss.lv/gallery/7/1/2.800.jpg']);
  assert.strictEqual(d.specs['Ātr.kārba'], 'Automāts 8 ātrumi');
  assert.strictEqual(d.seller.city, 'Rīga, Purvciems');
  assert.strictEqual(d.seller.type, 'privātpersona');
  assert.ok(!/29 123 456/.test(d.description), 'tālrunis aprakstā jāaizstāj');
  assert.ok(!JSON.stringify(d).includes('29***'));
});

test('AutoScout24 detaļas: dīleris + pilsēta, bez kontaktpersonas un tālruņa', () => {
  const d = parseAutoscout(fx('as24-detail.html'));
  assert.strictEqual(d.photos.length, 2);
  assert.strictEqual(d.seller.type, 'dīleris');
  assert.strictEqual(d.seller.name, 'Autohaus Beispiel GmbH');
  assert.strictEqual(d.seller.city, '10115 Berlin');
  assert.strictEqual(d.specs['Ātrumkārba'], 'Automatic');
  const json = JSON.stringify(d);
  assert.ok(!json.includes('Max Muster') && !json.includes('123456') && !json.includes('1234567'));
});

test('vispārīgais JSON-LD (schema.org) parsētājs', () => {
  const d = parseJsonLd(fx('jsonld-detail.html'));
  assert.strictEqual(d.seller.name, 'Autohaus Nord');
  assert.strictEqual(d.seller.city, '20095 Hamburg');
  assert.strictEqual(d.specs['Virsbūve'], 'Sedan');
  assert.ok(!JSON.stringify(d).includes('+49 40 999'));
});

test('pārdevējs jau saraksta datos (AutoScout24, mobile.de); privātpersonas vārds netiek glabāts', () => {
  const [dealer, priv] = as24.parseListPage(fx('as24-nextdata.html'));
  assert.deepStrictEqual(dealer.seller, { type: 'dīleris', name: 'Autohaus Beispiel GmbH', city: '10115 Berlin' });
  assert.deepStrictEqual(priv.seller, { type: 'privātpersona', name: null, city: 'Wien' });
  const [m] = mobile.parseListPage(fx('mobilede-state.html'), 'Audi');
  assert.strictEqual(m.seller.name, 'Autohaus Nord');
});

test('detaļas drīkst ielādēt tikai no atļautajām vietnēm (SSRF aizsardzība)', () => {
  assert.ok(isAllowedUrl('https://www.ss.lv/msg/lv/transport/cars/bmw/320/abc.html'));
  assert.ok(isAllowedUrl('https://www.autoscout24.com/offers/x'));
  assert.ok(isAllowedUrl('https://suchen.mobile.de/fahrzeuge/details.html?id=1'));
  assert.ok(!isAllowedUrl('http://www.ss.lv/x'));
  assert.ok(!isAllowedUrl('https://evil.com/?ss.lv'));
  assert.ok(!isAllowedUrl('https://ss.lv.evil.com/'));
  assert.ok(!isAllowedUrl('http://169.254.169.254/latest'));
});
