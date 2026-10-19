// AutoScout24 skrāperis (Eiropas lielākais auto portāls; noklusējumā meklē Vācijā).
//
// AutoScout24 ir Next.js lapa: visi sludinājumi ir JSON veidā <script id="__NEXT_DATA__">.
// Ja tā nav (lapa mainījusies), izmantojam rezerves variantu — <article data-price data-make ...>
// atribūtus, kas ir katrai sludinājuma kartītei.

const cheerio = require('cheerio');
const { fetchHtml, sleep, digits, yearFrom, fuelLv } = require('./http');
const { normalizeMake } = require('../makes');

const BASE = 'https://www.autoscout24.com';
const DELAY_MS = 2000;

const abs = (u) => (!u ? null : u.startsWith('http') ? u : BASE + u);

// Atrod visus objektus JSON kokā, kas izskatās pēc sludinājuma
function findListings(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const x of node) findListings(x, out);
    return out;
  }
  if (node.id && node.vehicle && (node.price || node.tracking)) {
    out.push(node);
    return out;
  }
  for (const v of Object.values(node)) findListings(v, out);
  return out;
}

function fromNextData(json) {
  return findListings(json).map((l) => {
    const v = l.vehicle || {};
    const t = l.tracking || {};
    const price = digits(t.price) ?? digits(l.price?.priceFormatted) ?? digits(l.price?.price);
    const year = yearFrom(t.firstRegistration) ?? yearFrom(v.firstRegistration) ?? yearFrom(l.firstRegistration);
    const img = Array.isArray(l.images) ? l.images[0] : null;
    return {
      source: 'autoscout24',
      externalId: String(l.id),
      url: abs(l.url),
      title: [v.make, v.model, v.modelVersionInput].filter(Boolean).join(' ').slice(0, 200),
      make: normalizeMake(v.make),
      model: v.model || null,
      year,
      engine: null,
      fuel: fuelLv(v.fuel ?? t.fuelType),
      mileage: digits(t.mileage) ?? digits(v.mileageInKm),
      price,
      image: typeof img === 'string' ? img : img?.url ?? null,
      thumb: typeof img === 'string' ? img : img?.url ?? null,
      country: l.location?.countryCode || 'DE',
    };
  });
}

function fromArticles($) {
  return $('article[data-guid]').toArray().map((el) => {
    const a = $(el);
    const img = a.find('img').first().attr('src') || null;
    return {
      source: 'autoscout24',
      externalId: a.attr('data-guid'),
      url: abs(a.find('a[href*="/offers/"]').first().attr('href') || a.find('a').first().attr('href')),
      title: a.find('h2').first().text().replace(/\s+/g, ' ').trim().slice(0, 200),
      make: normalizeMake(a.attr('data-make')),
      model: a.attr('data-model') || null,
      year: yearFrom(a.attr('data-first-registration')),
      engine: null,
      fuel: fuelLv(a.attr('data-fuel-type')),
      mileage: digits(a.attr('data-mileage')),
      price: digits(a.attr('data-price')),
      image: img,
      thumb: img,
      country: (a.attr('data-listing-country') || 'DE').toUpperCase(),
    };
  });
}

function parseListPage(html) {
  const $ = cheerio.load(html);
  let items = [];
  const raw = $('#__NEXT_DATA__').html();
  if (raw) {
    try { items = fromNextData(JSON.parse(raw)); } catch { /* bojāts JSON → rezerves variants */ }
  }
  if (!items.length) items = fromArticles($);
  // Modeļa nosaukumu ar marku ("BMW 320") apgriežam līdz "320"
  return items
    .map((i) => ({ ...i, model: i.model ? i.model.replace(new RegExp('^' + i.make + '\\s+', 'i'), '') : null }))
    .filter((i) => i.externalId && i.price && i.year && i.make);
}

async function fetchMake(make, pages = 1) {
  if (!make.as24) return [];
  const all = [];
  for (let p = 1; p <= pages; p++) {
    const url = `${BASE}/lst/${make.as24}?atype=C&cy=D&damaged_listing=exclude&sort=standard&ustate=N%2CU&page=${p}`;
    const items = parseListPage(await fetchHtml(url, 'AutoScout24'));
    if (!items.length) break;
    all.push(...items);
    if (p < pages) await sleep(DELAY_MS);
  }
  return all;
}

module.exports = { name: 'autoscout24', label: 'AutoScout24', fetchMake, parseListPage };
