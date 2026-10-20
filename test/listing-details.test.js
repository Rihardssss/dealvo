const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dealvo-ld-'));
const db = require('../src/db');
const { getListing } = require('../src/listing-details');

test('sludinājums bez pārdevēja datiem (ss.lv) atveras, nevis avarē', async () => {
  db.upsert([{ source: 'ss.lv', externalId: '777', url: 'https://www.ss.lv/msg/lv/transport/cars/bmw/640/x.html', title: 'BMW 640', make: 'BMW', model: '640', year: 2013, mileage: 272000, price: 9000 }]);
  global.fetch = async () => ({ ok: true, status: 200, text: async () => fs.readFileSync(path.join(__dirname, 'fixtures/sslv-detail.html'), 'utf8') + ' '.repeat(20000) });
  const l = await getListing('ss.lv', '777');
  assert.ok(l);
  assert.strictEqual(l.detailsError, null);
  assert.ok('type' in l.details.seller);
});
