// Datu glabāšana JSON failā (data/listings.json).
// Prototipam pietiek; katram sludinājumam glabājam arī cenu vēsturi,
// lai varētu parādīt "cena samazināta".

const fs = require('fs');
const { bodyFor } = require('./makes');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'listings.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(cache)) cache = [];
  } catch {
    cache = [];
  }
  return cache;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE); // atomiska pārrakstīšana — fails nesabojājas, ja process nokrīt
}

const keyOf = (l) => `${l.source}:${l.externalId}`;

/** Ievieto jaunus vai atjaunina esošos sludinājumus. Atgriež {added, updated, priceDrops}. */
function upsert(items) {
  const all = load();
  const index = new Map(all.map((l, i) => [keyOf(l), i]));
  const now = new Date().toISOString();
  let added = 0, updated = 0, priceDrops = 0;

  for (const raw of items) {
    // Ja vietne nenorāda virsbūvi, nosakām to pēc modeļa
    const item = { ...raw, body: raw.body || bodyFor(raw.make, raw.model) };
    const k = keyOf(item);
    if (index.has(k)) {
      const existing = all[index.get(k)];
      if (existing.price !== item.price) {
        existing.priceHistory = [...(existing.priceHistory || []), { price: existing.price, at: existing.lastSeen }];
        if (item.price < existing.price) priceDrops++;
      }
      Object.assign(existing, item, { lastSeen: now });
      updated++;
    } else {
      all.push({ ...item, firstSeen: now, lastSeen: now, priceHistory: [] });
      index.set(k, all.length - 1);
      added++;
    }
  }
  save();
  return { added, updated, priceDrops };
}

/** Papildina vienu sludinājumu (piem. ar ielādētām detaļām). */
function update(source, externalId, patch) {
  const item = load().find((l) => l.source === source && l.externalId === externalId);
  if (!item) return null;
  Object.assign(item, patch);
  save();
  return item;
}

function find(source, externalId) {
  return load().find((l) => l.source === source && l.externalId === externalId) || null;
}

function all() {
  return load();
}

function clear() {
  cache = [];
  save();
}

/**
 * Izdzēš sludinājumus, kas vairs nav redzēti vietnē (auto pārdots vai sludinājums noņemts).
 * Demo datus neaiztiek.
 */
function prune(maxAgeDays, now = Date.now()) {
  const limit = now - maxAgeDays * 24 * 60 * 60 * 1000;
  const before = load().length;
  cache = cache.filter((l) => String(l.source).startsWith('demo') || new Date(l.lastSeen).getTime() >= limit);
  if (cache.length !== before) save();
  return before - cache.length;
}

/** Izdzēš tikai demo datus (kad ir ielādēti īstie). */
function clearDemo() {
  const before = load().length;
  cache = cache.filter((l) => !String(l.source).startsWith('demo'));
  if (cache.length !== before) save();
  return before - cache.length;
}

module.exports = { upsert, all, clear, clearDemo, prune, update, find, FILE };
