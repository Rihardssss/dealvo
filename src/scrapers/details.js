// Sludinājuma detaļas: visas bildes, apraksts, tehniskie dati un pārdevējs.
// Tiek ielādētas tikai tad, kad lietotājs atver konkrēto auto (nevis skrāpējot sarakstu),
// lai nenoslogotu vietnes ar simtiem pieprasījumu.
//
// Privātums: telefona numurus un privātpersonu vārdus NEGLABĀJAM un nerādām.
// Rādām tikai pārdevēja tipu (dīleris/privātpersona), dīlera uzņēmuma nosaukumu un pilsētu.
// Lai sazinātos, lietotājs atver oriģinālo sludinājumu.

const cheerio = require('cheerio');
const { fetchHtml, digits } = require('./http');
const { bodyLv } = require('../makes');

// Tikai šīs vietnes drīkst ielādēt (aizsardzība pret SSRF — serveris nevar
// tikt izmantots, lai pieprasītu patvaļīgas adreses)
const ALLOWED_HOSTS = [/^(www\.)?ss\.lv$/, /^(www\.)?autoscout24\.[a-z.]+$/, /^suchen\.mobile\.de$/, /^(www\.)?otomoto\.pl$/];

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
// Tālrunis: 8–15 cipari. Gadu diapazoni ("2010-2015") un nobraukums ("1 215 000") nav tālruņi.
const PHONE = /\+?\d[\d\s()-]{6,}\d/g;
const YEARS_ONLY = /^(?:(?:19|20)\d\d[\s()-]*)+$/;
const hidePhones = (t) => t.replace(PHONE, (m) => {
  const n = m.replace(/\D/g, '').length;
  return n < 8 || n > 15 || YEARS_ONLY.test(m) ? m : '[tālrunis oriģinālajā sludinājumā]';
});

// Vietņu vērtības (angliski, vāciski, poliski) → latviski; ja nav zināmas, paliek oriģinālās
const LV_VALUES = {
  gearbox: [[/semi|halbautomat|półautomat/, 'pusautomāts'], [/auto/, 'automāts'], [/manu|schalt/, 'manuāla']],
  drive: [[/front|przedni|vorder/, 'priekšējā'], [/rear|tyln|hinter/, 'aizmugurējā'], [/4x4|all|four|awd|4wd|allrad|quattro|xdrive/, 'pilnpiedziņa']],
  color: [[/black|czarn|schwarz/, 'melna'], [/white|biał|weiß|weiss/, 'balta'], [/silver|srebr/, 'sudraba'], [/gr[ae]y|szar|grau/, 'pelēka'],
    [/blue|niebiesk|blau|granat/, 'zila'], [/\bred\b|czerwon|\brot\b/, 'sarkana'], [/green|zielon|grün/, 'zaļa'], [/brown|brąz|braun/, 'brūna'],
    [/beige|beż/, 'bēša'], [/yellow|żółt|gelb/, 'dzeltena'], [/orange|pomarańcz/, 'oranža'], [/gold|złot/, 'zelta'],
    [/violet|purple|fiolet|lila/, 'violeta'], [/bordo|bordeaux|maroon/, 'bordo']],
  country: [[/niemcy|germany|deutschland/, 'Vācija'], [/polska|poland/, 'Polija'], [/francja|france/, 'Francija'], [/belgia|belgium/, 'Beļģija'],
    [/holandia|netherlands/, 'Nīderlande'], [/szwecja|sweden/, 'Zviedrija'], [/włochy|italy/, 'Itālija'], [/szwajcaria|switzerland/, 'Šveice'],
    [/austria/, 'Austrija'], [/dania|denmark/, 'Dānija'], [/norwegia|norway/, 'Norvēģija'], [/czechy|czech/, 'Čehija'], [/hiszpania|spain/, 'Spānija'],
    [/luksemburg|luxemb/, 'Luksemburga'], [/wielka brytania|united kingdom/, 'Lielbritānija'], [/stany zjednoczone|usa|united states/, 'ASV'],
    [/kanada|canada/, 'Kanāda'], [/japonia|japan/, 'Japāna'], [/korea/, 'Koreja'], [/litwa|lithuania/, 'Lietuva'], [/łotwa|latvia/, 'Latvija']],
};
function lvValue(kind, raw) {
  const t = clean(raw);
  if (!t) return null;
  if (kind === 'body') return bodyLv(t) || t;
  return LV_VALUES[kind].find(([re]) => re.test(t.toLowerCase()))?.[1] || t;
}

// Apraksts kā tīrs teksts: <br> un <p> → jaunas rindas, pārējie HTML tagi prom,
// &amp; &nbsp; &#39; u.c. → parastas rakstzīmes. Rindkopas saglabājas.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', bull: '•', ndash: '–', mdash: '—', euro: '€', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' };
function decodeEntities(t) {
  return t.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e] ?? m;
  });
}
function descText(raw) {
  let t = String(raw ?? '');
  // Dažreiz tagi ir kodēti kā &lt;br /&gt; — tos vispirms atkodē
  t = t.replace(/&lt;(\s*\/?\s*(?:br|hr|p|div|li|strong|b|i|u|em|span|ul|ol|h\d)\b[^&]*?)&gt;/gi, '<$1>');
  t = t.replace(/<\s*[bh]r\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|h\d)\s*>/gi, '\n').replace(/<\/?\s*(ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/?[a-z][^>]*>/gi, '');
  t = decodeEntities(t);
  t = t.split('\n').map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  return hidePhones(t).slice(0, 2000) || null;
}

function sellerType(raw) {
  const t = String(raw ?? '').toLowerCase();
  if (/dealer|händler|haendler|company|uzņēm|dīler|autosalon|organization|autohaus/.test(t)) return 'dīleris';
  if (/private|privat|fsbo|person|privātperson/.test(t)) return 'privātpersona';
  return null;
}

// ---------- ss.lv ----------
function parseSslv(html) {
  const $ = cheerio.load(html);
  const specs = {};
  $('td.ads_opt_name').each((_, el) => {
    const label = clean($(el).text()).replace(/:$/, '');
    const value = clean($(el).next('td').text());
    // "Marka" atkārto virsrakstu, "VIN kods: Parādīt vin kodu" ir tikai poga
    if (label && value && !/tālr|phone|^marka$|^vin/i.test(label) && !/^parādīt/i.test(value)) specs[label] = value;
  });

  const photos = [];
  $('img.pic_thumbnail, .pic_dv_thumbnail img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && src.startsWith('http')) photos.push(src.replace(/\.t\.jpg$/, '.800.jpg').replace(/\.th2\.jpg$/, '.800.jpg'));
  });

  // Kontaktu tabulā ir vieta un (dīleriem) uzņēmums; tālruni izlaižam
  let city = null, company = null;
  $('td.ads_contacts_name').each((_, el) => {
    const label = clean($(el).text()).toLowerCase();
    const value = clean($(el).next('td').text());
    if (/vieta|pilsēta|rajons|place/.test(label)) city = value;
    if (/uzņēmums|company|firma/.test(label)) company = value;
  });

  const descEl = $('#msg_div_msg').clone();
  descEl.find('table, script').remove();
  descEl.find('br').replaceWith('\n');
  return {
    photos: [...new Set(photos)],
    description: descText(descEl.text()),
    specs,
    seller: { type: company ? 'dīleris' : 'privātpersona', name: company, city },
  };
}

// ---------- AutoScout24 ----------
function findKey(node, key, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return undefined;
  if (Object.prototype.hasOwnProperty.call(node, key)) return node[key];
  for (const v of Object.values(node)) {
    const r = findKey(v, key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

function parseAutoscout(html) {
  const $ = cheerio.load(html);
  const raw = $('#__NEXT_DATA__').html();
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  const d = findKey(data, 'listingDetails') || data;
  const seller = findKey(d, 'seller') || {};
  const location = findKey(d, 'location') || {};
  const vehicle = findKey(d, 'vehicle') || {};
  const images = findKey(d, 'images') || [];

  const specs = {};
  const text = (v) => clean(typeof v === 'object' && v ? v.formatted ?? v.raw ?? '' : v);
  const add = (label, v) => { if (v != null && text(v) !== '') specs[label] = text(v); };
  const yesNo = (v, yes, no) => (v === true ? yes : v === false ? no : null);
  add('Ātrumkārba', lvValue('gearbox', text(vehicle.transmissionType ?? vehicle.transmission)));
  const hp = text(vehicle.powerInHp).replace(/\s*hp$/i, ' ZS');
  add('Jauda', vehicle.powerInKw ? `${text(vehicle.powerInKw)}${hp ? ` (${hp})` : ''}` : vehicle.power);
  const ccm = digits(text(vehicle.displacementInCCM));
  add('Dzinēja tilpums', ccm ? `${ccm} cm³` : null);
  add('Piedziņa', lvValue('drive', text(vehicle.driveTrain)));
  add('Virsbūve', lvValue('body', text(vehicle.bodyType)));
  add('Krāsa', lvValue('color', text(vehicle.bodyColor ?? vehicle.color)));
  add('Durvis', vehicle.numberOfDoors);
  add('Sēdvietas', vehicle.numberOfSeats);
  add('Pirmā reģistrācija', vehicle.firstRegistrationDate ?? vehicle.firstRegistration);
  add('Iepriekšējie īpašnieki', vehicle.noOfPreviousOwners);
  add('Servisa vēsture', yesNo(vehicle.hasFullServiceHistory, 'pilna', null));
  add('Avārijas', yesNo(vehicle.hadAccident, 'ir bijis avārijā', 'nav bijis avārijā'));

  const type = sellerType(seller.type ?? seller.sellerType);
  return {
    photos: images.map((i) => (typeof i === 'string' ? i : i?.url ?? i?.src)).filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, 20),
    description: descText(findKey(d, 'description')),
    specs,
    seller: {
      type,
      name: type === 'dīleris' ? clean(seller.companyName ?? seller.name ?? '') || null : null,
      city: clean([location.zip, location.city].filter(Boolean).join(' ')) || null,
    },
  };
}

// ---------- otomoto.pl ----------
// Next.js lapa: pageProps.advert (apraksts, bildes, parametri, pārdevējs). Tālruņi tur ir šifrēti, un tos neņemam.
const OTOMOTO_SPECS = {
  version: 'Versija', generation: 'Paaudze', engine_power: 'Jauda', gearbox: 'Ātrumkārba', transmission: 'Piedziņa',
  body_type: 'Virsbūve', color: 'Krāsa', door_count: 'Durvis', nr_seats: 'Sēdvietas', country_origin: 'Izcelsmes valsts',
};
const OTOMOTO_KIND = { gearbox: 'gearbox', transmission: 'drive', body_type: 'body', color: 'color', country_origin: 'country' };

function parseOtomoto(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let advert;
  try { advert = JSON.parse(m[1])?.props?.pageProps?.advert; } catch { return null; }
  if (!advert) return null;
  const specs = {};
  for (const p of advert.details || []) {
    const label = OTOMOTO_SPECS[p.key];
    if (!label || !p.value) continue;
    const value = OTOMOTO_KIND[p.key] ? lvValue(OTOMOTO_KIND[p.key], p.value) : clean(p.value).replace(/\bKM$/, 'ZS');
    if (value) specs[label] = value;
  }
  const seller = advert.seller || {};
  const type = /professional|business|dealer/i.test(seller.type) ? 'dīleris' : /private/i.test(seller.type) ? 'privātpersona' : null;
  return {
    photos: (advert.images?.photos || []).map((p) => p?.url).filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, 20),
    description: descText(advert.description),
    specs,
    seller: { type, name: type === 'dīleris' ? clean(seller.name) || null : null, city: null },
  };
}

// ---------- Vispārīgs: schema.org JSON-LD (daudzas vietnes, arī mobile.de dīleri) ----------
function parseJsonLd(html) {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    let json;
    try { json = JSON.parse($(el).html()); } catch { continue; }
    const nodes = [].concat(json['@graph'] || json);
    const car = nodes.find((n) => /Car|Vehicle|Product/.test([].concat(n['@type']).join(' ')));
    if (!car) continue;
    const offer = [].concat(car.offers || [])[0] || {};
    const seller = offer.seller || offer.offeredBy || {};
    const addr = seller.address || {};
    const type = sellerType(seller['@type']) || (seller.name ? 'dīleris' : null);
    const specs = {};
    if (car.vehicleTransmission) specs['Ātrumkārba'] = clean(car.vehicleTransmission);
    if (car.bodyType) specs['Virsbūve'] = clean(car.bodyType);
    if (car.color) specs['Krāsa'] = clean(car.color);
    return {
      photos: [].concat(car.image || []).filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, 20),
      description: descText(car.description),
      specs,
      seller: {
        type,
        name: type === 'dīleris' ? clean(seller.name) || null : null,
        city: clean([addr.postalCode, addr.addressLocality].filter(Boolean).join(' ')) || null,
      },
    };
  }
  return null;
}

function parseDetails(html, source) {
  const specific = source === 'ss.lv' ? parseSslv(html) : source === 'autoscout24' ? parseAutoscout(html)
    : source === 'otomoto' ? parseOtomoto(html) : null;
  return specific || parseJsonLd(html) || { photos: [], description: null, specs: {}, seller: { type: null, name: null, city: null } };
}

async function fetchDetails(listing) {
  if (!isAllowedUrl(listing.url)) throw new Error('Šim sludinājumam nav atļautas saites');
  const label = { 'ss.lv': 'ss.lv', autoscout24: 'AutoScout24', 'mobile.de': 'mobile.de', otomoto: 'otomoto.pl' }[listing.source] || listing.source;
  return parseDetails(await fetchHtml(listing.url, label), listing.source);
}

module.exports = { fetchDetails, parseDetails, parseSslv, parseAutoscout, parseOtomoto, parseJsonLd, lvValue, isAllowedUrl, descText, sellerType, digits };
