// Pārbauda Claude režīma rīku ciklu ar viltotu API (bez īsta tīkla un atslēgas).
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dealradar-ai-'));
process.env.ANTHROPIC_API_KEY = 'test-key';
const db = require('../src/db');
const demo = require('../src/scrapers/demo');
const assistant = require('../src/assistant');

test('Claude režīms: modelis izsauc search_cars, saņem MŪSU datus un atbild', async () => {
  db.upsert(demo.generate());
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    sent.push(body);
    const reply = sent.length === 1
      ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'search_cars', input: { make: 'volkswagen', maxPrice: 8000 } }] }
      : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Iesaku šo Golf.' }] };
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  try {
    const r = await assistant.ask('Lēts VW');
    assert.strictEqual(r.mode, 'claude');
    assert.strictEqual(r.answer, 'Iesaku šo Golf.');
    assert.ok(r.items.length > 0 && r.items.every((l) => l.make === 'Volkswagen' && l.price <= 8000));
    // Otrajā pieprasījumā modelim tika nosūtīts rīka rezultāts
    const toolResult = sent[1].messages.at(-1).content[0];
    assert.strictEqual(toolResult.type, 'tool_result');
    assert.match(toolResult.content, /Volkswagen/);
  } finally {
    global.fetch = realFetch;
  }
});

test('Claude režīms: ja API nestrādā, atbild bezsaistes režīmā, nevis avarē', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => new Response('overloaded', { status: 529 });
  try {
    const r = await assistant.ask('BMW līdz 10000 eur');
    assert.strictEqual(r.mode, 'offline');
  } finally {
    global.fetch = realFetch;
  }
});
