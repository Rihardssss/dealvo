// mobile.de skrāperis (Vācijas lielākais auto portāls).
//
// Svarīgi: mobile.de izmanto stipru bot aizsardzību, tāpēc vienkāršs pieprasījums bieži
// tiek bloķēts. Tad skrāperis met BlockedError, un lietotne parāda skaidru paziņojumu,
// nevis avarē. Ja lapa atbild, sludinājumi tiek nolasīti no lapā iegultā JSON
// (window.__INITIAL_STATE__), rezerves variantā — no HTML saraksta.

const cheerio = require('cheerio');
const { fetchHtml, sleep, digits, yearFrom, fuelLv } = require('./http');
const { normalizeMake, bodyLv } = require('../makes');

const BASE = 'https://suchen.mobile.de';
const DELAY_MS = 3000;

const abs = (u) => (!u ? null : u.startsWith('http') ? u : BASE + u);

function extractInitialState(html) {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function findItems(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) findItems(x, out); return out; }
  if (node.id && node.price && (node.attr || node.title) && (node.relativeUrl || node.url)) {
    out.push(node);
    return out;
  }
  for (const v of Object.values(node)) findItems(v, out);
  return out;
}

function splitTitle(title, makeName) {
  const t = String(title || '').trim();
  const rest = t.replace(new RegExp('^' + makeName.replace(/[-\s]/g, '[-\\s]?') + '\\s*', 'i'), '');
  return rest.split(/\s+/)[0] || null;
}

function parseListPage(html, makeName) {
  const state = extractInitialState(html);
  let items = [];
  if (state) {
    items = findItems(state).map((i) => {
      const a = i.attr || {};
      const img = i.previewImage?.src || i.previewImage?.srcSet?.split(' ')[0] || null;
      return {
        source: 'mobile.de',
        externalId: String(i.id),
        url: abs(i.relativeUrl || i.url),
        title: String(i.title || '').slice(0, 200),
        make: normalizeMake(i.make || makeName),
        model: i.model || splitTitle(i.title, makeName),
        year: yearFrom(a.fr ?? i.firstRegistration),
        engine: null,
        fuel: fuelLv(a.ft ?? i.fuelType),
        body: bodyLv(i.category ?? a.ca),
        mileage: digits(a.ml ?? i.mileage),
        price: digits(i.price?.grossAmount ?? i.price?.gross ?? i.price),
        image: img,
        thumb: img,
        country: 'DE',
      };
    });
  }
  if (!items.length) {
    const $ = cheerio.load(html);
    items = $('[data-listing-id]').toArray().map((el) => {
      const c = $(el);
      const title = c.find('h2, .headline-block').first().text().replace(/\s+/g, ' ').trim();
      const info = c.text();
      const img = c.find('img').first().attr('src') || null;
      return {
        source: 'mobile.de',
        externalId: c.attr('data-listing-id'),
        url: abs(c.find('a').first().attr('href')),
        title: title.slice(0, 200),
        make: normalizeMake(makeName),
        model: splitTitle(title, makeName),
        year: yearFrom(info.match(/(?:EZ|FR)\s*\d{2}\/(\d{4})/i)?.[1]),
        engine: null,
        fuel: fuelLv(info.match(/Diesel|Benzin|Petrol|Elektro|Electric|Hybrid/i)?.[0]),
        mileage: digits(info.match(/([\d.,]+)\s*km/i)?.[1]),
        price: digits(c.find('[data-testid="price-label"], .price-block').first().text()),
        image: img,
        thumb: img,
        country: 'DE',
      };
    });
  }
  return items.filter((i) => i.externalId && i.price && i.year);
}

async function fetchMake(make, pages = 1) {
  if (!make.mobile) return [];
  const all = [];
  for (let p = 1; p <= pages; p++) {
    const url = `${BASE}/fahrzeuge/search.html?isSearchRequest=true&ms=${make.mobile}%3B%3B%3B&s=Car&vc=Car&lang=en&pageNumber=${p}`;
    const items = parseListPage(await fetchHtml(url, 'mobile.de'), make.name);
    if (!items.length) break;
    all.push(...items);
    if (p < pages) await sleep(DELAY_MS);
  }
  return all;
}

module.exports = { name: 'mobile.de', label: 'mobile.de', fetchMake, parseListPage, extractInitialState };
