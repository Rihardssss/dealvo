// DealRadar frontend — bez ietvara, tikai fetch + DOM. Stils: Tailwind (src/styles.css).
const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat('lv-LV');
const eur = (n) => `${fmt.format(n)} €`;
const pct = (n) => new Intl.NumberFormat('lv-LV', { maximumFractionDigits: 1 }).format(Math.abs(n));

// Viss teksts no servera iet caur esc(), lai sludinājuma nosaukums ar <script>
// nevarētu izpildīt kodu (XSS aizsardzība).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

const SWEEP_SECONDS = 6; // jāsakrīt ar .radar-sweep animāciju CSS

function setStatus(text, tone = 'muted') {
  const el = $('#status');
  el.textContent = text;
  el.className = 'min-h-6 text-sm ' + ({ ok: 'text-scan font-medium', err: 'text-over font-medium', muted: 'text-mist' }[tone]);
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

// ---------- Radars ----------
// Katrs punkts ir viens deals. Attālums no centra = cik liela atlaide (tuvāk = labāk).
// Leņķis ir noteikts no sludinājuma ID, lai punkti nelēkātu pēc katras ielādes.
function angleFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

let radarDeals = [];

function renderRadar(deals, selectedKey) {
  const rings = [0.25, 0.5, 0.75, 1].map((r) =>
    `<div class="absolute rounded-full border border-scan/15" style="inset:${(1 - r) * 50}%"></div>`).join('');

  const empty = !deals.length;
  const max = Math.max(...deals.map((d) => d.dealScore), 1);
  const blips = deals.map((d, i) => {
    const key = `${d.source}:${d.externalId}`;
    const angle = angleFor(key);
    const r = 0.14 + 0.8 * (1 - d.dealScore / max);
    const x = 50 + r * 46 * Math.sin((angle * Math.PI) / 180);
    const y = 50 - r * 46 * Math.cos((angle * Math.PI) / 180);
    const delay = `${((angle / 360) * SWEEP_SECONDS).toFixed(2)}s`;
    const size = d.dealLabel === 'super' ? 14 : 10;
    const color = d.dealLabel === 'super' ? 'bg-scan shadow-[0_0_16px_4px_rgb(77_225_255/0.7)]' : 'bg-glow shadow-[0_0_14px_3px_rgb(139_92_255/0.7)]';
    const selected = key === selectedKey;
    return `
      <button type="button" data-blip="${i}" aria-label="${esc(d.make)} ${esc(d.model)} ${esc(d.year)}, ${pct(d.dealScore)}% lētāk"
        class="group absolute z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center" style="left:${x}%;top:${y}%">
        <span class="blip-ring pointer-events-none absolute rounded-full border border-scan/70" style="left:50%;top:50%;width:${size}px;height:${size}px;margin:-${size/2}px 0 0 -${size/2}px;animation-delay:${delay}"></span>
        <span class="blip absolute left-1/2 top-1/2 rounded-full ${color} ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-night' : ''}"
          style="width:${size}px;height:${size}px;animation-delay:${delay}"></span>
        <span class="pointer-events-none absolute bottom-full mb-1 whitespace-nowrap rounded-md bg-night/90 px-2 py-1 text-xs font-semibold opacity-0 ring-1 ring-white/10 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          ${esc(d.make)} ${esc(d.model)}, −${pct(d.dealScore)}%
        </span>
      </button>`;
  }).join('');

  $('#radar').innerHTML = `
    <div class="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(77_225_255/0.10),rgb(14_21_40/0.6)_55%,rgb(6_9_19/0.2)_72%)] ring-1 ring-scan/25 shadow-[0_0_80px_-10px_rgb(77_225_255/0.35),inset_0_0_60px_rgb(77_225_255/0.06)]"></div>
    ${rings}
    <div class="absolute inset-y-0 left-1/2 w-px bg-scan/10"></div>
    <div class="absolute inset-x-0 top-1/2 h-px bg-scan/10"></div>
    <div class="radar-sweep absolute inset-0 rounded-full"></div>
    <div class="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-scan shadow-[0_0_12px_rgb(77_225_255)]"></div>
    ${blips}
    ${empty ? `
      <div class="absolute inset-0 grid place-items-center p-10 text-center">
        <div>
          <p class="font-display text-2xl font-bold">Radars ir tukšs</p>
          <p class="mt-2 text-sm text-mist">Noskenē ss.lv vai ielādē demo datus.</p>
          <button class="btn-scan mt-5" onclick="openDrawer()">Atjaunot datus</button>
        </div>
      </div>` : ''}`;

  $('#radar').querySelectorAll('[data-blip]').forEach((el) =>
    el.addEventListener('click', () => focusDeal(Number(el.dataset.blip))));
}

function focusDeal(i) {
  const d = radarDeals[i];
  if (!d) { $('#focus').innerHTML = ''; return; }
  renderRadar(radarDeals, `${d.source}:${d.externalId}`);
  const url = safeUrl(d.url);
  const img = safeUrl(d.image);
  $('#focus').innerHTML = `
    <article class="glass animate-rise flex items-center gap-4 rounded-2xl p-4">
      <div class="size-16 flex-none overflow-hidden rounded-xl bg-panel">
        ${img ? `<img src="${esc(img)}" alt="" class="size-full object-cover">` : `<div class="grid size-full place-items-center font-display text-xs font-bold text-mist">${esc(d.make)}</div>`}
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold">${esc(d.make)} ${esc(d.model)} <span class="font-normal text-mist">${esc(d.year)}</span></p>
        <p class="text-sm text-mist">tirgū ap ${eur(d.marketPrice)}, ietaupi <span class="text-scan">${eur(d.marketPrice - d.price)}</span></p>
      </div>
      <div class="text-right">
        <p class="bg-gradient-to-r from-scan to-glow bg-clip-text font-display text-2xl font-extrabold tracking-tight text-transparent">−${pct(d.dealScore)}%</p>
        <p class="font-display text-lg font-bold">${eur(d.price)}</p>
      </div>
      ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="btn-scan hidden flex-none sm:block">Skatīt</a>` : ''}
    </article>`;
}

async function loadRadar() {
  const data = await api('/api/listings?sort=deal&limit=24');
  radarDeals = data.items.filter((d) => d.dealScore != null && d.dealScore >= 10);
  renderRadar(radarDeals);
  focusDeal(0);
}

// ---------- Statistika ----------
async function loadStats() {
  const s = await api('/api/stats');
  const sources = Object.entries(s.bySource);
  const cell = (value, label, accent) => `
    <div class="glass rounded-2xl px-4 py-3">
      <dt class="text-[13px] text-mist">${label}</dt>
      <dd class="font-display text-2xl font-bold tracking-tight ${accent ? 'text-scan' : ''}">${value}</dd>
    </div>`;
  $('#stats').innerHTML = cell(fmt.format(s.total), 'sludinājumi') + cell(sources.length, 'vietnes') + cell(s.superDeals, 'super deali', true);
  $('#sources').innerHTML = sources
    .map(([name, n]) => `<span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium">${esc(name)} <span class="text-mist">${fmt.format(n)}</span></span>`)
    .join('');
}

// ---------- Cenu skala ----------
function gauge(l) {
  if (l.marketPrice == null || l.rangeMax === l.rangeMin) {
    return `<p class="text-sm text-mist">Par maz līdzīgu auto salīdzināšanai</p>`;
  }
  const pos = (v) => ((v - l.rangeMin) / (l.rangeMax - l.rangeMin)) * 100;
  const dot = {
    super: 'bg-scan shadow-[0_0_14px_3px_rgb(77_225_255/0.6)]',
    labs: 'bg-glow shadow-[0_0_12px_2px_rgb(139_92_255/0.6)]',
    tirgus: 'bg-fair',
    'dārgs': 'bg-over shadow-[0_0_12px_2px_rgb(255_93_115/0.5)]',
  }[l.dealLabel];
  return `
    <div class="w-full" title="Līdzīgi auto: ${eur(l.rangeMin)} līdz ${eur(l.rangeMax)}">
      <div class="px-2">
        <div class="relative h-1.5 rounded-full bg-gradient-to-r from-scan/60 via-rim to-over/50">
          <span class="absolute -top-1.5 h-[18px] w-0.5 rounded bg-ink/70" style="left:${pos(l.marketPrice)}%"></span>
          <span class="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-night ${dot}" style="left:${pos(l.price)}%"></span>
        </div>
      </div>
      <div class="mt-2 flex justify-between text-xs text-mist"><span>${eur(l.rangeMin)}</span><span>${eur(l.rangeMax)}</span></div>
    </div>`;
}

function badge(l) {
  if (l.dealScore == null) return '';
  if (l.dealLabel === 'super') return `<span class="deal-chip inline-block rounded-lg px-2 py-0.5 font-display text-sm font-bold text-scan">−${pct(l.dealScore)}%</span>`;
  if (l.dealLabel === 'labs') return `<span class="inline-block rounded-lg bg-glow/15 px-2 py-0.5 font-display text-sm font-bold text-[#b9a1ff] ring-1 ring-glow/30">−${pct(l.dealScore)}%</span>`;
  if (l.dealLabel === 'dārgs') return `<span class="inline-block rounded-lg bg-over/10 px-2 py-0.5 font-display text-sm font-bold text-over ring-1 ring-over/25">+${pct(l.dealScore)}%</span>`;
  return `<span class="inline-block rounded-lg bg-white/5 px-2 py-0.5 text-sm font-medium text-mist">tirgus cena</span>`;
}

function row(l) {
  const img = safeUrl(l.image);
  const url = safeUrl(l.url);
  const prev = l.priceHistory?.length ? l.priceHistory.at(-1).price : null;
  const details = [l.mileage != null ? `${fmt.format(l.mileage)} km` : null, l.engine ? `${l.engine} l` : null, l.fuel].filter(Boolean).map(esc).join(', ');

  return `
    <li class="grid grid-cols-[72px_1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-white/[0.025] sm:px-5 md:grid-cols-[88px_minmax(0,1.3fr)_minmax(0,1.4fr)_150px_84px]">
      <div class="aspect-[4/3] w-full self-start overflow-hidden rounded-xl bg-panel ring-1 ring-white/5 md:self-center">
        ${img
          ? `<img src="${esc(img)}" alt="" loading="lazy" class="size-full object-cover">`
          : `<div class="grid size-full place-items-center font-display text-sm font-bold text-mist/60">${esc(l.make)}</div>`}
      </div>
      <div class="min-w-0">
        <p class="truncate font-semibold">${esc(l.make)} ${esc(l.model)} <span class="font-normal text-mist">${esc(l.year)}</span></p>
        <p class="truncate text-sm text-mist">${details}</p>
        <p class="mt-0.5 text-xs text-mist/70">${esc(l.source)}</p>
      </div>
      <div class="col-span-2 col-start-2 md:col-span-1 md:col-start-auto md:px-2">${gauge(l)}</div>
      <div class="col-start-3 row-start-1 text-right md:col-start-auto md:row-start-auto">
        <p class="font-display text-xl font-bold tracking-tight">${eur(l.price)}</p>
        ${prev && l.price < prev ? `<p class="text-xs font-medium text-scan">bija ${eur(prev)}</p>` : ''}
        <div class="mt-1">${badge(l)}</div>
      </div>
      <div class="hidden text-right md:block">
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold transition hover:border-scan/60 hover:text-scan">Atvērt</a>` : ''}
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
      : `<li class="px-6 py-16 text-center text-mist">Neviens auto neatbilst filtriem. Mēģini palielināt cenu vai noņemt modeli.</li>`;
  } catch (e) {
    $('#count').textContent = 'Filtrs nav derīgs';
    $('#list').innerHTML = `<li class="px-6 py-10 text-center text-over">${esc(e.message)}</li>`;
  }
}

async function refresh() {
  await Promise.all([loadStats(), loadListings(), loadRadar()]);
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
    $('#adminBox').classList.toggle('hidden', !config.adminRequired);
    const opts = makes.map((m) => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join('');
    $('#scrapeMake').innerHTML = opts;
    $('#filterMake').insertAdjacentHTML('beforeend', opts);
    await refresh();
  } catch (e) {
    $('#count').textContent = 'Neizdevās ielādēt datus';
    $('#list').innerHTML = `<li class="px-6 py-10 text-center text-over">${esc(e.message)}</li>`;
  }
})();
