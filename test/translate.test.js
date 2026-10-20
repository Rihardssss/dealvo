const test = require('node:test');
const assert = require('node:assert');
const { translateTexts, validateTranslate, _cache } = require('../src/translate');

// Viltots Google atbildes formāts: [[["tulkojums","oriģināls"], ...], ...]
function fakeGoogle(map) {
  const calls = [];
  global.fetch = async (url, opts) => {
    const q = new URLSearchParams(opts.body).get('q');
    calls.push(q);
    const out = q.split('\n').map((l) => map[l] ?? l.toUpperCase()).join('\n');
    return { ok: true, json: async () => [[[out, q]]] };
  };
  return calls;
}

test('tulkošana: vairāki teksti vienā pieprasījumā, ar kešu', async () => {
  _cache.clear();
  const calls = fakeGoogle({ 'Visi auto': 'All cars', 'Cena līdz': 'Price up to' });
  assert.deepStrictEqual(await translateTexts(['Visi auto', 'Cena līdz'], 'en'), ['All cars', 'Price up to']);
  assert.strictEqual(calls.length, 1);
  await translateTexts(['Visi auto'], 'en');
  assert.strictEqual(calls.length, 1, 'otrreiz ņem no keša');
});

test('tulkošana: apraksts ar rindām tiek tulkots atsevišķi', async () => {
  _cache.clear();
  const calls = fakeGoogle({});
  const [t] = await translateTexts(['erste zeile\nzweite zeile'], 'lv');
  assert.strictEqual(t, 'ERSTE ZEILE\nZWEITE ZEILE');
  assert.strictEqual(calls.length, 1);
});

test('tulkošana: validācija', () => {
  assert.strictEqual(validateTranslate({ to: 'xx', texts: ['a'] }).ok, false);
  assert.strictEqual(validateTranslate({ to: 'en', texts: [] }).ok, false);
  assert.strictEqual(validateTranslate({ to: 'en', texts: ['a'.repeat(13000)] }).ok, false);
  assert.strictEqual(validateTranslate({ to: 'ru', texts: ['Sveiki'] }).ok, true);
});
