const test = require('node:test');
const assert = require('node:assert');

test('ss.lv iet caur Worker, ja SCRAPE_PROXY ir iestatīts; citas vietnes — tieši', async () => {
  process.env.SCRAPE_PROXY = 'https://proxy.example.workers.dev/';
  process.env.SCRAPE_PROXY_KEY = 'slepens';
  const { fetchHtml } = require('../src/scrapers/http');
  const seen = [];
  global.fetch = async (url, opts) => { seen.push({ url, key: opts.headers['x-key'] }); return { ok: true, status: 200, text: async () => '<html>' + 'x'.repeat(30000) }; };
  await fetchHtml('https://www.ss.lv/lv/transport/cars/bmw/sell/', 'ss.lv');
  await fetchHtml('https://www.autoscout24.com/lst/bmw', 'AutoScout24');
  assert.strictEqual(seen[0].url, 'https://proxy.example.workers.dev/?url=' + encodeURIComponent('https://www.ss.lv/lv/transport/cars/bmw/sell/'));
  assert.strictEqual(seen[0].key, 'slepens');
  assert.strictEqual(seen[1].url, 'https://www.autoscout24.com/lst/bmw');
  delete process.env.SCRAPE_PROXY;
});
