// Datubāze: SQLite (iebūvēts Node.js, modulis node:sqlite). Fails: data/dealvo.db
// Struktūra: src/schema.sql (tabulas listings un price_history).
//
// Visi vaicājumi ir parametrizēti (? vietā vērtības), tāpēc SQL injekcija nav iespējama.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { bodyFor, normalizeMake, normalizeModel } = require('./makes');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'dealvo.db');
const OLD_JSON = path.join(DATA_DIR, 'listings.json');

let conn = null;

function db() {
  if (conn) return conn;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  conn = new DatabaseSync(FILE);
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  conn.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  migrateFromJson();
  return conn;
}

// ---------- Pārveidošana starp tabulas rindu un objektu, ko izmanto pārējā lietotne ----------

const COLUMNS = ['source', 'external_id', 'url', 'title', 'make', 'model', 'make_norm', 'model_norm', 'year', 'engine',
  'fuel', 'body', 'gearbox', 'color', 'mileage', 'price', 'image', 'thumb', 'country', 'seller_type', 'seller_name', 'seller_city'];

function toRow(l) {
  const v = (x) => (x === undefined ? null : x);
  return {
    source: l.source, external_id: String(l.externalId), url: v(l.url), title: v(l.title),
    make: l.make, model: v(l.model), make_norm: normalizeMake(l.make), model_norm: normalizeModel(l.model, l.make) || null,
    year: l.year, engine: v(l.engine), fuel: v(l.fuel), body: v(l.body) || bodyFor(l.make, l.model),
    gearbox: v(l.gearbox), color: v(l.color), mileage: v(l.mileage), price: l.price,
    image: v(l.image), thumb: v(l.thumb), country: v(l.country),
    seller_type: v(l.seller?.type), seller_name: v(l.seller?.name), seller_city: v(l.seller?.city),
  };
}

function fromRow(r, history = []) {
  const seller = r.seller_type || r.seller_name || r.seller_city
    ? { type: r.seller_type, name: r.seller_name, city: r.seller_city } : null;
  return {
    dbId: r.id, source: r.source, externalId: r.external_id, url: r.url, title: r.title,
    make: r.make, model: r.model, year: r.year, engine: r.engine, fuel: r.fuel, body: r.body,
    gearbox: r.gearbox, color: r.color, mileage: r.mileage, price: r.price,
    image: r.image, thumb: r.thumb, country: r.country, seller,
    details: r.details ? JSON.parse(r.details) : undefined, detailsAt: r.details_at || undefined,
    firstSeen: r.first_seen, lastSeen: r.last_seen, priceHistory: history,
  };
}

// Pievieno cenu vēsturi rindām ar vienu vaicājumu (nevis vienu katram auto)
function withHistory(rows) {
  if (!rows.length) return [];
  const byId = new Map();
  for (const h of db().prepare('SELECT listing_id, price, seen_at FROM price_history ORDER BY id').all()) {
    if (!byId.has(h.listing_id)) byId.set(h.listing_id, []);
    byId.get(h.listing_id).push({ price: h.price, at: h.seen_at });
  }
  return rows.map((r) => fromRow(r, byId.get(r.id) || []));
}

// ---------- Rakstīšana ----------

/** Ievieto jaunus vai atjaunina esošos sludinājumus vienā transakcijā. */
function upsert(items) {
  const d = db();
  const now = new Date().toISOString();
  const find = d.prepare('SELECT id, price, last_seen FROM listings WHERE source = ? AND external_id = ?');
  const insert = d.prepare(`INSERT INTO listings (${COLUMNS.join(', ')}, first_seen, last_seen)
    VALUES (${COLUMNS.map((c) => '@' + c).join(', ')}, @now, @now)`);
  const update = d.prepare(`UPDATE listings SET ${COLUMNS.filter((c) => c !== 'source' && c !== 'external_id')
    .map((c) => `${c} = @${c}`).join(', ')}, last_seen = @now WHERE id = @id`);
  const addHistory = d.prepare('INSERT INTO price_history (listing_id, price, seen_at) VALUES (?, ?, ?)');

  let added = 0, updated = 0, priceDrops = 0;
  d.exec('BEGIN');
  try {
    for (const item of items) {
      const row = toRow(item);
      const existing = find.get(row.source, row.external_id);
      if (existing) {
        if (existing.price !== row.price) {
          addHistory.run(existing.id, existing.price, existing.last_seen);
          if (row.price < existing.price) priceDrops++;
        }
        const { source, external_id, ...fields } = row;
        update.run({ ...fields, now, id: existing.id });
        updated++;
      } else {
        insert.run({ ...row, now });
        added++;
      }
    }
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
  return { added, updated, priceDrops };
}

/** Saglabā sludinājuma detaļas (bildes, apraksts, pārdevējs no oriģinālās lapas). */
function update(source, externalId, patch) {
  const d = db();
  if ('details' in patch || 'detailsAt' in patch) {
    d.prepare('UPDATE listings SET details = ?, details_at = ? WHERE source = ? AND external_id = ?')
      .run(JSON.stringify(patch.details ?? null), patch.detailsAt ?? null, source, String(externalId));
  }
  return find(source, externalId);
}

function clear() {
  db().exec('DELETE FROM listings');
}

/** Izdzēš sludinājumus, kas vairāk kā N dienas nav redzēti vietnē (pārdoti). Demo datus neaiztiek. */
function prune(maxAgeDays, now = Date.now()) {
  const limit = new Date(now - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  return Number(db().prepare("DELETE FROM listings WHERE source NOT LIKE 'demo%' AND last_seen < ?").run(limit).changes);
}

/** Izdzēš tikai demo datus. */
function clearDemo() {
  return Number(db().prepare("DELETE FROM listings WHERE source LIKE 'demo%'").run().changes);
}

// ---------- Lasīšana ----------

function find(source, externalId) {
  const r = db().prepare('SELECT * FROM listings WHERE source = ? AND external_id = ?').get(source, String(externalId));
  if (!r) return null;
  const history = db().prepare('SELECT price, seen_at AS at FROM price_history WHERE listing_id = ? ORDER BY id').all(r.id)
    .map((h) => ({ price: h.price, at: h.at }));
  return fromRow(r, history);
}

function all() {
  return withHistory(db().prepare('SELECT * FROM listings ORDER BY id').all());
}

/**
 * Atlasa sludinājumus pēc filtriem ar SQL.
 * @param {object} f validēti filtri: makeName, model, body, fuel, source, minYear, maxYear, minPrice, maxPrice, maxMileage
 */
function query(f = {}) {
  const where = [];
  const params = [];
  const add = (sql, ...values) => { where.push(sql); params.push(...values); };

  if (f.makeName) add('make_norm = ?', f.makeName);
  if (f.model) add('(lower(model_norm) = lower(?) OR lower(model) = lower(?))', f.model, f.model);
  if (f.body) add('body = ?', f.body);
  if (f.fuel) add('fuel = ?', f.fuel);
  if (f.source) add('source = ?', f.source);
  if (f.minYear) add('year >= ?', f.minYear);
  if (f.maxYear) add('year <= ?', f.maxYear);
  if (f.minPrice) add('price >= ?', f.minPrice);
  if (f.maxPrice) add('price <= ?', f.maxPrice);
  if (f.maxMileage) add('mileage IS NOT NULL AND mileage <= ?', f.maxMileage);

  const sql = `SELECT * FROM listings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
  return withHistory(db().prepare(sql).all(...params));
}

/** Visi sludinājumi dotajām marka+modelis grupām (vajadzīgi tirgus cenas aprēķinam). */
function byModels(pairs) {
  if (!pairs.length) return [];
  const cond = pairs.map(() => '(make_norm = ? AND model_norm IS ?)').join(' OR ');
  return withHistory(db().prepare(`SELECT * FROM listings WHERE ${cond}`).all(...pairs.flat()));
}

/** Sludinājumu skaits pa vietnēm. */
function countBySource() {
  return Object.fromEntries(db().prepare('SELECT source, COUNT(*) AS n FROM listings GROUP BY source ORDER BY n DESC').all()
    .map((r) => [r.source, r.n]));
}

/** Modeļi markai ar sludinājumu skaitu. */
function modelCounts(makeName) {
  return db().prepare(`SELECT model_norm AS model, COUNT(*) AS n FROM listings
    WHERE make_norm = ? AND model_norm IS NOT NULL GROUP BY model_norm ORDER BY n DESC`).all(makeName);
}

// ---------- Vecā JSON faila pārnešana ----------

function migrateFromJson() {
  if (!fs.existsSync(OLD_JSON)) return;
  const count = conn.prepare('SELECT COUNT(*) AS n FROM listings').get().n;
  if (count > 0) return;
  try {
    const items = JSON.parse(fs.readFileSync(OLD_JSON, 'utf8'));
    if (Array.isArray(items) && items.length) {
      upsert(items);
      // Vēsturi un datumus pārnesam precīzi
      const setDates = conn.prepare('UPDATE listings SET first_seen = ?, last_seen = ? WHERE source = ? AND external_id = ?');
      const getId = conn.prepare('SELECT id FROM listings WHERE source = ? AND external_id = ?');
      const addHistory = conn.prepare('INSERT INTO price_history (listing_id, price, seen_at) VALUES (?, ?, ?)');
      for (const l of items) {
        if (l.firstSeen && l.lastSeen) setDates.run(l.firstSeen, l.lastSeen, l.source, String(l.externalId));
        const row = getId.get(l.source, String(l.externalId));
        for (const h of l.priceHistory || []) if (row) addHistory.run(row.id, h.price, h.at || l.firstSeen);
      }
    }
    fs.renameSync(OLD_JSON, OLD_JSON + '.migrated');
    console.log(`[db] ${items.length} sludinājumi pārnesti no listings.json uz SQLite`);
  } catch (err) {
    console.error('[db] neizdevās pārnest listings.json:', err.message);
  }
}

module.exports = { upsert, all, find, update, clear, clearDemo, prune, query, byModels, countBySource, modelCounts, FILE };
