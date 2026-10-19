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

// Asistenta atrastos filtrus ieliekam meklēšanas formā, lai saraksts zemāk sakrīt
function applyFilters(f) {
  for (const form of ['#searchForm', '#sideForm']) {
    for (const el of $(form).elements) {
      if (!el.name || el.type === 'radio') continue;
      el.value = f[el.name] ?? (el.name === 'sort' ? 'deal' : '');
    }
  }
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

for (const form of ['#searchForm', '#sideForm']) {
  $(form).addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(loadListings, 250);
  });
}
$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  loadListings();
  $('#results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
$('#resetBtn').addEventListener('click', () => {
  $('#searchForm').reset();
  $('#sideForm').reset();
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
