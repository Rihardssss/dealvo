// Dealvo frontend — bez ietvara, tikai fetch + DOM. Stils: Tailwind (src/styles.css).
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = new Intl.NumberFormat('lv-LV');
const eur = (n) => `${fmt.format(n)} €`;
const pct = (n) => new Intl.NumberFormat('lv-LV', { maximumFractionDigits: 1 }).format(Math.abs(n));

// Viss teksts no servera iet caur esc(), lai sludinājuma nosaukums ar <script>
// nevarētu izpildīt kodu (XSS aizsardzība).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

const SOURCE_LABELS = { 'ss.lv': 'ss.lv', autoscout24: 'AutoScout24', 'mobile.de': 'mobile.de', otomoto: 'otomoto.pl' };
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
  if (l.damaged) return `<span class="inline-block rounded ${size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'} bg-above/10 font-medium text-above">bojāts / daļām</span>`;
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

// Cenu salīdzinājums: augšā tirgus cena un starpība, zem tā josla no lētākā līdz dārgākajam
// līdzīgajam auto (zaļā daļa = lētāk par tirgu, oranžā = dārgāk), aplis = šis auto.
function gauge(l) {
  if (l.damaged) return `<p class="text-xs text-above">Bojāts vai rezerves daļām, tāpēc ar tirgu nesalīdzinām</p>`;
  if (l.marketPrice == null || l.rangeMax === l.rangeMin) {
    return `<p class="text-xs text-faint">Par maz līdzīgu auto, lai salīdzinātu ar tirgu</p>`;
  }
  const pos = (v) => Math.min(100, Math.max(0, ((v - l.rangeMin) / (l.rangeMax - l.rangeMin)) * 100));
  const diff = l.marketPrice - l.price;
  const m = pos(l.marketPrice);
  const p = pos(l.price);
  const ring = l.dealScore >= 10 ? 'border-below' : l.dealScore <= -10 ? 'border-above' : 'border-ink';
  const diffHtml = Math.abs(l.dealScore) < 3
    ? `<span class="font-medium text-ink">atbilst tirgum</span>`
    : diff > 0
      ? `<span class="font-semibold text-below">${eur(diff)} lētāk</span>`
      : `<span class="font-semibold text-above">${eur(-diff)} dārgāk</span>`;
  return `
    <div title="Līdzīgi auto (${l.comparables}): ${eur(l.rangeMin)}–${eur(l.rangeMax)}">
      <div class="flex items-baseline justify-between gap-3 text-sm">
        <span class="text-sub">Tirgus cena <span class="font-medium text-ink">${eur(l.marketPrice)}</span></span>
        ${diffHtml}
      </div>
      <div class="relative mt-2.5 h-1.5 rounded-full bg-hair">
        <span class="absolute inset-y-0 left-0 rounded-l-full bg-below/25" style="width:${m}%"></span>
        <span class="absolute inset-y-0 right-0 rounded-r-full bg-above/20" style="width:${100 - m}%"></span>
        <span class="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded bg-ink/60" style="left:${m}%"></span>
        <span class="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] ${ring} bg-paper shadow-sm" style="left:${p}%"></span>
      </div>
      <div class="mt-1.5 flex justify-between text-[11px] text-faint"><span>${eur(l.rangeMin)}</span><span>${eur(l.rangeMax)}</span></div>
      ${l.dealScore > 35 ? `<p class="mt-2 text-xs text-above">Aizdomīgi lēts. Pirms pirkšanas pārbaudi stāvokli un vēsturi.</p>` : ''}
    </div>`;
}

// (vairs netiek lietots kartītēs — tās atver pilno skatu)
const linkAttrs = (l) => {
  const url = safeUrl(l.url);
  return url ? `href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : '';
};

// ---------- Kartītes ----------

// Atslēga, ar kuru atver sludinājuma pilno skatu
const openAttr = (l) => `data-open="${esc(l.source)}|${esc(l.externalId)}"`;

function sellerLine(s) {
  if (!s || (!s.type && !s.city)) return '';
  const who = s.type === 'dīleris' ? (s.name ? `Dīleris ${esc(s.name)}` : 'Dīleris') : s.type === 'privātpersona' ? 'Privātpersona' : '';
  return [who, s.city ? esc(s.city) : ''].filter(Boolean).join(', ');
}

// Kompakta kartīte AI atbildei un līdzīgajiem auto
function mini(l) {
  return `
    <button type="button" ${openAttr(l)} class="group flex w-full items-center gap-3 rounded-lg border border-hair bg-paper p-2 pr-3 text-left hover:border-faint">
      ${photo(l, 'aspect-[4/3] w-24 flex-none rounded-md')}
      <span class="block min-w-0 flex-1">
        <span class="block truncate text-sm font-medium group-hover:underline group-hover:underline-offset-4"><span translate="no">${esc(l.make)} ${esc(l.model)}</span>, ${esc(l.year)}</span>
        <span class="block text-sm font-semibold">${eur(l.price)}</span>
        <span class="mt-1 block">${dealBadge(l)}</span>
      </span>
    </button>`;
}

function tile(l) {
  return `
    <button type="button" ${openAttr(l)} class="group block w-64 flex-none snap-start overflow-hidden rounded-xl border border-hair bg-paper text-left transition-shadow hover:shadow-md sm:w-auto">
      ${photo(l, 'aspect-[16/10]')}
      <span class="block p-4">
        <span class="block truncate font-medium group-hover:underline group-hover:underline-offset-4"><span translate="no">${esc(l.make)} ${esc(l.model)}</span></span>
        <span class="mt-0.5 block text-sm text-sub">${esc(l.year)}${l.mileage != null ? `, ${fmt.format(l.mileage)} km` : ''}</span>
        <span class="mt-3 flex items-end justify-between gap-2">
          <span class="text-lg font-semibold tracking-tight">${eur(l.price)}</span>
          ${dealBadge(l)}
        </span>
      </span>
    </button>`;
}

function listCard(l) {
  const prev = l.priceHistory?.length ? l.priceHistory.at(-1).price : null;
  const seller = sellerLine(l.seller);
  return `
    <li class="overflow-hidden rounded-xl border border-hair bg-paper transition-shadow hover:shadow-md">
      <div class="grid sm:grid-cols-[240px_1fr]">
        <button type="button" ${openAttr(l)} class="block text-left" aria-label="Atvērt ${esc(l.make)} ${esc(l.model)}">${photo(l, 'aspect-[4/3] h-full sm:aspect-auto sm:min-h-[180px]')}</button>
        <div class="grid gap-4 p-4 sm:p-5 md:grid-cols-[1fr_190px]">
          <div class="min-w-0">
            <button type="button" ${openAttr(l)} class="block max-w-full truncate text-left text-lg font-semibold tracking-tight hover:underline hover:underline-offset-4">
              <span translate="no">${esc(l.make)} ${esc(l.model)}</span>
            </button>
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
              ${seller ? `<p class="text-ink">${seller}</p>` : ''}
              <p>${esc(sourceLabel(l.source))}${l.country ? `, ${esc(l.country)}` : ''}</p>
              <button type="button" ${openAttr(l)} class="mt-1 font-medium text-navy underline-offset-4 hover:underline">Skatīt sīkāk</button>
            </div>
          </div>
        </div>
      </div>
    </li>`;
}

// ---------- Sludinājuma pilnais skats ----------

let lastFocus = null;
let gallery = { photos: [], i: 0 };

function showPhoto(i) {
  const n = gallery.photos.length;
  if (!n) return;
  gallery.i = (i + n) % n;
  const img = $('#carMainPhoto');
  img.src = gallery.photos[gallery.i];
  $('#carPhotoCount').textContent = `${gallery.i + 1} / ${n}`;
  $$('#carThumbs button').forEach((b, k) => b.classList.toggle('ring-2', k === gallery.i));
}

function specRows(l) {
  const d = l.details;
  const rows = [
    ['Gads', l.year],
    ['Nobraukums', l.mileage != null ? `${fmt.format(l.mileage)} km` : null],
    ['Degviela', l.fuel],
    ['Virsbūve', l.body],
    ['Dzinējs', l.engine ? `${l.engine} l` : null],
    ...Object.entries(d.specs || {}),
    ['Vietne', sourceLabel(l.source) + (l.country ? `, ${l.country}` : '')],
  ];
  const seen = new Set();
  return rows.filter(([k, v]) => v && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()))
    .map(([k, v]) => `<div class="flex justify-between gap-4 border-b border-hair py-2.5 text-sm"><dt class="text-sub">${esc(k)}</dt><dd class="text-right font-medium">${esc(v)}</dd></div>`).join('');
}

function renderCar(l) {
  const d = l.details;
  const url = safeUrl(l.url);
  gallery = { photos: (d.photos || []).map(safeUrl).filter(Boolean), i: 0 };
  const s = d.seller || {};
  const sellerTitle = s.type === 'dīleris' ? (s.name || 'Dīleris') : s.type === 'privātpersona' ? 'Privātpersona' : 'Pārdevējs';
  const sellerKind = s.type === 'dīleris' && s.name ? 'Dīleris' : '';

  return `
    <div class="flex items-start justify-between gap-4 border-b border-hair px-5 py-4 sm:px-6">
      <div class="min-w-0">
        <h2 id="carTitle" class="truncate text-xl font-semibold tracking-tight sm:text-2xl"><span translate="no">${esc(l.make)} ${esc(l.model)}</span> <span class="font-normal text-sub">${esc(l.year)}</span></h2>
        <p class="truncate text-sm text-sub">${esc(l.title)}</p>
      </div>
      <button type="button" data-close-car class="flex-none rounded-md p-1.5 text-sub hover:bg-wash" aria-label="Aizvērt">
        <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>

    <div class="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_320px]">
      <div class="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
          <div class="relative overflow-hidden rounded-xl bg-wash">
            ${gallery.photos.length ? `
              <img id="carMainPhoto" alt="${esc(l.make)} ${esc(l.model)}" referrerpolicy="no-referrer" class="aspect-[4/3] w-full object-cover">
              ${gallery.photos.length > 1 ? `
                <button type="button" data-photo="-1" class="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-paper/90 shadow hover:bg-paper" aria-label="Iepriekšējā bilde">
                  <svg viewBox="0 0 20 20" class="size-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4l-6 6 6 6"/></svg></button>
                <button type="button" data-photo="1" class="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-paper/90 shadow hover:bg-paper" aria-label="Nākamā bilde">
                  <svg viewBox="0 0 20 20" class="size-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4l6 6-6 6"/></svg></button>` : ''}
              <span id="carPhotoCount" class="absolute bottom-3 right-3 rounded bg-ink/70 px-2 py-0.5 text-xs text-paper"></span>`
            : `<div class="grid aspect-[4/3] place-items-center">${CAR_SVG}<p class="absolute bottom-4 text-sm text-faint">Bildes nav pieejamas</p></div>`}
          </div>
          ${gallery.photos.length > 1 ? `
            <div id="carThumbs" class="mt-2 flex gap-2 overflow-x-auto pb-1">
              ${gallery.photos.map((p, k) => `<button type="button" data-thumb="${k}" class="flex-none overflow-hidden rounded-md ring-navy ring-offset-2"><img src="${esc(p)}" alt="" loading="lazy" referrerpolicy="no-referrer" class="h-14 w-20 object-cover"></button>`).join('')}
            </div>` : ''}
      </div>

      <div class="order-3 min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
        ${l.detailsError ? `<p class="rounded-lg bg-above/10 px-4 py-3 text-sm text-above">Pilnās detaļas no ${esc(sourceLabel(l.source))} neizdevās ielādēt (${esc(l.detailsError)}). Rādām saraksta datus.</p>` : ''}

        <section>
          <h3 class="font-semibold">Tehniskie dati</h3>
          <dl class="mt-2">${specRows(l)}</dl>
        </section>

        ${d.description ? `
          <section>
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-semibold">Apraksts</h3>
              <button type="button" data-translate-desc class="inline-flex items-center gap-1.5 rounded-md border border-hair px-2.5 py-1 text-sm text-sub hover:border-navy hover:text-navy">
                <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 5.5 5.5 7M11 5c-.5 3-3 6.5-7 8M13 21l4.5-10L22 21M14.5 18h6"/></svg>
                <span>Tulkot</span>
              </button>
            </div>
            <p id="carDesc" translate="no" data-original="${esc(d.description)}" class="mt-2 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-sub">${esc(d.description)}</p>
          </section>` : ''}
      </div>

      <aside class="order-2 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <div class="rounded-xl border border-hair p-5">
          <p class="text-3xl font-semibold tracking-tight">${eur(l.price)}</p>
          <div class="mt-2">${dealBadge(l, 'lg')}</div>
          ${l.marketPrice ? `<p class="mt-3 text-sm text-sub">Līdzīgi auto (${l.comparables}) parasti maksā ap <span class="font-medium text-ink">${eur(l.marketPrice)}</span>.</p>` : ''}
          <div class="mt-4">${gauge(l)}</div>
          ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="btn-dark mt-5 w-full">Atvērt sludinājumu ${esc(sourceLabel(l.source))}</a>` : ''}
          <button type="button" data-ask-about="${esc(l.source)}:${esc(l.externalId)}" class="btn-line mt-2 w-full">Jautāt AI: vai šis ir labs pirkums?</button>
        </div>

        <div class="rounded-xl border border-hair p-5">
          <p class="text-sm text-sub">Pārdevējs</p>
          <div class="mt-2 flex items-center gap-3">
            <span class="grid size-11 flex-none place-items-center rounded-full bg-wash text-sub" aria-hidden="true">
              ${s.type === 'dīleris'
                ? '<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>'
                : '<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>'}
            </span>
            <div class="min-w-0">
              <p class="truncate font-medium">${esc(sellerTitle)}</p>
              <p class="text-sm text-sub">${[sellerKind, s.city].filter(Boolean).map(esc).join(', ') || 'Atrašanās vieta nav norādīta'}</p>
            </div>
          </div>
          <p class="mt-4 text-xs leading-relaxed text-faint">Tālruni un kontaktus Dealvo nesaglabā. Sazinies ar pārdevēju oriģinālajā sludinājumā.</p>
        </div>
      </aside>
    </div>

    ${l.similar?.length ? `
      <section class="border-t border-hair p-5 sm:p-6">
        <h3 class="font-semibold">Līdzīgi auto</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">${l.similar.map(mini).join('')}</div>
      </section>` : ''}`;
}

async function openCar(key) {
  const [source, id] = key.split('|');
  const modal = $('#carModal');
  const box = $('#carBox');
  if (modal.hidden) lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  box.innerHTML = `<div class="p-10 text-center text-sub">Ielādē sludinājumu…</div>`;
  modal.scrollTop = 0;
  try {
    const l = await api(`/api/listing?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`);
    box.innerHTML = renderCar(l);
    showPhoto(0);
    $('[data-close-car]', box).focus();
  } catch (err) {
    box.innerHTML = `<div class="flex justify-between gap-4 p-6"><p class="text-above">${esc(err.message)}</p><button type="button" data-close-car class="text-sub underline">Aizvērt</button></div>`;
  }
}

function closeCar() {
  $('#carModal').hidden = true;
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}

document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) { e.preventDefault(); openCar(open.dataset.open); return; }
  if (e.target.closest('[data-close-car]') || e.target.id === 'carModal') { closeCar(); return; }
  const step = e.target.closest('[data-photo]');
  if (step) { showPhoto(gallery.i + Number(step.dataset.photo)); return; }
  const thumb = e.target.closest('[data-thumb]');
  if (thumb) showPhoto(Number(thumb.dataset.thumb));
});
document.addEventListener('keydown', (e) => {
  if ($('#carModal').hidden) return;
  if (e.key === 'Escape') closeCar();
  if (e.key === 'ArrowRight') showPhoto(gallery.i + 1);
  if (e.key === 'ArrowLeft') showPhoto(gallery.i - 1);
});

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
    $('#count').textContent = data.total ? `${fmt.format(data.total)} auto${$('#belowOnly').checked ? ' zem tirgus' : ''}` : 'Nekas netika atrasts';
    $('#showBtn').textContent = `Rādīt ${fmt.format(data.total)} auto`;
    const makeName = $('#filterMake').selectedOptions[0]?.textContent || '';
    $('#list').innerHTML = (data.refreshing
      ? `<li class="flex items-center gap-3 rounded-xl border border-navy/20 bg-navy/5 px-5 py-4 text-sm text-navy">
          <span class="size-2 animate-pulse rounded-full bg-navy"></span>
          Meklējam jaunākos ${esc(makeName)} sludinājumus vietnēs. Saraksts atjaunosies pats.</li>`
      : '') + (data.items.length
      ? data.items.map(listCard).join('')
      : data.refreshing ? '' : `<li class="rounded-xl border border-hair bg-paper px-6 py-14 text-center text-sub">Neviens auto neatbilst filtriem. Mēģini palielināt cenu vai noņemt modeli.</li>`);
    if (data.refreshing) waitForScan();
  } catch (e) {
    $('#count').textContent = 'Filtrs nav derīgs';
    $('#list').innerHTML = `<li class="rounded-xl border border-hair bg-paper px-6 py-10 text-above">${esc(e.message)}</li>`;
  }
}

// Kamēr fonā notiek skenēšana, ik pēc 3 s pārbaudām statusu; kad beidzas, pārlādējam datus
let waiting = false;
async function waitForScan() {
  if (waiting) return;
  waiting = true;
  try {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await api('/api/scan-status');
      if (!st.running) break;
    }
  } finally {
    waiting = false;
  }
  await Promise.all([loadStats(), loadTop()]);
  // Vēlreiz ielādējam sarakstu; marka tagad ir svaiga, tāpēc jauna skenēšana nesāksies
  loadListings();
}

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'tikko';
  if (min < 60) return `pirms ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `pirms ${h} h` : `pirms ${Math.round(h / 24)} d`;
}

async function loadTop() {
  // Izdevīgākie no pēdējām 2 dienām, lai augšā nestāv vieni un tie paši auto; ja tādu nav — no visiem
  let data = await api('/api/listings?sort=deal&limit=4&sinceHours=48');
  if (data.items.filter((d) => d.dealScore > 0).length < 4) data = await api('/api/listings?sort=deal&limit=4');
  const deals = data.items.filter((d) => d.dealScore != null && d.dealScore > 0);
  $('#topGrid').innerHTML = deals.length
    ? deals.map(tile).join('')
    : `<div class="rounded-xl border border-dashed border-hair bg-paper p-8 text-sub sm:col-span-2 lg:col-span-4">
        Vēl nav datu, ar ko salīdzināt. <button class="font-medium text-navy underline underline-offset-4" onclick="openDrawer()">Atjaunot datus</button>
      </div>`;
}

let lastScanSeen = null;
async function loadStats() {
  const s = await api('/api/stats');
  lastScanSeen = s.lastScanAt;
  $('#statTotal').textContent = s.total ? fmt.format(s.total) : '0';
  $('#statDeals').textContent = fmt.format(s.superDeals + s.goodDeals);
  $('#statAgo').textContent = s.lastScanAt ? ago(s.lastScanAt) : '—';
  $('#livePill').classList.toggle('md:flex', Boolean(s.total));
  const names = Object.keys(s.bySource).map(sourceLabel);
  $('#liveText').textContent = names.join(' · ');
  if (names.length) $('#heroSources').textContent = `Sludinājumi no ${names.length > 1 ? `${names.slice(0, -1).join(', ')} un ${names.at(-1)}` : names[0]}`;
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

// Dati atjaunojas paši: ik pēc 45 s pārbaudām, vai serveris ir noskenējis ko jaunu.
// Sarakstu pārlādējam tikai tad, ja lietotājs neskatās sludinājumu un nav aizritinājis tālu.
setInterval(async () => {
  if (document.hidden) return;
  try {
    const st = await api('/api/scan-status');
    if (st.lastScanAt && st.lastScanAt !== lastScanSeen) {
      await Promise.all([loadStats(), loadTop()]);
      if ($('#carModal').hidden && window.scrollY < 1200) loadListings();
    } else if (lastScanSeen) {
      $('#statAgo').textContent = ago(lastScanSeen);
    }
  } catch { /* nākamreiz */ }
}, 45000);

// ---------- AI asistents ----------

// Saruna ar asistentu: pēdējās atbildes un to, kas tika parādīts, sūtām līdzi nākamajam jautājumam,
// lai asistents saprastu "un kaut ko lētāku?" vai "salīdzini pirmos divus"
const chat = { turns: [], filters: null, ids: [] };
const keyOf = (l) => `${l.source}:${l.externalId}`;

const EXAMPLES = ['Dīzeļa universālis līdz 7000 € pēc 2013', 'Golfs līdz 5000', 'Cik maksā Octavia 2016?', 'Auto ģimenei no 4000 līdz 8000 eur'];

function openAi(question) {
  $('#aiPanel').classList.remove('hidden');
  $('#aiFab').classList.add('hidden');
  document.body.style.overflow = 'hidden';
  renderChat();
  if (question) askAssistant(question);
  else setTimeout(() => $('#aiPanelInput').focus(), 50);
}
function closeAi() {
  $('#aiPanel').classList.add('hidden');
  $('#aiFab').classList.remove('hidden');
  document.body.style.overflow = '';
}

// Atbildes teksts: rindas un numurēts saraksts ("1. ...") kā smuks saraksts
function answerHtml(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let list = [];
  const flush = () => { if (list.length) { html += `<ol class="mt-2 space-y-1">${list.join('')}</ol>`; list = []; } };
  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s+(.*)$/);
    const bullet = line.match(/^[•\-]\s+(.*)$/);
    if (m) list.push(`<li class="flex gap-2"><span class="w-4 flex-none text-faint">${m[1]}.</span><span>${m[2]}</span></li>`);
    else if (bullet) list.push(`<li class="flex gap-2"><span class="w-4 flex-none text-faint">•</span><span>${bullet[1]}</span></li>`);
    else { flush(); if (line.trim()) html += `<p class="${html ? 'mt-2' : ''}">${line}</p>`; }
  }
  flush();
  return html;
}

function renderChat(pending) {
  const box = $('#aiResult');
  const bubbleAi = (inner) => `
    <div class="flex items-start gap-3">
      <span translate="no" class="mt-0.5 grid size-7 flex-none place-items-center rounded-full bg-navy text-[10px] font-bold text-paper">AI</span>
      <div class="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-paper px-4 py-3 text-[15px] leading-relaxed ring-1 ring-hair">${inner}</div>
    </div>`;
  const turnHtml = (t, i) => `
    <div class="space-y-3">
      <p class="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-navy px-4 py-2 text-[15px] text-paper">${esc(t.q)}</p>
      ${bubbleAi(`<div class="${t.error ? 'text-above' : ''}">${answerHtml(t.a)}</div>
        ${t.items?.length ? `<div class="mt-3 space-y-2">${t.items.slice(0, 3).map(mini).join('')}</div>` : ''}
        ${t.filters && t.items?.length && i === chat.turns.length - 1 ? `<button type="button" data-show-list class="mt-3 text-sm font-medium text-navy underline underline-offset-4">Rādīt visus sarakstā →</button>` : ''}`)}
    </div>`;
  const welcome = bubbleAi(`<p>Sveiki! Pastāsti, kādu auto meklē: budžetu, gadu, degvielu vai kam tas vajadzīgs. Es atradīšu izdevīgākos un salīdzināšu tos ar tirgu.</p>`);
  box.innerHTML = (chat.turns.length ? chat.turns.map(turnHtml).join('') : pending ? '' : welcome) +
    (pending ? `<p class="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-navy px-4 py-2 text-[15px] text-paper">${esc(pending)}</p><div class="flex items-center gap-3 pl-10 text-sm text-sub"><span class="flex gap-1"><span class="size-1.5 animate-bounce rounded-full bg-navy"></span><span class="size-1.5 animate-bounce rounded-full bg-navy [animation-delay:120ms]"></span><span class="size-1.5 animate-bounce rounded-full bg-navy [animation-delay:240ms]"></span></span>Meklēju…</div>` : '');
  box.scrollTop = box.scrollHeight;

  const last = chat.turns.at(-1);
  let chips = [];
  if (!chat.turns.length) chips = EXAMPLES;
  else if (last && !last.error && !pending) {
    if (chat.filters) chips.push('Un kaut ko lētāku?', 'Un jaunāku?', 'Ar mazāku nobraukumu');
    if (chat.ids.length >= 2) chips.push('Salīdzini pirmos divus');
    if (chat.ids.length >= 1) chips.push('Vai pirmais ir labs pirkums?');
  }
  $('#aiChips').innerHTML = pending ? '' : chips.map((c) =>
    `<button type="button" data-ask="${esc(c)}" class="rounded-full border border-hair bg-paper px-3 py-1 text-sub hover:border-navy hover:text-navy">${esc(c)}</button>`).join('');
  if (last && !pending) $('#aiMode').textContent = last.mode === 'claude' ? 'Claude · meklē tikai Dealvo datos' : 'Meklē tikai Dealvo datos';
}

let asking = false;
async function askAssistant(question, focus) {
  if (asking) return;
  asking = true;
  renderChat(question); // jautājums parādās uzreiz, atbilde — kad gatava
  try {
    const r = await api('/api/assistant', {
      method: 'POST',
      body: JSON.stringify({
        question,
        context: { filters: chat.filters, ids: chat.ids, focus: focus || undefined },
        history: chat.turns.slice(-4).map((t) => ({ q: t.q, a: t.a })),
      }),
    });
    chat.turns.push({ q: question, a: r.answer, items: r.items, mode: r.mode, filters: r.filters });
    if (r.items?.length) chat.ids = r.items.map(keyOf);
    if (r.filters) { chat.filters = r.filters; applyFilters(r.filters); }
  } catch (err) {
    chat.turns.push({ q: question, a: err.message, error: true });
  } finally {
    chat.turns = chat.turns.slice(-8);
    asking = false;
    renderChat();
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-ai]')) { openAi(); return; }
  if (e.target.closest('[data-show-below]')) {
    $('#belowOnly').checked = true;
    $('#sideForm').elements.sort.value = 'deal';
    loadListings();
    $('#results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  if (e.target.closest('[data-close-ai]')) { closeAi(); return; }
  if (e.target.closest('[data-show-list]')) {
    closeAi();
    $('#results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  const chip = e.target.closest('[data-ask]');
  if (chip) { askAssistant(chip.dataset.ask); return; }
  if (e.target.closest('#aiReset')) {
    chat.turns = []; chat.filters = null; chat.ids = [];
    renderChat();
    $('#aiPanelInput').focus();
  }
  const about = e.target.closest('[data-ask-about]');
  if (about) {
    closeCar();
    openAi();
    askAssistant('Vai šis ir labs pirkums?', about.dataset.askAbout);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#aiPanel').classList.contains('hidden') && $('#carModal').hidden) closeAi();
});

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
  $('#aiInput').value = '';
  openAi(q || undefined);
});
$('#aiPanelForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#aiPanelInput').value.trim();
  if (!q) return;
  $('#aiPanelInput').value = '';
  askAssistant(q);
});

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
      <span class="flex h-full flex-col items-center gap-1 rounded-xl border border-hair px-1 py-2.5 text-xs text-sub transition
        hover:border-faint hover:text-ink peer-checked:border-navy peer-checked:font-medium peer-checked:text-navy peer-checked:ring-4 peer-checked:ring-navy/10 peer-focus-visible:ring-2 peer-focus-visible:ring-navy">
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
  const total = models.filter((m) => !m.group).reduce((n, m) => n + m.count, 0);
  const n = (c) => (c ? ` (${fmt.format(c)})` : '');
  // Sērijas (BMW "3. sērija") — treknrakstā, to modeļi zem tām ar atkāpi
  el.innerHTML = `<option value="">Visi modeļi${n(total)}</option>` + models.map((m) =>
    m.series ? `<option value="${esc(m.model)}" style="font-weight:600">${esc(m.label || m.model)}${n(m.count)}</option>`
      : `<option value="${esc(m.model)}">${m.group ? '\u00a0\u00a0\u00a0\u00a0' : ''}${esc(m.label || m.model)}${n(m.count)}</option>`).join('');
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

// ---------- Tulkošana ----------
// Valodas izvēle galvenē iztulko visu lapas tekstu (arī to, kas ielādējas vēlāk).
// Oriģinālais latviešu teksts tiek saglabāts, tāpēc var pārslēgties atpakaļ uz LV.
const i18n = { lang: 'lv', nodes: new WeakMap(), cache: {}, timer: null };
const HAS_WORDS = /\p{L}{2,}/u;

function langCache(lang) {
  if (!i18n.cache[lang]) {
    try { i18n.cache[lang] = JSON.parse(localStorage.getItem(`dealvo-tr-${lang}`) || '{}'); } catch { i18n.cache[lang] = {}; }
  }
  return i18n.cache[lang];
}
function saveCache(lang) {
  try {
    const c = langCache(lang);
    const keys = Object.keys(c);
    if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete c[k];
    localStorage.setItem(`dealvo-tr-${lang}`, JSON.stringify(c));
  } catch { /* privātais režīms */ }
}

async function translateList(texts, to) {
  const c = langCache(to);
  const todo = [...new Set(texts.filter((t) => c[t] === undefined))];
  for (let i = 0; i < todo.length;) {
    const chunk = [];
    let len = 0;
    while (i < todo.length && chunk.length < 60 && len + todo[i].length < 9000) { len += todo[i].length; chunk.push(todo[i++]); }
    if (!chunk.length) { i++; continue; }
    const r = await api('/api/translate', { method: 'POST', body: JSON.stringify({ texts: chunk, to }) });
    chunk.forEach((t, j) => { c[t] = r.texts[j]; });
  }
  if (todo.length) saveCache(to);
  return texts.map((t) => c[t] ?? t);
}

// Teksta mezgli un placeholder atribūti, kurus tulkot
function translatable() {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('script,style,[translate="no"]') || !HAS_WORDS.test(n.nodeValue)
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (walker.nextNode()) out.push({ node: walker.currentNode, attr: null });
  for (const el of $$('[placeholder], [title], [aria-label]')) {
    if (el.closest('[translate="no"]')) continue;
    for (const attr of ['placeholder', 'title', 'aria-label']) if (el.hasAttribute(attr) && HAS_WORDS.test(el.getAttribute(attr))) out.push({ node: el, attr });
  }
  return out;
}
const getVal = (x) => (x.attr ? x.node.getAttribute(x.attr) : x.node.nodeValue);
const setVal = (x, v) => (x.attr ? x.node.setAttribute(x.attr, v) : (x.node.nodeValue = v));
const keyFor = (x) => (x.attr ? `${x.attr}` : 'text');

async function translatePage() {
  const lang = i18n.lang;
  const items = translatable().map((x) => {
    const rec = i18n.nodes.get(x.node)?.[keyFor(x)];
    const now = getVal(x);
    // Ja teksts nav mainījies kopš mūsu tulkojuma — ņem oriģinālu; citādi lapa to ir atjaunojusi
    const orig = rec && (now === rec.applied || now === rec.orig) ? rec.orig : now;
    return { ...x, orig };
  });
  if (lang === 'lv') {
    for (const x of items) if (getVal(x) !== x.orig) setVal(x, x.orig);
    return;
  }
  const core = items.map((x) => x.orig.trim());
  let translated;
  try { translated = await translateList(core, lang); } catch { return; }
  if (lang !== i18n.lang) return; // valoda pa to laiku nomainīta
  items.forEach((x, i) => {
    const lead = x.orig.match(/^\s*/)[0];
    const trail = x.orig.match(/\s*$/)[0];
    const applied = lead + translated[i] + trail;
    const recs = i18n.nodes.get(x.node) || {};
    recs[keyFor(x)] = { orig: x.orig, applied };
    i18n.nodes.set(x.node, recs);
    if (getVal(x) !== applied) setVal(x, applied);
  });
}

const observer = new MutationObserver(() => {
  if (i18n.lang === 'lv') return;
  clearTimeout(i18n.timer);
  i18n.timer = setTimeout(translatePage, 250);
});

function setLang(lang) {
  i18n.lang = lang;
  document.documentElement.lang = lang === 'et' ? 'et' : lang;
  try { localStorage.setItem('dealvo-lang', lang); } catch { /* */ }
  $('#langSelect').value = lang;
  if (lang === 'lv') observer.disconnect();
  else observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  translatePage();
}
$('#langSelect').addEventListener('change', (e) => setLang(e.target.value));

// Sludinājuma apraksta tulkošana (piem. vāciski → latviski)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-translate-desc]');
  if (!btn) return;
  const p = $('#carDesc');
  const label = $('span', btn);
  if (p.dataset.translated) {
    p.textContent = p.dataset.original;
    delete p.dataset.translated;
    label.textContent = 'Tulkot';
    return;
  }
  label.textContent = 'Tulko…';
  try {
    const [t] = await translateList([p.dataset.original], i18n.lang);
    p.textContent = t;
    p.dataset.translated = '1';
    label.textContent = 'Rādīt oriģinālu';
  } catch (err) {
    label.textContent = 'Neizdevās';
  }
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
    $('#filterMake').insertAdjacentHTML('beforeend', makes.map((m) =>
      `<option value="${esc(m.slug)}">${esc(m.name)}${m.count ? ` (${fmt.format(m.count)})` : ''}</option>`).join(''));
    $('#scrapeSources').innerHTML = '<legend class="field-label">Vietnes</legend>' + cfg.sources.map((s) => `
      <label class="flex items-center gap-2"><input type="checkbox" name="sources" value="${esc(s.key)}" checked class="accent-navy">
        ${esc(s.label)} <span class="text-faint">${esc(s.country)}</span></label>`).join('');
    await refresh();
    let saved = 'lv';
    try { saved = localStorage.getItem('dealvo-lang') || 'lv'; } catch { /* */ }
    if (saved !== 'lv' && [...$('#langSelect').options].some((o) => o.value === saved)) setLang(saved);
  } catch (e) {
    $('#count').textContent = 'Neizdevās ielādēt datus';
    $('#list').innerHTML = `<li class="text-above">${esc(e.message)}</li>`;
  }
})();
