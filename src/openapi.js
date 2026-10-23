// Dealvo API apraksts (OpenAPI 3). No tā Swagger UI (/api-docs) zīmē dokumentāciju ar pogu "Try it out".
// Iespējamās vērtības (markas, degviela, virsbūve, kārtošana, valodas) ņemam no tiem pašiem sarakstiem,
// ko izmanto validācija, lai dokumentācija neatšķirtos no tā, ko serveris tiešām pieņem.

const { MAKES, SOURCE_KEYS, FUELS, SORTS, LISTING_NUMERIC } = require('./validate');
const { BODY_TYPES } = require('./makes');
const { LANGS } = require('./translate');
const { version } = require('../package.json');

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema) => ({ ...schema, nullable: true });
const ok = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const fail = (description) => ({ description, content: { 'application/json': { schema: ref('Error') } } });
const TOO_MANY = fail('Pārāk daudz pieprasījumu no vienas IP adreses, jāpagaida minūte');

// Skaitlisko filtru apraksti; robežas nāk no validācijas.
// Piemērus liekam aprakstā, nevis "example", jo Swagger UI ar "Try it out" tos aizpildītu visos laukos uzreiz.
const NUMERIC_DOCS = {
  minPrice: 'Cena no (€), piem. 3000',
  maxPrice: 'Cena līdz (€), piem. 8000',
  minYear: 'Izlaiduma gads no, piem. 2012',
  maxYear: 'Izlaiduma gads līdz, piem. 2020',
  maxMileage: 'Nobraukums līdz (km), piem. 200000',
  limit: 'Cik auto atgriezt (noklusējumā 60)',
  offset: 'Cik auto izlaist, lai ielādētu nākamo lapu ("Rādīt vēl"), piem. 60',
  sinceHours: 'Tikai sludinājumi, kas parādījušies pēdējās N stundās, piem. 48',
};

const listingFilters = [
  { name: 'make', in: 'query', description: 'Marka (slug no /api/makes)', schema: { type: 'string', enum: Object.keys(MAKES) } },
  { name: 'model', in: 'query', description: 'Modelis, kā to atgriež /api/models, piem. "Golf", "320" vai BMW sērija "3. sērija". Burti, cipari, atstarpe, punkts un defise, līdz 40 simboliem.', schema: { type: 'string', maxLength: 40 } },
  { name: 'source', in: 'query', description: 'Vietne, kā tā ir /api/stats laukā bySource, piem. "ss.lv", "autoscout24", "otomoto"', schema: { type: 'string', minLength: 2, maxLength: 30 } },
  { name: 'fuel', in: 'query', description: 'Degviela', schema: { type: 'string', enum: FUELS } },
  { name: 'body', in: 'query', description: 'Virsbūve', schema: { type: 'string', enum: BODY_TYPES } },
  ...LISTING_NUMERIC.map(([name, minimum, maximum]) => ({
    name, in: 'query', description: NUMERIC_DOCS[name], schema: { type: 'integer', minimum, maximum },
  })),
  { name: 'below', in: 'query', description: 'Tikai auto, kas ir vismaz 10% lētāki par tirgu. Aizdomīgi lētie (vairāk nekā 70% zem tirgus) netiek ieskaitīti.', schema: { type: 'string', enum: ['1', 'true'] } },
  { name: 'sort', in: 'query', description: 'Kārtošana: deal = lielākā atlaide pret tirgu (noklusējums), price = lētākie, year = jaunākie, mileage = mazākais nobraukums, newest = jaunākie sludinājumi', schema: { type: 'string', enum: SORTS } },
];

const schemas = {
  Error: {
    type: 'object',
    properties: { errors: { type: 'array', items: { type: 'string' }, example: ['make: nezināma marka'] } },
  },
  Seller: {
    type: 'object',
    description: 'Pārdevējs. Privātpersonu vārdus un tālruņus Dealvo neglabā.',
    properties: {
      type: nullable({ type: 'string', enum: ['dīleris', 'privātpersona'] }),
      name: nullable({ type: 'string', description: 'Tikai dīlerim (uzņēmuma nosaukums)' }),
      city: nullable({ type: 'string' }),
    },
  },
  Listing: {
    type: 'object',
    description: 'Sludinājums ar aprēķinātu tirgus cenu',
    properties: {
      source: { type: 'string', example: 'ss.lv' },
      externalId: { type: 'string', description: 'Sludinājuma ID vietnē', example: 'chxdgi' },
      url: nullable({ type: 'string', format: 'uri' }),
      title: { type: 'string' },
      make: { type: 'string', example: 'Volkswagen' },
      model: nullable({ type: 'string', example: 'Golf' }),
      year: { type: 'integer', example: 2015 },
      engine: nullable({ type: 'number', description: 'Dzinēja tilpums litros', example: 1.6 }),
      fuel: nullable({ type: 'string', enum: FUELS }),
      body: nullable({ type: 'string', enum: BODY_TYPES }),
      gearbox: nullable({ type: 'string' }),
      color: nullable({ type: 'string' }),
      mileage: nullable({ type: 'integer', example: 185000 }),
      price: { type: 'integer', description: 'Cena eiro', example: 6900 },
      image: nullable({ type: 'string', format: 'uri' }),
      thumb: nullable({ type: 'string', format: 'uri' }),
      country: nullable({ type: 'string', example: 'LV' }),
      seller: nullable(ref('Seller')),
      firstSeen: { type: 'string', format: 'date-time' },
      lastSeen: { type: 'string', format: 'date-time' },
      priceHistory: {
        type: 'array',
        description: 'Iepriekšējās cenas (vecākā pirmā)',
        items: { type: 'object', properties: { price: { type: 'integer' }, at: { type: 'string', format: 'date-time' } } },
      },
      marketPrice: nullable({ type: 'integer', description: 'Līdzīgu auto cenu mediāna. null, ja līdzīgo ir mazāk par 3 vai auto nav salīdzināms.' }),
      dealScore: nullable({ type: 'number', description: 'Cik % lētāks par tirgu (negatīvs = dārgāks)', example: 18.5 }),
      dealLabel: nullable({ type: 'string', enum: ['super', 'labs', 'tirgus', 'dārgs', 'aizdomīgs'] }),
      suspicious: { type: 'boolean', description: 'Vairāk nekā 70% zem tirgus: nav izdevīgāko augšā un asistenta ieteikumos' },
      damaged: { type: 'boolean', description: 'Bojāts vai rezerves daļām (pēc virsraksta), ar tirgu nesalīdzina' },
      lease: { type: 'boolean', description: 'Līzinga pārņemšana: cena nav auto pilnā cena' },
      comparables: { type: 'integer', description: 'Cik līdzīgu auto izmantoti tirgus cenai' },
      rangeMin: { type: 'integer', description: 'Lētākā līdzīgā auto cena' },
      rangeMax: { type: 'integer', description: 'Dārgākā līdzīgā auto cena' },
    },
  },
  ListingsPage: {
    type: 'object',
    properties: {
      total: { type: 'integer', description: 'Cik auto atbilst filtriem kopā' },
      items: { type: 'array', items: ref('Listing') },
      refreshing: { type: 'boolean', description: 'true, ja izvēlētās markas dati bija veci un fonā sākta skenēšana' },
    },
  },
  ListingDetails: {
    allOf: [ref('Listing'), {
      type: 'object',
      properties: {
        details: {
          type: 'object',
          properties: {
            photos: { type: 'array', items: { type: 'string', format: 'uri' } },
            description: nullable({ type: 'string', description: 'Apraksts kā teksts, tālruņi aizstāti' }),
            specs: { type: 'object', additionalProperties: { type: 'string' }, example: { 'Ātrumkārba': 'automāts', Jauda: '110 kW (150 ZS)' } },
            seller: ref('Seller'),
          },
        },
        detailsError: nullable({ type: 'string', description: 'Ja oriģinālo lapu neizdevās ielādēt; tad rāda saraksta datus' }),
        similar: { type: 'array', description: 'Līdz 4 līdzīgiem auto', items: ref('Listing') },
      },
    }],
  },
  Filters: {
    type: 'object',
    description: 'Tie paši filtri, ko pieņem GET /api/listings',
    properties: Object.fromEntries(listingFilters.map((p) => [p.name, p.schema])),
  },
  AssistantRequest: {
    type: 'object',
    required: ['question'],
    properties: {
      question: { type: 'string', minLength: 2, maxLength: 400 },
      context: {
        type: 'object',
        description: 'Ko lapa rāda šobrīd, lai asistents saprastu turpinājumu ("un lētāku?") vai "salīdzini pirmos divus"',
        properties: {
          filters: ref('Filters'),
          ids: { type: 'array', maxItems: 10, description: 'Rādītie auto formātā "avots:id"', items: { type: 'string', example: 'ss.lv:chxdgi' } },
          focus: { type: 'string', description: 'Konkrētais auto, par kuru jautā ("avots:id")' },
        },
      },
      history: {
        type: 'array',
        description: 'Iepriekšējie jautājumi un atbildes (izmanto pēdējos 4)',
        items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } } },
      },
    },
  },
  AssistantResponse: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['claude', 'offline'], description: 'claude, ja serverim ir ANTHROPIC_API_KEY; citādi bezsaistes parsētājs' },
      intent: { type: 'string', enum: ['search', 'refine', 'compare', 'evaluate', 'price', 'help', 'off-topic', 'refused'] },
      filters: nullable(ref('Filters')),
      items: { type: 'array', items: ref('Listing') },
      answer: { type: 'string' },
    },
  },
};

const ADMIN = [{ adminToken: [] }];

const paths = {
  '/api/listings': {
    get: {
      tags: ['Sludinājumi'],
      summary: 'Meklēt sludinājumus',
      description: 'Atgriež sludinājumus ar tirgus cenu. Ja izvēlētās markas dati ir vecāki par stundu, serveris tos fonā atjauno (refreshing: true).',
      parameters: listingFilters,
      responses: { 200: ok(ref('ListingsPage')), 400: fail('Nederīgs filtrs'), 429: TOO_MANY },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Dzēst VISUS sludinājumus',
      description: 'Izdzēš visus saglabātos sludinājumus. To nevar atsaukt.',
      security: ADMIN,
      responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean', example: true } } }), 401: fail('Nepareiza admin parole') },
    },
  },
  '/api/listing': {
    get: {
      tags: ['Sludinājumi'],
      summary: 'Viens sludinājums ar bildēm, aprakstu un līdzīgajiem auto',
      description: 'Detaļas pirmajā reizē ielādē no oriģinālās lapas (ss.lv, AutoScout24, otomoto.pl) un saglabā uz 24 stundām. Limits: 30 pieprasījumi minūtē.',
      parameters: [
        { name: 'source', in: 'query', required: true, description: 'Vietne, kā sludinājuma laukā source', schema: { type: 'string', minLength: 2, maxLength: 30 }, example: 'ss.lv' },
        { name: 'id', in: 'query', required: true, description: 'Sludinājuma externalId (ņem no GET /api/listings atbildes)', schema: { type: 'string', maxLength: 64 } },
      ],
      responses: {
        200: ok(ref('ListingDetails')), 400: fail('Nederīgs identifikators'), 404: fail('Sludinājums nav atrasts'),
        429: TOO_MANY, 500: fail('Neizdevās atvērt sludinājumu'),
      },
    },
  },
  '/api/makes': {
    get: {
      tags: ['Sludinājumi'],
      summary: 'Markas ar sludinājumu skaitu',
      responses: {
        200: ok({ type: 'array', items: { type: 'object', properties: { slug: { type: 'string', example: 'bmw' }, name: { type: 'string', example: 'BMW' }, count: { type: 'integer' } } } }),
      },
    },
  },
  '/api/models': {
    get: {
      tags: ['Sludinājumi'],
      summary: 'Markas modeļi ar sludinājumu skaitu',
      description: 'BMW modeļi sagrupēti pa sērijām: vispirms "3. sērija" (series: true), zem tās 318, 320... (group: "3. sērija").',
      parameters: [{ name: 'make', in: 'query', required: true, schema: { type: 'string', enum: Object.keys(MAKES) }, example: 'bmw' }],
      responses: {
        200: ok({
          type: 'array',
          items: {
            type: 'object',
            properties: {
              model: { type: 'string', example: '320' },
              count: { type: 'integer' },
              series: { type: 'boolean' },
              group: { type: 'string', example: '3. sērija' },
              label: { type: 'string', description: 'Rādāmais nosaukums, ja atšķiras (piem. "C klase")' },
            },
          },
        }),
        400: fail('Nezināma marka'),
      },
    },
  },
  '/api/assistant': {
    post: {
      tags: ['AI un tulkošana'],
      summary: 'Pajautāt AI asistentam',
      description: 'Asistents meklē tikai Dealvo datos. Uz aizskarošiem un ar auto nesaistītiem jautājumiem tas neatgriež auto. Limits: 10 jautājumi minūtē.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('AssistantRequest'),
            examples: {
              meklēšana: { value: { question: 'dīzeļa universālis līdz 7000 € pēc 2013' } },
              turpinājums: { value: { question: 'un kaut ko lētāku?', context: { filters: { body: 'universālis', fuel: 'dīzelis', maxPrice: 7000, minYear: 2014 } } } },
              tirgusCena: { value: { question: 'cik maksā Octavia 2016?' } },
            },
          },
        },
      },
      responses: { 200: ok(ref('AssistantResponse')), 400: fail('Tukšs vai pārāk garš jautājums'), 429: TOO_MANY, 500: fail('Asistents šobrīd nevar atbildēt') },
    },
  },
  '/api/translate': {
    post: {
      tags: ['AI un tulkošana'],
      summary: 'Iztulkot tekstus',
      description: 'Lapas valodas izvēlei un pogai "Tulkot" pie sludinājuma apraksta. Līdz 80 tekstiem, kopā līdz 12 000 simboliem.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['to', 'texts'],
              properties: {
                to: { type: 'string', enum: LANGS },
                texts: { type: 'array', minItems: 1, maxItems: 80, items: { type: 'string' } },
              },
            },
            example: { to: 'en', texts: ['Lietoti auto', 'Tirgus cena'] },
          },
        },
      },
      responses: {
        200: ok({ type: 'object', properties: { texts: { type: 'array', items: { type: 'string' } } } }),
        400: fail('Nederīga valoda vai teksti'), 502: fail('Tulkošana šobrīd nav pieejama'),
      },
    },
  },
  '/api/stats': {
    get: {
      tags: ['Statuss'],
      summary: 'Kopējā statistika',
      responses: {
        200: ok({
          type: 'object',
          properties: {
            total: { type: 'integer' },
            superDeals: { type: 'integer', description: 'Vismaz 20% zem tirgus (bez aizdomīgajiem)' },
            goodDeals: { type: 'integer', description: '10–20% zem tirgus' },
            priceDrops: { type: 'integer', description: 'Auto, kuriem cena samazināta' },
            bySource: { type: 'object', additionalProperties: { type: 'integer' }, example: { otomoto: 4870, autoscout24: 3690, 'ss.lv': 3170 } },
            lastScanAt: nullable({ type: 'string', format: 'date-time' }),
          },
        }),
      },
    },
  },
  '/api/scan-status': {
    get: {
      tags: ['Statuss'],
      summary: 'Automātiskās skenēšanas statuss',
      responses: {
        200: ok({
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            running: nullable({ type: 'string', description: 'Marka, kas tiek skenēta šobrīd', example: 'BMW' }),
            lastScanAt: nullable({ type: 'string', format: 'date-time' }),
            lastResult: nullable({ type: 'object', description: 'Pēdējās skenēšanas rezultāts (marka, atrasto skaits, kļūdas pa vietnēm)' }),
          },
        }),
      },
    },
  },
  '/api/config': {
    get: {
      tags: ['Statuss'],
      summary: 'Servera iestatījumi lapai',
      responses: {
        200: ok({
          type: 'object',
          properties: {
            adminRequired: { type: 'boolean', description: 'true, ja admin darbībām vajag X-Admin-Token' },
            assistant: { type: 'string', enum: ['claude', 'offline'] },
            sources: {
              type: 'array',
              items: { type: 'object', properties: { key: { type: 'string', enum: SOURCE_KEYS }, label: { type: 'string' }, country: { type: 'string' } } },
            },
          },
        }),
      },
    },
  },
  '/api/scrape': {
    post: {
      tags: ['Admin'],
      summary: 'Noskenēt vienu marku tagad',
      description: 'Tiešām nolasa ārējās vietnes (var aizņemt līdz minūtei). Vienlaikus notiek tikai viena skenēšana.',
      security: ADMIN,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['make'],
              properties: {
                make: { type: 'string', enum: Object.keys(MAKES) },
                pages: { type: 'integer', minimum: 1, maximum: 10, default: 1, description: 'Cik saraksta lapas nolasīt katrā vietnē' },
                sources: { type: 'array', items: { type: 'string', enum: SOURCE_KEYS }, default: ['sslv'] },
              },
            },
            example: { make: 'skoda', pages: 1, sources: ['sslv'] },
          },
        },
      },
      responses: {
        200: ok({
          type: 'object',
          properties: {
            found: { type: 'integer' }, added: { type: 'integer' }, updated: { type: 'integer' }, priceDrops: { type: 'integer' },
            report: {
              type: 'array',
              items: {
                type: 'object',
                properties: { source: { type: 'string' }, ok: { type: 'boolean' }, found: { type: 'integer' }, blocked: { type: 'boolean' }, error: { type: 'string' } },
              },
            },
          },
        }),
        400: fail('Nederīga marka, lapas vai vietnes'), 401: fail('Nepareiza admin parole'), 429: fail('Skenēšana jau notiek'), 502: fail('Neizdevās nolasīt datus'),
      },
    },
  },
  '/api/demo': {
    post: {
      tags: ['Admin'],
      summary: 'Ielādēt 400 demo sludinājumus',
      security: ADMIN,
      responses: {
        200: ok({ type: 'object', properties: { source: { type: 'string', example: 'demo' }, added: { type: 'integer' }, updated: { type: 'integer' }, priceDrops: { type: 'integer' } } }),
        401: fail('Nepareiza admin parole'),
      },
    },
  },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Dealvo API',
    version,
    description: 'Lietotu auto sludinājumi no ss.lv, AutoScout24 un otomoto.pl ar tirgus cenu. '
      + 'Visiem /api pieprasījumiem ir limits: 120 minūtē no vienas IP adreses. '
      + 'Admin darbībām (skenēt, demo dati, dzēst) vajag X-Admin-Token tikai tad, ja serverim iestatīts ADMIN_TOKEN (skat. /api/config).',
  },
  servers: [{ url: '/', description: 'Šis serveris' }],
  tags: [
    { name: 'Sludinājumi' },
    { name: 'AI un tulkošana' },
    { name: 'Statuss' },
    { name: 'Admin', description: 'Maina datus. Publiskajā versijā vajag admin paroli (poga Authorize).' },
  ],
  paths,
  components: {
    schemas,
    securitySchemes: { adminToken: { type: 'apiKey', in: 'header', name: 'X-Admin-Token', description: 'Admin parole (ADMIN_TOKEN no servera .env)' } },
  },
};
