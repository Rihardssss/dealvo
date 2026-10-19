// DealRadar frontend — bez ietvara, tikai fetch + DOM. Stils: Tailwind (src/styles.css).
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = new Intl.NumberFormat('lv-LV');
const eur = (n) => `${fmt.format(n)} €`;
const pct = (n) => new Intl.NumberFormat('lv-LV', { maximumFractionDigits: 1 }).format(Math.abs(n));

// Viss teksts no servera iet caur esc(), lai sludinājuma nosaukums ar <script>
// nevarētu izpildīt kodu (XSS aizsardzība).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

const SOURCE_LABELS = { 'ss.lv': 'ss.lv', autoscout24: 'AutoScout24', 'mobile.de': 'mobile.de' };
const sourceLabel = (s) => SOURCE_LABELS[s] || s;
let config = { sources: [] };

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = $('#adminToken')?.value;
  if (token) headers['X-Admin-Token'] = token;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors || [`Serveris atbildēja ar ${res.status}`]).join('. '));
  return data;
}

function setStatus(text, tone = 'muted') {
  const el = $('#status');
  el.textContent = text;
  el.className = 'min-h-5 text-sm ' + ({ ok: 'text-below', err: 'text-above', muted: 'text-sub' }[tone]);
}

// ---------- Kopīgie elementi ----------

// Bilde ar rezerves variantu: ja bildes nav vai tā neielādējas, rādām auto siluetu
const CAR_SVG = `<svg viewBox="0 0 120 60" class="w-1/2 text-faint/70" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 42h100M18 42v-8l10-12h40l14 12h18a6 6 0 0 1 6 6v2"/><circle cx="34" cy="44" r="7" fill="white"/><circle cx="88" cy="44" r="7" fill="white"/></svg>`;

function photo(l, cls = '') {
  const img = safeUrl(l.image) || safeUrl(l.thumb);
  return `
    <div class="relative grid place-items-center overflow-hidden bg-wash ${cls}">
      ${CAR_SVG}
      ${img ? `<img src="${esc(img)}" alt="${esc(l.make)} ${esc(l.model)}" loading="lazy" referrerpolicy="no-referrer"
        class="absolute inset-0 size-full object-cover" onerror="this.remove()">` : ''}
    </div>`;
}

function dealBadge(l, size = 'sm') {
  if (l.dealScore == null) return '';
  const big = size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  if (l.dealScore >= 10) return `<span class="inline-block rounded ${big} bg-below-soft font-semibold text-below">${pct(l.dealScore)}% zem tirgus</span>`;
  if (l.dealScore <= -10) return `<span class="inline-block rounded ${big} bg-above/10 font-semibold text-above">${pct(l.dealScore)}% virs tirgus</span>`;
  return `<span class="inline-block rounded ${big} bg-wash font-medium text-sub">tirgus cena</span>`;
}

function facts(l) {
  return [
    l.year,
    l.mileage != null ? `${fmt.format(l.mileage)} km` : null,
    l.body,
    l.fuel,
    l.engine ? `${l.engine} l` : null,
  ].filter(Boolean).map((f) => `<span class="rounded bg-wash px-2 py-0.5">${esc(f)}</span>`).join('');
}

// Tieva līnija no lētākā līdz dārgākajam līdzīgajam auto; svītra = tipiskā cena; punkts = šis auto
function gauge(l) {
  if (l.marketPrice == null || l.rangeMax === l.rangeMin) {
    return `<p class="text-xs text-faint">Par maz līdzīgu auto, lai salīdzinātu</p>`;
  }
  const pos = (v) => ((v - l.rangeMin) / (l.rangeMax - l.rangeMin)) * 100;
  const dot = l.dealScore >= 10 ? 'bg-below' : l.dealScore <= -10 ? 'bg-above' : 'bg-ink';
  return `
    <div title="Līdzīgi auto: ${eur(l.rangeMin)} līdz ${eur(l.rangeMax)}, tipiskā cena ${eur(l.marketPrice)}">
      <div class="px-1">
        <div class="relative h-px bg-hair">
          <span class="absolute -top-1.5 h-3 w-px bg-faint" style="left:${pos(l.marketPrice)}%"></span>
          <span class="absolute top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot}" style="left:${pos(l.price)}%"></span>
        </div>
      </div>
      <div class="mt-2 flex justify-between text-xs text-faint">
        <span>${eur(l.rangeMin)}</span><span>tipiski ${eur(l.marketPrice)}</span><span>${eur(l.rangeMax)}</span>
      </div>
    </div>`;
}

const linkAttrs = (l) => {
  const url = safeUrl(l.url);
  return url ? `href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : '';
};

// ---------- Kartītes ----------

// Kompakta kartīte AI atbildei
function mini(l) {
  const tag = safeUrl(l.url) ? 'a' : 'div';
  return `
    <${tag} ${linkAttrs(l)} class="group flex items-center gap-3 rounded-lg border border-hair bg-paper p-2 pr-3 hover:border-faint">
      ${photo(l, 'aspect-[4/3] w-24 flex-none rounded-md')}
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium group-hover:underline group-hover:underline-offset-4">${esc(l.make)} ${esc(l.model)}, ${esc(l.year)}</p>
        <p class="text-sm font-semibold">${eur(l.price)}</p>
        <div class="mt-1">${dealBadge(l)}</div>
      </div>
    </${tag}>`;
}

function tile(l) {
  const tag = safeUrl(l.url) ? 'a' : 'div';
  return `
    <${tag} ${linkAttrs(l)} class="group block w-64 flex-none snap-start overflow-hidden rounded-xl border border-hair bg-paper transition-shadow hover:shadow-md sm:w-auto">
      ${photo(l, 'aspect-[16/10]')}
      <div class="p-4">
        <p class="truncate font-medium group-hover:underline group-hover:underline-offset-4">${esc(l.make)} ${esc(l.model)}</p>
        <p class="mt-0.5 text-sm text-sub">${esc(l.year)}${l.mileage != null ? `, ${fmt.format(l.mileage)} km` : ''}</p>
        <div class="mt-3 flex items-end justify-between gap-2">
          <p class="text-lg font-semibold tracking-tight">${eur(l.price)}</p>
          ${dealBadge(l)}
        </div>
      </div>
    </${tag}>`;
}

function listCard(l) {
  const url = safeUrl(l.url);
  const prev = l.priceHistory?.length ? l.priceHistory.at(-1).price : null;
  return `
    <li class="overflow-hidden rounded-xl border border-hair bg-paper transition-shadow hover:shadow-md">
      <div class="grid sm:grid-cols-[240px_1fr]">
        <a ${linkAttrs(l)} class="block">${photo(l, 'aspect-[4/3] h-full sm:aspect-auto sm:min-h-[180px]')}</a>
        <div class="grid gap-4 p-4 sm:p-5 md:grid-cols-[1fr_180px]">
          <div class="min-w-0">
            <a ${linkAttrs(l)} class="block truncate text-lg font-semibold tracking-tight ${url ? 'hover:underline hover:underline-offset-4' : ''}">
              ${esc(l.make)} ${esc(l.model)}
            </a>
            <p class="truncate text-sm text-sub">${esc(l.title)}</p>
            <div class="mt-3 flex flex-wrap gap-1.5 text-sm text-sub">${facts(l)}</div>
            <div class="mt-5 max-w-md">${gauge(l)}</div>
          </div>
          <div class="flex flex-row items-end justify-between gap-3 md:flex-col md:items-end md:justify-start md:text-right">
            <div>
              <p class="text-2xl font-semibold tracking-tight">${eur(l.price)}</p>
              ${prev && l.price < prev ? `<p class="text-sm text-below">cena samazināta, bija ${eur(prev)}</p>` : ''}
              <div class="mt-1.5">${dealBadge(l)}</div>
            </div>
            <div class="text-sm text-sub md:mt-auto">
              <p>${esc(sourceLabel(l.source))}${l.country ? `, ${esc(l.country)}` : ''}</p>
              ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="mt-1 inline-block font-medium text-navy underline-offset-4 hover:underline">Atvērt sludinājumu</a>` : ''}
            </div>
          </div>
        </div>
      </div>
    </li>`;
}

// ---------- Dati ----------

function filters() {
  const params = new URLSearchParams();
  for (const form of ['#searchForm', '#sideForm']) {
    for (const [k, v] of new FormData($(form))) if (v !== '') params.set(k, v);
  }
  return params;
}

let debounce;
async function loadListings() {
  try {
    const data = await api('/api/listings?' + filters());
    $('#count').textContent = data.total ? `${fmt.format(data.total)} auto` : 'Nekas netika atrasts';
    $('#showBtn').textContent = `Rādīt ${fmt.format(data.total)} auto`;
    $('#list').innerHTML = data.items.length
      ? data.items.map(listCard).join('')
      : `<li class="rounded-xl border border-hair bg-paper px-6 py-14 text-center text-sub">Neviens auto neatbilst filtriem. Mēģini palielināt cenu vai noņemt modeli.</li>`;
  } catch (e) {
    $('#count').textContent = 'Filtrs nav derīgs';
    $('#list').innerHTML = `<li class="rounded-xl border border-hair bg-paper px-6 py-10 text-above">${esc(e.message)}</li>`;
  }
}

async function loadTop() {
  const data = await api('/api/listings?sort=deal&limit=4');
  const deals = data.items.filter((d) => d.dealScore != null && d.dealScore > 0);
  $('#topGrid').innerHTML = deals.length
    ? deals.map(tile).join('')
    : `<div class="rounded-xl border border-dashed border-hair bg-paper p-8 text-sub sm:col-span-2 lg:col-span-4">
        Vēl nav datu, ar ko salīdzināt. <button class="font-medium text-navy underline underline-offset-4" onclick="openDrawer()">Atjaunot datus</button>
      </div>`;
}

async function loadStats() {
  const s = await api('/api/stats');
  const names = Object.keys(s.bySource).map(sourceLabel);
  $('#sourceLine').textContent = s.total
    ? `${fmt.format(s.total)} sludinājumi no ${names.join(', ')}. ${fmt.format(s.superDeals)} no tiem ir vismaz 20% lētāki par līdzīgiem auto.`
    : 'Datu vēl nav. Nospied "Atjaunot datus", lai noskenētu vietnes.';
  // Vietņu filtrs sānjoslā — rādām tikai tās, kurām ir dati
  const current = new FormData($('#sideForm')).get('source') || '';
  $('#sourceRadios').innerHTML = [['', 'Visas', s.total], ...Object.entries(s.bySource).map(([k, n]) => [k, sourceLabel(k), n])]
    .map(([val, label, n]) => `
      <label class="flex cursor-pointer items-center justify-between gap-2">
        <span class="flex items-center gap-2"><input type="radio" name="source" value="${esc(val)}" ${val === current ? 'checked' : ''} class="accent-navy">${esc(label)}</span>
        <span class="text-faint">${fmt.format(n)}</span>
      </label>`).join('');
}

async function refresh() {
  await Promise.all([loadStats(), loadListings(), loadTop()]);
}

// ---------- AI asistents ----------

async function askAssistant(question) {
  const box = $('#aiResult');
  const btn = $('#aiBtn');
  btn.disabled = true;
  btn.textContent = 'Domā…';
  box.className = 'mt-5 rounded-lg bg-wash p-4 text-sub';
  box.textContent = 'Meklēju piemērotākos auto…';
  try {
    const r = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ question }) });
    box.className = 'mt-5 border-t border-hair pt-5';
    box.innerHTML = `
      <div class="flex items-start gap-3">
        <span class="mt-0.5 grid size-7 flex-none place-items-center rounded-full bg-navy text-xs font-semibold text-paper">AI</span>
        <div class="min-w-0">
          <p class="max-w-[75ch] leading-relaxed">${esc(r.answer).replace(/\n/g, '<br>')}</p>
          <p class="mt-1 text-xs text-faint">${r.mode === 'claude' ? 'Atbildi sagatavoja Claude, izmantojot tikai DealRadar datus.' : 'Bezsaistes režīms: filtri nolasīti no tava teksta.'}</p>
        </div>
      </div>
      ${r.items.length ? `<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${r.items.slice(0, 3).map(mini).join('')}</div>` : ''}`;
    if (r.filters) applyFilters(r.filters);
  } catch (err) {
    box.className = 'mt-5 rounded-lg bg-above/10 p-4 text-above';
    box.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Jautāt';
  }
}

// Izvēlnē ieliek vērtību; ja tādas opcijas nav (piem. AI deva 8200 €), pievieno to
function setSelect(el, value) {
  if (value == null || value === '') { el.value = ''; return; }
  const v = String(value);
  if (![...el.options].some((o) => o.value === v)) {
    const label = el.dataset.prices !== undefined ? eur(Number(v)) : el.id === 'maxMileage' ? `${fmt.format(Number(v))} km` : v;
    el.add(new Option(label, v));
  }
  el.value = v;
}

// Asistenta atrastos filtrus ieliekam meklēšanas formā, lai saraksts zemāk sakrīt
async function applyFilters(f) {
  setSelect($('#filterMake'), f.make);
  await loadModels(f.make || '');
  setSelect($('#filterModel'), f.model);
  for (const id of ['minYear', 'maxYear', 'minPrice', 'maxPrice', 'maxMileage', 'fuel']) setSelect($('#' + id), f[id]);
  setBody(f.body || '');
  $('#sideForm').elements.sort.value = f.sort || 'deal';
  loadListings();
}

$('#aiForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#aiInput').value.trim();
  if (q) askAssistant(q);
});
$$('#aiExamples button').forEach((b) => b.addEventListener('click', () => {
  $('#aiInput').value = b.textContent;
  askAssistant(b.textContent);
}));

// ---------- Filtri ----------

const BODY_ICONS = {
  '': '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="24" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="36" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  sedans: '<path d="M4 17v-3l6-1 5-5h13l6 5 8 1v3"/>',
  'universālis': '<path d="M4 17v-3l5-1 5-5h22l5 6h3v3"/>',
  'hečbeks': '<path d="M8 17v-3l5-1 5-5h11l5 6h4v3"/>',
  apvidus: '<path d="M4 17v-6l5-1 4-5h21l3 6h5v6"/>',
  minivens: '<path d="M4 17v-6l7-6h29l1 12"/>',
  kupeja: '<path d="M4 17v-3l7-1 7-4h9l8 4 9 1v3"/>',
  kabriolets: '<path d="M4 17v-3l7-1h7l2-3M20 13h24v4"/>',
};
const BODY_LABELS = { '': 'Visas', sedans: 'Sedans', 'universālis': 'Universālis', 'hečbeks': 'Hečbeks', apvidus: 'Apvidus', minivens: 'Minivens', kupeja: 'Kupeja', kabriolets: 'Kabriolets' };

function renderBodyTypes() {
  $('#bodyTypes').innerHTML = Object.keys(BODY_LABELS).map((key) => `
    <label class="cursor-pointer">
      <input type="radio" name="body" value="${esc(key)}" class="peer sr-only" ${key === '' ? 'checked' : ''}>
      <span class="flex h-full flex-col items-center gap-1 rounded-lg border border-hair px-1 py-2.5 text-xs text-sub transition-colors
        hover:border-faint peer-checked:border-navy peer-checked:bg-navy/5 peer-checked:text-navy peer-focus-visible:ring-2 peer-focus-visible:ring-navy">
        <svg viewBox="0 0 48 24" class="h-8 w-16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${BODY_ICONS[key]}${key ? '<circle cx="14" cy="17" r="3.2" fill="var(--color-paper)"/><circle cx="35" cy="17" r="3.2" fill="var(--color-paper)"/>' : ''}
        </svg>
        ${BODY_LABELS[key]}
      </span>
    </label>`).join('');
}
function setBody(value) {
  const r = $(`#bodyTypes input[value="${CSS.escape(value)}"]`) || $('#bodyTypes input[value=""]');
  r.checked = true;
}

function fillRangeSelects() {
  const now = new Date().getFullYear();
  const years = Array.from({ length: now - 1989 }, (_, i) => now - i);
  for (const el of $$('[data-years]')) el.insertAdjacentHTML('beforeend', years.map((y) => `<option value="${y}">${y}</option>`).join(''));
  const prices = [500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7500, 10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 75000];
  for (const el of $$('[data-prices]')) el.insertAdjacentHTML('beforeend', prices.map((p) => `<option value="${p}">${eur(p)}</option>`).join(''));
  const kms = [25000, 50000, 75000, 100000, 125000, 150000, 200000, 250000, 300000];
  $('#maxMileage').insertAdjacentHTML('beforeend', kms.map((k) => `<option value="${k}">${fmt.format(k)} km</option>`).join(''));
}

// Izvēloties marku, ielādējam tās modeļus (ar sludinājumu skaitu)
async function loadModels(make) {
  const el = $('#filterModel');
  if (!make) {
    el.innerHTML = '<option value="">Vispirms izvēlies marku</option>';
    el.disabled = true;
    return;
  }
  const models = await api('/api/models?make=' + encodeURIComponent(make));
  el.innerHTML = '<option value="">Visi modeļi</option>' + models.map((m) =>
    `<option value="${esc(m.model)}">${esc(m.model)}${m.count ? ` (${fmt.format(m.count)})` : ''}</option>`).join('');
  el.disabled = false;
}
$('#filterMake').addEventListener('change', (e) => loadModels(e.target.value).then(loadListings));

// Ja "gads no" > "gads līdz" (vai cenas), otru lauku pielāgojam, nevis rādām kļūdu
function keepRangeOrder(fromId, toId) {
  const from = $('#' + fromId), to = $('#' + toId);
  from.addEventListener('change', () => { if (to.value && from.value && Number(from.value) > Number(to.value)) to.value = from.value; });
  to.addEventListener('change', () => { if (to.value && from.value && Number(from.value) > Number(to.value)) from.value = to.value; });
}
keepRangeOrder('minYear', 'maxYear');
keepRangeOrder('minPrice', 'maxPrice');

for (const form of ['#searchForm', '#sideForm']) {
  $(form).addEventListener('change', (e) => {
    if (e.target.id === 'filterMake') return; // to apstrādā loadModels
    clearTimeout(debounce);
    debounce = setTimeout(loadListings, 150);
  });
}
$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  loadListings();
  $('#results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
$('#resetBtn').addEventListener('click', async () => {
  $('#searchForm').reset();
  $('#sideForm').reset();
  await loadModels('');
  loadListings();
});

// ---------- Datu panelis ----------

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
$$('[data-close]').forEach((el) => el.addEventListener('click', closeDrawer));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').classList.contains('hidden')) closeDrawer(); });

$('#scrapeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const sources = form.getAll('sources');
  if (!sources.length) return setStatus('Izvēlies vismaz vienu vietni.', 'err');
  const btn = $('#scrapeBtn');
  btn.disabled = true;
  btn.textContent = 'Skenē…';
  $('#scrapeReport').innerHTML = '';
  setStatus('Notiek skenēšana. Tas var aizņemt līdz minūtei.');
  try {
    const r = await api('/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ make: form.get('make'), pages: Number(form.get('pages')), sources }),
    });
    $('#scrapeReport').innerHTML = r.report.map((s) => `
      <li class="${s.ok ? 'text-ink' : 'text-above'}">
        <span class="font-medium">${esc(s.source)}:</span> ${s.ok ? `${s.found} auto` : esc(s.error)}
      </li>`).join('');
    setStatus(`Kopā ${r.found} auto, no tiem ${r.added} jauni un ${r.priceDrops} ar zemāku cenu.`, r.found ? 'ok' : 'muted');
    await refresh();
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Skenēt';
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
    const [makes, cfg] = await Promise.all([api('/api/makes'), api('/api/config')]);
    config = cfg;
    $('#adminBox').classList.toggle('hidden', !cfg.adminRequired);
    renderBodyTypes();
    fillRangeSelects();
    const opts = makes.map((m) => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join('');
    $('#scrapeMake').innerHTML = opts;
    $('#filterMake').insertAdjacentHTML('beforeend', opts);
    $('#scrapeSources').innerHTML = '<legend class="field-label">Vietnes</legend>' + cfg.sources.map((s) => `
      <label class="flex items-center gap-2"><input type="checkbox" name="sources" value="${esc(s.key)}" checked class="accent-navy">
        ${esc(s.label)} <span class="text-faint">${esc(s.country)}</span></label>`).join('');
    await refresh();
  } catch (e) {
    $('#count').textContent = 'Neizdevās ielādēt datus';
    $('#list').innerHTML = `<li class="text-above">${esc(e.message)}</li>`;
  }
})();
