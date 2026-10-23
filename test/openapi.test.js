// API dokumentācija (Swagger UI) nedrīkst atšķirties no tā, ko serveris tiešām dara
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dealvo-api-docs-'));
const app = require('../src/server');
const spec = require('../src/openapi');

let server, base;
test.before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
test.after(() => server.close());

test('katrs /api maršruts ir aprakstīts, un katrs aprakstītais eksistē', () => {
  const routes = app._router.stack
    .filter((l) => l.route && typeof l.route.path === 'string' && l.route.path.startsWith('/api/') && l.route.path !== '/api/openapi.json')
    .flatMap((l) => Object.keys(l.route.methods).map((m) => `${m} ${l.route.path}`))
    .sort();
  const documented = Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`)).sort();
  assert.deepStrictEqual(documented, routes);
});

test('visas $ref atsauces norāda uz esošām shēmām', () => {
  const refs = JSON.stringify(spec).match(/#\/components\/schemas\/\w+/g);
  for (const r of new Set(refs)) assert.ok(spec.components.schemas[r.split('/').pop()], r);
});

test('/api/openapi.json un Swagger UI lapa atveras', async () => {
  const json = await (await fetch(`${base}/api/openapi.json`)).json();
  assert.strictEqual(json.openapi, '3.0.3');
  assert.ok(json.paths['/api/listings'].get);
  const page = await fetch(`${base}/api-docs/`);
  assert.strictEqual(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>Dealvo API<\/title>/);
  assert.match(html, /swagger-ui/);
  // Apraksts vienmēr no mūsu servera, arī ja saitē ir ?url=...
  assert.match(await (await fetch(`${base}/api-docs/swagger-ui-init.js`)).text(), /"swaggerUrl": "\/api\/openapi.json"/);
});

test('aprakstītās /api/listings vērtības serveris pieņem, un robežas ir tās pašas', async () => {
  const get = (name, value) => fetch(`${base}/api/listings?${new URLSearchParams({ [name]: value })}`);
  for (const p of spec.paths['/api/listings'].get.parameters) {
    const { enum: values, minimum, maximum } = p.schema;
    for (const v of values || []) assert.strictEqual((await get(p.name, v)).status, 200, `${p.name}=${v}`);
    if (minimum !== undefined) {
      assert.strictEqual((await get(p.name, minimum)).status, 200, `${p.name}=${minimum}`);
      assert.strictEqual((await get(p.name, maximum)).status, 200, `${p.name}=${maximum}`);
      assert.strictEqual((await get(p.name, maximum + 1)).status, 400, `${p.name}=${maximum + 1}`);
    }
  }
});
