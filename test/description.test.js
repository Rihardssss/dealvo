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

test('apraksts: <hr> un saraksti kļūst par rindām; gadu diapazons un nobraukums nav tālrunis', () => {
  assert.strictEqual(descText('<strong>Willkommen!</strong><hr /><strong>Highlights:</strong><ul><li>TÜV neu</li><li>Scheckheft</li></ul>Ende'),
    'Willkommen!\nHighlights:\n• TÜV neu\n• Scheckheft\n\nEnde');
  assert.strictEqual(descText('Servisa vēsture 2012-2020, nobraukums 1 215 000 km'), 'Servisa vēsture 2012-2020, nobraukums 1 215 000 km');
  assert.strictEqual(descText('Zvanīt 29 123 456 vai +48 600 123 456'),
    'Zvanīt [tālrunis oriģinālajā sludinājumā] vai [tālrunis oriģinālajā sludinājumā]');
});
