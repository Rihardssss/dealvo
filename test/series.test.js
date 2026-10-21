const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dealvo-ser-'));
const db = require('../src/db');
const { modelsFor, searchListings } = require('../src/search');
const { parseQuestion } = require('../src/assistant');

const car = (id, model, year = 2015) => ({ source: 'ss.lv', externalId: id, url: 'https://www.ss.lv/x', title: `BMW ${model}`, make: 'BMW', model, year, price: 8000, mileage: 150000 });

test('BMW modeļi sagrupēti pa sērijām, un sēriju var izvēlēties filtrā', () => {
  db.upsert([car('1', '320'), car('2', '318'), car('3', '330'), car('4', '520'), car('5', 'X5')]);
  const models = modelsFor('bmw');
  const names = models.map((m) => m.model);
  assert.deepStrictEqual(names, ['3. sērija', '318', '320', '330', '5. sērija', '520', 'X5']);
  assert.strictEqual(models[0].count, 3);
  assert.strictEqual(searchListings({ make: 'bmw', model: '3. sērija' }).total, 3);
  assert.strictEqual(searchListings({ make: 'bmw', model: '320' }).total, 1);
});

test('AI saprot "3 sērija"', () => {
  assert.strictEqual(parseQuestion('bmw 3 sērija līdz 6000').model, '3. sērija');
  assert.strictEqual(parseQuestion('5. sērijas universālis').make, 'bmw');
});
