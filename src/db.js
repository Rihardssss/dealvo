// Datu glabāšana JSON failā (data/listings.json).
// Prototipam pietiek; katram sludinājumam glabājam arī cenu vēsturi,
// lai varētu parādīt "cena samazināta".

const fs = require('fs');
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

  for (const item of items) {
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

function all() {
  return load();
}

function clear() {
  cache = [];
  save();
}

module.exports = { upsert, all, clear, FILE };
