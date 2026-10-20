const test = require('node:test');
const assert = require('node:assert');
const { descText } = require('../src/scrapers/details');

test('apraksts: HTML tagi un entītijas kļūst par tīru tekstu', () => {
  const raw = '<strong>Fahrzeug mit Mängeln<br /><br />Service fällig.<br />-</strong><br />Sound-System Bang &amp; Olufsen, Sitze &lt;Leder&gt;';
  assert.strictEqual(descText(raw), 'Fahrzeug mit Mängeln\n\nService fällig.\n-\nSound-System Bang & Olufsen, Sitze <Leder>');
});

test('apraksts: kodēti tagi (&lt;br /&gt;) un tālrunis', () => {
  assert.strictEqual(descText('Labs auto&lt;br /&gt;Zvanīt +371 2912 3456'), 'Labs auto\nZvanīt [tālrunis oriģinālajā sludinājumā]');
  assert.strictEqual(descText(''), null);
});
