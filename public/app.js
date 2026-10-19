// DealRadar frontend — bez ietvara, tikai fetch + DOM. Stils: Tailwind (src/styles.css).
const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat('lv-LV');
const eur = (n) => `${fmt.format(n)} €`;
const pct = (n) => new Intl.NumberFormat('lv-LV', { maximumFractionDigits: 1 }).format(Math.abs(n));

// Viss teksts no servera iet caur esc(), lai sludinājuma nosaukums ar <script>
// nevarētu izpildīt kodu (XSS aizsardzība).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

function setStatus(text, tone = 'muted') {
  const el = $('#status');
  el.textContent = text;
  el.className = 'min-h-5 text-sm ' + ({ ok: 'text-below', err: 'text-above', muted: 'text-sub' }[tone]);
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

// ---------- Izdevīgākie šobrīd ----------
async function loadTop() {
  const data = await api('/api/listings?sort=deal&limit=3');
  const deals = data.items.filter((d) => d.dealScore != null && d.dealScore > 0);
  if (!deals.length) {
    $('#top').innerHTML = `
      <div class="md:col-span-3">
        <p class="text-sub">Vēl nav datu, ar ko salīdzināt.</p>
        <button class="btn-dark mt-4" onclick="openDrawer()">Atjaunot datus</button>
      </div>`;
    return;
  }
  $('#top').innerHTML = deals.map((d, i) => {
    const url = safeUrl(d.url);
    const tag = url ? 'a' : 'div';
    const attrs = url ? `href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : '';
    return `
      <${tag} ${attrs} class="group block ${i ? 'md:pl-8' : ''} ${i < 2 ? 'md:pr-8' : ''}">
        <p class="text-5xl font-semibold tracking-[-0.04em] text-below">−${pct(d.dealScore)}%</p>
        <p class="mt-4 font-medium ${url ? 'group-hover:underline underline-offset-4' : ''}">${esc(d.make)} ${esc(d.model)}, ${esc(d.year)}</p>
        <p class="mt-1 text-sm text-sub">${eur(d.price)}, līdzīgi auto ap ${eur(d.marketPrice)}</p>
      </${tag}>`;
  }).join('');
}

// ---------- Statistika ----------
async function loadStats() {
  const s = await api('/api/stats');
  const sources = Object.entries(s.bySource);
  const cell = (value, label) => `
    <div>
      <dd class="text-2xl font-semibold tracking-tight">${value}</dd>
      <dt class="text-sm text-sub">${label}</dt>
    </div>`;
  $('#stats').innerHTML =
    cell(fmt.format(s.total), 'sludinājumi') +
    cell(sources.length, sources.length === 1 ? 'vietne' : 'vietnes') +
    cell(s.superDeals, 'vismaz 20% lētāki');
  $('#sources').textContent = sources.map(([name]) => name).join(', ');
}

// ---------- Cenu skala ----------
// Tieva līnija no lētākā līdz dārgākajam līdzīgajam auto; svītra = tipiskā cena; punkts = šis auto.
function gauge(l) {
  if (l.marketPrice == null || l.rangeMax === l.rangeMin) {
    return `<p class="text-sm text-faint">Par maz līdzīgu auto</p>`;
  }
  const pos = (v) => ((v - l.rangeMin) / (l.rangeMax - l.rangeMin)) * 100;
  const dot = l.dealScore >= 10 ? 'bg-below' : l.dealScore <= -10 ? 'bg-above' : 'bg-ink';
  return `
    <div class="w-full" title="Līdzīgi auto: ${eur(l.rangeMin)} līdz ${eur(l.rangeMax)}, tipiskā cena ${eur(l.marketPrice)}">
      <div class="px-1">
        <div class="relative h-px bg-hair">
          <span class="absolute -top-1.5 h-3 w-px bg-faint" style="left:${pos(l.marketPrice)}%"></span>
          <span class="absolute top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot}" style="left:${pos(l.price)}%"></span>
        </div>
      </div>
      <div class="mt-2.5 flex justify-between text-xs text-faint"><span>${eur(l.rangeMin)}</span><span>${eur(l.rangeMax)}</span></div>
    </div>`;
}

function diff(l) {
  if (l.dealScore == null) return '<span class="text-faint">–</span>';
  if (l.dealScore >= 10) return `<span class="font-medium text-below">−${pct(l.dealScore)}%</span>`;
  if (l.dealScore <= -10) return `<span class="font-medium text-above">+${pct(l.dealScore)}%</span>`;
  return '<span class="text-sub">tirgus cena</span>';
}

function row(l) {
  const url = safeUrl(l.url);
  const prev = l.priceHistory?.length ? l.priceHistory.at(-1).price : null;
  const details = [l.mileage != null ? `${fmt.format(l.mileage)} km` : null, l.engine ? `${l.engine} l` : null, l.fuel].filter(Boolean).map(esc).join(', ');

  return `
    <li class="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 py-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_120px_100px_64px] md:items-center">
      <div class="min-w-0">
        <p class="truncate font-medium">${esc(l.make)} ${esc(l.model)} <span class="text-sub">${esc(l.year)}</span></p>
        <p class="mt-0.5 truncate text-sm text-sub">${details}</p>
        <p class="mt-0.5 text-xs text-faint">${esc(l.source)}</p>
      </div>
      <div class="col-span-2 row-start-2 md:col-span-1 md:row-start-auto">${gauge(l)}</div>
      <div class="text-right md:contents">
        <div class="md:text-right">
          <p class="font-medium">${eur(l.price)}</p>
          ${prev && l.price < prev ? `<p class="text-xs text-below">bija ${eur(prev)}</p>` : ''}
        </div>
        <div class="text-sm md:text-right">${diff(l)}</div>
      </div>
      <div class="hidden text-right md:block">
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="text-sm text-sub underline-offset-4 hover:text-ink hover:underline">Atvērt</a>` : ''}
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
      : `<li class="py-16 text-sub">Neviens auto neatbilst filtriem. Mēģini palielināt cenu vai noņemt modeli.</li>`;
  } catch (e) {
    $('#count').textContent = 'Filtrs nav derīgs';
    $('#list').innerHTML = `<li class="py-10 text-above">${esc(e.message)}</li>`;
  }
}

async function refresh() {
  await Promise.all([loadStats(), loadListings(), loadTop()]);
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
    $('#list').innerHTML = `<li class="py-10 text-above">${esc(e.message)}</li>`;
  }
})();
