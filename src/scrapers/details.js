// Sludinājuma detaļas: visas bildes, apraksts, tehniskie dati un pārdevējs.
// Tiek ielādētas tikai tad, kad lietotājs atver konkrēto auto (nevis skrāpējot sarakstu),
// lai nenoslogotu vietnes ar simtiem pieprasījumu.
//
// Privātums: telefona numurus un privātpersonu vārdus NEGLABĀJAM un nerādām.
// Rādām tikai pārdevēja tipu (dīleris/privātpersona), dīlera uzņēmuma nosaukumu un pilsētu.
// Lai sazinātos, lietotājs atver oriģinālo sludinājumu.

const cheerio = require('cheerio');
const { fetchHtml, digits } = require('./http');

// Tikai šīs vietnes drīkst ielādēt (aizsardzība pret SSRF — serveris nevar
// tikt izmantots, lai pieprasītu patvaļīgas adreses)
const ALLOWED_HOSTS = [/^(www\.)?ss\.lv$/, /^(www\.)?autoscout24\.[a-z.]+$/, /^suchen\.mobile\.de$/];

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const PHONE = /(\+?\d[\d\s()-]{6,}\d)/g;
const noPhones = (t) => clean(t).replace(PHONE, '[tālrunis oriģinālajā sludinājumā]');

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
  t = t.replace(/&lt;(\s*\/?\s*(?:br|p|div|li|strong|b|i|u|em|span|ul|ol|h\d)\b[^&]*?)&gt;/gi, '<$1>');
  t = t.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|h\d)\s*>/gi, '\n').replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/?[a-z][^>]*>/gi, '');
  t = decodeEntities(t);
  t = t.split('\n').map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  return t.replace(PHONE, '[tālrunis oriģinālajā sludinājumā]').slice(0, 2000) || null;
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
    if (label && value && !/tālr|phone/i.test(label)) specs[label] = value;
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
  const add = (label, v) => { if (v != null && v !== '') specs[label] = clean(typeof v === 'object' ? v.formatted ?? v.raw ?? '' : v); };
  add('Ātrumkārba', vehicle.transmissionType ?? vehicle.transmission);
  add('Jauda', vehicle.power ?? vehicle.powerInKw);
  add('Virsbūve', vehicle.bodyType);
  add('Krāsa', vehicle.bodyColor ?? vehicle.color);
  add('Durvis', vehicle.numberOfDoors);
  add('Sēdvietas', vehicle.numberOfSeats);
  add('Pirmā reģistrācija', vehicle.firstRegistrationDate ?? vehicle.firstRegistration);

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
  const specific = source === 'ss.lv' ? parseSslv(html) : source === 'autoscout24' ? parseAutoscout(html) : null;
  return specific || parseJsonLd(html) || { photos: [], description: null, specs: {}, seller: { type: null, name: null, city: null } };
}

async function fetchDetails(listing) {
  if (!isAllowedUrl(listing.url)) throw new Error('Šim sludinājumam nav atļautas saites');
  const label = { 'ss.lv': 'ss.lv', autoscout24: 'AutoScout24', 'mobile.de': 'mobile.de' }[listing.source] || listing.source;
  return parseDetails(await fetchHtml(listing.url, label), listing.source);
}

module.exports = { fetchDetails, parseDetails, parseSslv, parseAutoscout, parseJsonLd, isAllowedUrl, descText, sellerType, digits };
