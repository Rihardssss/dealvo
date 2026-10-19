// DealRadar frontend — bez ietvara, tikai fetch + DOM. Stils: Tailwind (src/styles.css).
const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat('lv-LV');
const eur = (n) => `${fmt.format(n)} €`;
const pct = (n) => new Intl.NumberFormat('lv-LV', { maximumFractionDigits: 1 }).format(Math.abs(n));

// Viss teksts no servera iet caur esc(), lai sludinājuma nosaukums ar <script>
// nevarētu izpildīt kodu (XSS aizsardzība).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

let adminRequired = false;

function setStatus(text, tone = 'muted') {
  const el = $('#status');
  el.textContent = text;
  el.className = 'min-h-6 text-sm ' + ({ ok: 'text-cobalt font-medium', err: 'text-over font-medium', muted: 'text-road' }[tone]);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = $('#adminToken')?.value;
  if (token) headers['X-Admin-Token'] = token;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors || [`Serveris atbildēja ar ${res.status}`]).join('. '));
  return data;
}

// ---------- Hero uzlīme ----------
function renderHero(top) {
  const hero = $('#hero');
  if (!top || top.dealScore == null || top.dealScore <= 0) {
    hero.innerHTML = `
      <div class="grid h-full min-h-[300px] place-items-center rounded-2xl border-2 border-dashed border-line p-8 text-center">
        <div>
          <p class="font-display text-2xl font-bold">Vēl nav ar ko salīdzināt</p>
          <p class="mx-auto mt-2 max-w-[32ch] text-road">Noskenē ss.lv vai ielādē demo datus, un šeit parādīsies šodienas izdevīgākais auto.</p>
          <button class="mt-5 rounded-lg bg-cobalt px-4 py-2.5 font-semibold text-white hover:bg-cobalt-deep" onclick="openDrawer()">Atjaunot datus</button>
        </div>
      </div>`;
    return;
  }
  const url = safeUrl(top.url);
  const saved = top.marketPrice - top.price;
  hero.innerHTML = `
    <article class="sticker animate-stick relative mx-auto max-w-sm rounded-2xl p-7 text-asphalt">
      <span class="absolute -top-3 left-7 rounded-full bg-asphalt px-3 py-1 text-xs font-semibold text-sign">Šodienas labākais</span>
      <p class="font-display text-[5.5rem] font-extrabold leading-none tracking-[-0.06em]">−${Math.round(top.dealScore)}%</p>
      <p class="mt-1 text-sm font-medium">zem līdzīgu auto tipiskās cenas</p>
      <div class="mt-6 border-t-2 border-asphalt/80 pt-4">
        <p class="font-display text-2xl font-bold leading-tight">${esc(top.make)} ${esc(top.model)}, ${esc(top.year)}</p>
        <p class="mt-1 text-sm">${top.mileage != null ? `${fmt.format(top.mileage)} km, ` : ''}${esc(top.fuel || '')}</p>
        <div class="mt-4 flex items-end justify-between gap-3">
          <div>
            <p class="font-display text-4xl font-extrabold tracking-tight">${eur(top.price)}</p>
            <p class="text-sm">tirgū ap ${eur(top.marketPrice)}, ietaupi ${eur(saved)}</p>
          </div>
          ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="rounded-lg bg-asphalt px-4 py-2.5 text-sm font-semibold text-white hover:bg-asphalt-2">Skatīt</a>` : ''}
        </div>
      </div>
      <p class="mt-4 text-xs text-asphalt/70">Salīdzināts ar ${top.comparables} līdzīgiem auto no ${esc(top.source)}</p>
    </article>`;
}

// ---------- Statistika ----------
async function loadStats() {
  const s = await api('/api/stats');
  const sources = Object.entries(s.bySource);
  const cell = (value, label) => `
    <div class="bg-white px-4 py-3">
      <dt class="text-[13px] text-road">${label}</dt>
      <dd class="font-display text-2xl font-bold tracking-tight">${value}</dd>
    </div>`;
  $('#stats').innerHTML = cell(fmt.format(s.total), 'sludinājumi') + cell(sources.length, 'vietnes') + cell(s.superDeals, 'super deali');
  $('#sources').innerHTML = sources
    .map(([name, n]) => `<span class="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-asphalt-2">${esc(name)} <span class="text-road">${fmt.format(n)}</span></span>`)
    .join('');
}

// ---------- Cenu skala ----------
// Rāda, kur šī auto cena atrodas starp līdzīgu auto lētāko un dārgāko cenu.
function gauge(l) {
  if (l.marketPrice == null || l.rangeMax === l.rangeMin) {
    return `<p class="text-sm text-road">Par maz līdzīgu auto salīdzināšanai</p>`;
  }
  const pos = (v) => ((v - l.rangeMin) / (l.rangeMax - l.rangeMin)) * 100;
  const dot = { super: 'bg-sign ring-asphalt', labs: 'bg-sign ring-asphalt/60', tirgus: 'bg-fair ring-white', 'dārgs': 'bg-over ring-white' }[l.dealLabel];
  return `
    <div class="w-full" title="Līdzīgi auto: ${eur(l.rangeMin)} līdz ${eur(l.rangeMax)}">
      <div class="px-2.5"><div class="relative h-2 rounded-full bg-gradient-to-r from-sign/70 via-concrete to-over/40">
        <span class="absolute -top-1 h-4 w-0.5 bg-asphalt" style="left:${pos(l.marketPrice)}%"></span>
        <span class="absolute -top-1.5 size-5 -translate-x-1/2 rounded-full ring-2 ${dot}" style="left:${pos(l.price)}%"></span>
      </div></div>
      <div class="mt-2 flex justify-between text-xs text-road"><span>${eur(l.rangeMin)}</span><span>${eur(l.rangeMax)}</span></div>
    </div>`;
}

function badge(l) {
  if (l.dealScore == null) return '';
  if (l.dealLabel === 'super' || l.dealLabel === 'labs') {
    return `<span class="inline-block rounded-md ${l.dealLabel === 'super' ? 'bg-sign' : 'bg-sign/45'} px-2 py-0.5 font-display text-sm font-bold">−${pct(l.dealScore)}%</span>`;
  }
  if (l.dealLabel === 'dārgs') return `<span class="inline-block rounded-md bg-over/10 px-2 py-0.5 font-display text-sm font-bold text-over">+${pct(l.dealScore)}%</span>`;
  return `<span class="inline-block rounded-md bg-concrete px-2 py-0.5 text-sm font-medium text-road">tirgus cena</span>`;
}

function row(l) {
  const img = safeUrl(l.image);
  const url = safeUrl(l.url);
  const prev = l.priceHistory?.length ? l.priceHistory.at(-1).price : null;
  const details = [l.mileage != null ? `${fmt.format(l.mileage)} km` : null, l.engine ? `${l.engine} l` : null, l.fuel].filter(Boolean).map(esc).join(', ');

  return `
    <li class="grid grid-cols-[72px_1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5 md:grid-cols-[88px_minmax(0,1.3fr)_minmax(0,1.4fr)_150px_80px]">
      <div class="aspect-[4/3] w-full self-start overflow-hidden rounded-lg bg-concrete md:self-center">
        ${img
          ? `<img src="${esc(img)}" alt="" loading="lazy" class="size-full object-cover">`
          : `<div class="grid size-full place-items-center font-display text-sm font-bold text-road/60">${esc(l.make)}</div>`}
      </div>
      <div class="min-w-0">
        <p class="truncate font-semibold">${esc(l.make)} ${esc(l.model)} <span class="font-normal text-road">${esc(l.year)}</span></p>
        <p class="truncate text-sm text-road">${details}</p>
        <p class="mt-0.5 text-xs text-road/80">${esc(l.source)}</p>
      </div>
      <div class="col-span-2 col-start-2 md:col-span-1 md:col-start-auto md:px-2">${gauge(l)}</div>
      <div class="col-start-3 row-start-1 text-right md:col-start-auto md:row-start-auto">
        <p class="font-display text-xl font-bold tracking-tight">${eur(l.price)}</p>
        ${prev && l.price < prev ? `<p class="text-xs font-medium text-cobalt">bija ${eur(prev)}</p>` : ''}
        <div class="mt-1">${badge(l)}</div>
      </div>
      <div class="hidden text-right md:block">
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:border-asphalt">Atvērt</a>` : ''}
      </div>
    </li>`;
}

// ---------- Saraksts ----------
let debounce;
async function loadListings() {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData($('#filterForm'))) if (v !== '') params.set(k, v);
  try {
    const data = await api('/api/listings?' + params);
    $('#count').textContent = data.total ? `${fmt.format(data.total)} auto` : 'Nekas netika atrasts';
    $('#list').innerHTML = data.items.length
      ? data.items.map(row).join('')
      : `<li class="px-6 py-16 text-center text-road">Neviens auto neatbilst filtriem. Mēģini palielināt cenu vai noņemt modeli.</li>`;
  } catch (e) {
    $('#count').textContent = 'Filtrs nav derīgs';
    $('#list').innerHTML = `<li class="px-6 py-10 text-center text-over">${esc(e.message)}</li>`;
  }
}

async function loadHero() {
  const data = await api('/api/listings?sort=deal&limit=1');
  renderHero(data.items[0]);
}

async function refresh() {
  await Promise.all([loadStats(), loadListings(), loadHero()]);
}

// ---------- Panelis ----------
function openDrawer() {
  $('#drawer').classList.remove('hidden');
  ($('#adminToken').offsetParent ? $('#adminToken') : $('#scrapeMake')).focus();
}
function closeDrawer() {
  $('#drawer').classList.add('hidden');
  $('#openDrawer').focus();
}
window.openDrawer = openDrawer;
$('#openDrawer').addEventListener('click', openDrawer);
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeDrawer));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').classList.contains('hidden')) closeDrawer(); });

$('#filterForm').addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(loadListings, 250);
});
$('#filterForm').addEventListener('submit', (e) => e.preventDefault());

$('#scrapeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  const btn = $('#scrapeBtn');
  btn.disabled = true;
  btn.textContent = 'Skenē ss.lv…';
  setStatus(`Nolasa ${form.pages} lapas. Tas aizņem dažas sekundes.`);
  try {
    const r = await api('/api/scrape', { method: 'POST', body: JSON.stringify({ make: form.make, pages: Number(form.pages) }) });
    setStatus(`Noskenēts: ${r.found} auto, no tiem ${r.added} jauni un ${r.priceDrops} ar zemāku cenu.`, 'ok');
    await refresh();
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Skenēt ss.lv';
  }
});

$('#demoBtn').addEventListener('click', async () => {
  try {
    const r = await api('/api/demo', { method: 'POST' });
    setStatus(`Demo dati ielādēti: ${r.added} jauni auto.`, 'ok');
    refresh();
  } catch (err) { setStatus(err.message, 'err'); }
});

$('#clearBtn').addEventListener('click', async () => {
  if (!confirm('Dzēst visus saglabātos sludinājumus?')) return;
  try {
    await api('/api/listings', { method: 'DELETE' });
    setStatus('Visi sludinājumi dzēsti.', 'ok');
    refresh();
  } catch (err) { setStatus(err.message, 'err'); }
});

// ---------- Starts ----------
(async () => {
  try {
    const [makes, config] = await Promise.all([api('/api/makes'), api('/api/config')]);
    adminRequired = config.adminRequired;
    $('#adminBox').classList.toggle('hidden', !adminRequired);
    const opts = makes.map((m) => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join('');
    $('#scrapeMake').innerHTML = opts;
    $('#filterMake').insertAdjacentHTML('beforeend', opts);
    await refresh();
  } catch (e) {
    $('#count').textContent = 'Neizdevās ielādēt datus';
    $('#list').innerHTML = `<li class="px-6 py-10 text-center text-over">${esc(e.message)}</li>`;
  }
})();
