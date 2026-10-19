// Viena sludinājuma pilnais skats: saraksta dati + detaļas no oriģinālās lapas
// (bildes, apraksts, tehniskie dati, pārdevējs) + līdzīgie auto.

const db = require('./db');
const { fetchDetails } = require('./scrapers/details');
const { scoreListings, isComparable } = require('./deals');

const CACHE_MS = 24 * 60 * 60 * 1000;

// Detaļas no tā, kas jau ir zināms (demo datiem vai ja oriģinālā lapa nav pieejama)
function localDetails(l) {
  const specs = {};
  if (l.gearbox) specs['Ātrumkārba'] = l.gearbox;
  if (l.color) specs['Krāsa'] = l.color;
  return {
    photos: [l.image].filter(Boolean),
    description: null,
    specs,
    seller: l.seller || { type: null, name: null, city: null },
  };
}

// Apvieno pārdevēja datus: detaļu lapas dati ir precīzāki, bet tukšus laukus aizpilda no saraksta
function mergeSeller(a = {}, b = {}) {
  return { type: b.type || a.type || null, name: b.name || a.name || null, city: b.city || a.city || null };
}

async function getListing(source, externalId) {
  const item = db.find(source, externalId);
  if (!item) return null;

  let details = item.details;
  let detailsError = null;
  const fresh = details && Date.now() - new Date(item.detailsAt).getTime() < CACHE_MS;

  if (!fresh && item.url) {
    try {
      details = await fetchDetails(item);
      db.update(source, externalId, { details, detailsAt: new Date().toISOString() });
    } catch (err) {
      detailsError = err.message;
    }
  }
  const base = localDetails(item);
  const d = details || base;

  const scored = scoreListings(db.all());
  const me = scored.find((l) => l.source === source && l.externalId === externalId);
  const similar = scored
    .filter((o) => isComparable(me, o))
    .sort((a, b) => (b.dealScore ?? -Infinity) - (a.dealScore ?? -Infinity))
    .slice(0, 4);

  return {
    ...me,
    details: {
      photos: d.photos?.length ? d.photos : base.photos,
      description: d.description,
      specs: { ...base.specs, ...d.specs },
      seller: mergeSeller(item.seller, d.seller),
    },
    detailsError,
    similar,
  };
}

module.exports = { getListing, localDetails };
