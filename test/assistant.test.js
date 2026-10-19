const test = require('node:test');
const assert = require('node:assert');
const { parseQuestion, validateQuestion } = require('../src/assistant');

test('asistents saprot latviešu valodas jautājumu', () => {
  const f = parseQuestion('Meklēju dīzeļa VW līdz 6000 eur, pēc 2012, līdz 200 tūkst. km');
  assert.strictEqual(f.make, 'volkswagen');
  assert.strictEqual(f.fuel, 'dīzelis');
  assert.strictEqual(f.maxPrice, 6000);
  assert.strictEqual(f.minYear, 2013);
  assert.strictEqual(f.maxMileage, 200000);
  assert.strictEqual(f.sort, 'deal');
});

test('asistents saprot saīsinājumus un slengu', () => {
  const f = parseQuestion('lēts merss 5k');
  assert.strictEqual(f.make, 'mercedes');
  assert.strictEqual(f.maxPrice, 5000);
  assert.strictEqual(f.sort, 'price');
});

test('asistents noraida tukšu vai pārāk garu jautājumu', () => {
  assert.ok(validateQuestion(''));
  assert.ok(validateQuestion('x'.repeat(401)));
  assert.ok(validateQuestion(42));
  assert.strictEqual(validateQuestion('BMW līdz 5000'), null);
});

test('asistents saprot virsbūvi', () => {
  assert.strictEqual(parseQuestion('universālis līdz 7000').body, 'universālis');
  assert.strictEqual(parseQuestion('lēts suv').body, 'apvidus');
});
