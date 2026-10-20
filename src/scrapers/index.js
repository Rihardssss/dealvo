// Visu īsto avotu reģistrs. Jaunu vietni pievieno, uzrakstot skrāperi ar
// fetchMake(make, pages) un ieliekot to šeit.

const sslv = require('./sslv');
const autoscout24 = require('./autoscout24');
const mobilede = require('./mobilede');

const SOURCES = {
  sslv: { label: 'ss.lv', country: 'LV', fetchMake: (make, pages) => sslv.fetchMake(make.sslv, make.name, pages) },
  autoscout24: { label: 'AutoScout24', country: 'DE', fetchMake: autoscout24.fetchMake },
  mobilede: { label: 'mobile.de', country: 'DE', fetchMake: mobilede.fetchMake },
};

/**
 * Skenē vienu marku izvēlētajos avotos. Avoti strādā paralēli, un viena avota
 * kļūda (piem. bloķēšana) neaptur pārējos.
 * @returns {Promise<{items: object[], report: object[]}>}
 */
async function scrapeMake(make, sourceKeys, pages) {
  // pages: skaitlis visiem avotiem vai objekts katram avotam, piem. { sslv: 5, autoscout24: 10 }
  const pagesFor = (k) => (typeof pages === 'object' && pages ? pages[k] ?? 2 : pages);
  const results = await Promise.allSettled(sourceKeys.map((k) => SOURCES[k].fetchMake(make, pagesFor(k))));
  const items = [];
  const report = results.map((r, i) => {
    const key = sourceKeys[i];
    if (r.status === 'fulfilled') {
      items.push(...r.value);
      return { source: SOURCES[key].label, ok: true, found: r.value.length };
    }
    return { source: SOURCES[key].label, ok: false, blocked: Boolean(r.reason?.blocked), error: r.reason?.message || 'Kļūda' };
  });
  return { items, report };
}

module.exports = { SOURCES, scrapeMake };
