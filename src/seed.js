// npm run seed — ielādē demo datus, lai lietotni var parādīt bez interneta.
const db = require('./db');
const demo = require('./scrapers/demo');

const r = db.upsert(demo.generate());
console.log(`Demo dati ielādēti: +${r.added} jauni, ${r.updated} atjaunināti → ${db.FILE}`);
