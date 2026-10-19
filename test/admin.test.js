const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dealradar-admin-'));
process.env.ADMIN_TOKEN = 'slepena-parole';
const app = require('../src/server');

test('scenārijs 6: bez admin paroles datus mainīt nevar', async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  try {
    const noToken = await fetch(base + '/api/demo', { method: 'POST' });
    assert.strictEqual(noToken.status, 401);
    const wrong = await fetch(base + '/api/listings', { method: 'DELETE', headers: { 'X-Admin-Token': 'nepareiza' } });
    assert.strictEqual(wrong.status, 401);
    const ok = await fetch(base + '/api/demo', { method: 'POST', headers: { 'X-Admin-Token': 'slepena-parole' } });
    assert.strictEqual(ok.status, 200);
    const read = await fetch(base + '/api/listings');
    assert.strictEqual(read.status, 200); // lasīt var visi
  } finally {
    server.close();
  }
});
