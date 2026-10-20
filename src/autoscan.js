// Automātiskā skenēšana, lai dati vienmēr būtu svaigi bez pogas spiešanas.
//
// 1) Fonā: ik pēc AUTO_SCAN_MINUTES minūtēm noskenē to marku, kas visilgāk nav atjaunota.
//    Tā pa kārtai tiek apstaigātas visas markas.
// 2) Pēc pieprasījuma: ja kāds lapā izvēlas marku, kuras dati ir vecāki par stundu
//    (vai to vēl nav vispār), tā tiek noskenēta uzreiz fonā, un lapa pati atjaunojas.
//
// Vienlaikus notiek tikai viena skenēšana, lai nenoslogotu vietnes.

const { normalizeMake } = require('./makes');

function createAutoScan({ db, scrape, makes, sources, pages = 2, staleMinutes = 60, pruneDays = 3, log = console.log }) {
  const lastScan = new Map(); // marka → laiks (ms)
  let running = null; // marka, kas šobrīd tiek skenēta
  let lastResult = null;
  let timer = null;

  // Pēc restarta: nosakām, kad katra marka pēdējo reizi redzēta datos
  for (const l of db.all()) {
    if (String(l.source).startsWith('demo')) continue;
    const slug = Object.keys(makes).find((k) => makes[k].name === normalizeMake(l.make));
    const t = new Date(l.lastSeen).getTime();
    if (slug && t > (lastScan.get(slug) || 0)) lastScan.set(slug, t);
  }

  async function scanMake(slug) {
    if (running) return false;
    running = slug;
    const started = Date.now();
    try {
      const { items, report } = await scrape(makes[slug], sources, pages);
      if (items.length) db.clearDemo(); // ja ir īsti dati, demo vairs nevajag
      const result = db.upsert(items);
      const removed = db.prune(pruneDays);
      lastScan.set(slug, Date.now());
      lastResult = { make: makes[slug].name, at: new Date().toISOString(), found: items.length, ...result, removed, report };
      log(`[autoscan] ${makes[slug].name}: ${items.length} auto (${result.added} jauni) ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      lastScan.set(slug, Date.now()); // lai kļūdaina marka neatkārtojas bez gala
      lastResult = { make: makes[slug].name, at: new Date().toISOString(), error: err.message };
      log(`[autoscan] ${makes[slug].name}: kļūda ${err.message}`);
    } finally {
      running = null;
    }
    return true;
  }

  // Marka, kas visilgāk nav skenēta (vai nekad)
  function nextMake() {
    return Object.keys(makes).sort((a, b) => (lastScan.get(a) || 0) - (lastScan.get(b) || 0))[0];
  }

  function isStale(slug, now = Date.now()) {
    return now - (lastScan.get(slug) || 0) > staleMinutes * 60 * 1000;
  }

  /** Ja marka ir veca, sāk to skenēt fonā. Atgriež true, ja skenēšana sākta vai jau notiek šai markai. */
  function ensureFresh(slug) {
    if (!makes[slug]) return false;
    if (running) return running === slug;
    if (!isStale(slug)) return false;
    scanMake(slug);
    return true;
  }

  function start(intervalMinutes) {
    // Kamēr kāda marka vēl nav skenēta (piem. tukša datubāze), skenējam pēc kārtas bez gaidīšanas,
    // lai lapa ātri piepildās. Pēc tam — viena marka ik pēc intervalMinutes.
    const unscanned = () => Object.keys(makes).some((k) => !lastScan.has(k));
    const tick = async () => {
      if (!running) await scanMake(nextMake());
      timer = setTimeout(tick, unscanned() ? 5000 : intervalMinutes * 60 * 1000);
    };
    timer = setTimeout(tick, 5000);
    log(`[autoscan] ieslēgts: viena marka ik pēc ${intervalMinutes} min, avoti: ${sources.join(', ')}`);
  }

  function stop() { clearTimeout(timer); }

  function status() {
    const times = [...lastScan.values()];
    return {
      running: running ? makes[running].name : null,
      lastScanAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
      lastResult,
    };
  }

  return { scanMake, ensureFresh, isStale, nextMake, start, stop, status };
}

module.exports = { createAutoScan };
