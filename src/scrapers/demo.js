// Demo avots — ģenerē reālistiskus testa sludinājumus.
// Vajadzīgs, lai prezentācija strādātu arī bez interneta un lai būtu ar ko
// salīdzināt ss.lv datus. Rezultāti ir deterministiski (fiksēts "seed").

const MODELS = {
  BMW: [['320', 9000], ['520', 12000], ['X5', 18000], ['118', 7000]],
  Audi: [['A4', 8500], ['A6', 11000], ['Q5', 16000], ['A3', 7500]],
  Volkswagen: [['Golf', 6500], ['Passat', 7500], ['Tiguan', 14000], ['Polo', 5000]],
  Toyota: [['Corolla', 9000], ['RAV4', 17000], ['Avensis', 6000], ['Yaris', 6000]],
  Skoda: [['Octavia', 8000], ['Superb', 11000], ['Fabia', 4500]],
  Volvo: [['V60', 12000], ['XC60', 17000], ['V70', 6000]],
  Mercedes: [['C', 12000], ['E', 15000], ['GLC', 25000]],
  Ford: [['Focus', 5500], ['Mondeo', 6000], ['Kuga', 11000]],
};
const FUELS = ['dīzelis', 'benzīns', 'dīzelis', 'hibrīds'];
const SITES = ['demo-auto.lv', 'demo-mašīnas.lv'];

// Vienkāršs deterministisks ģenerators (mulberry32)
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(count = 400, seed = 42) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const makes = Object.keys(MODELS);
  const out = [];
  const year = new Date().getFullYear();

  for (let i = 0; i < count; i++) {
    const make = pick(makes);
    const [model, base2015] = pick(MODELS[make]);
    const carYear = 2006 + Math.floor(rand() * 18);
    const age = year - carYear;
    const mileage = Math.round((age * (12000 + rand() * 14000)) / 1000) * 1000;
    // Tirgus cena: bāze, kas krītas ~11% gadā, mazāk par lielu nobraukumu
    let price = base2015 * Math.pow(0.89, carYear < 2015 ? 2015 - carYear : -(carYear - 2015) * 0.9);
    price *= 1 - Math.min(mileage, 400000) / 2_000_000;
    // Tirgus troksnis ±15%, un ~8% sludinājumu ir īsti "deali" (20–40% lētāki)
    price *= 0.85 + rand() * 0.3;
    if (rand() < 0.08) price *= 0.6 + rand() * 0.2;
    price = Math.max(500, Math.round(price / 50) * 50);

    const site = pick(SITES);
    out.push({
      source: site,
      externalId: `demo-${seed}-${i}`,
      url: null,
      title: `${make} ${model} ${carYear}, ${pick(['labā stāvoklī', 'servisa vēsture', 'bez ieguldījumiem', 'tikko no Vācijas', 'viens īpašnieks'])}`,
      make,
      model,
      year: carYear,
      engine: Math.round((1.4 + rand() * 1.6) * 10) / 10,
      fuel: pick(FUELS),
      mileage,
      price,
      image: null,
    });
  }
  return out;
}

module.exports = { name: 'demo', generate };
