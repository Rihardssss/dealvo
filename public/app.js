// DealRadar frontend — bez ietvariem, tikai fetch + DOM.
const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat('lv-LV');

// Visu tekstu no servera ievietojam caur escape, lai sludinājuma nosaukums
// ar <script> nevarētu izpildīt kodu (XSS aizsardzība).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

function setStatus(text, type = '') {
  const el = $('#status');
  el.textContent = text;
  el.className = 'status ' + type;
}

async function api(path, opts) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors || ['Kļūda']).join('; '));
  return data;
}

async function loadMakes() {
  const makes = await api('/api/makes');
  const opts = makes.map((m) => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join('');
  $('#scrapeMake').innerHTML = opts;
  $('#filterMake').insertAdjacentHTML('beforeend', opts);
}

async function loadStats() {
  const s = await api('/api/stats');
  const sources = Object.keys(s.bySource).length;
  $('#stats').innerHTML = `
    <div class="stat"><b>${fmt.format(s.total)}</b><span>sludinājumi</span></div>
    <div class="stat"><b>${sources}</b><span>avoti</span></div>
    <div class="stat hot"><b>${s.superDeals}</b><span>super deali</span></div>
    <div class="stat"><b>${s.priceDrops}</b><span>cena kritās</span></div>`;
}

function card(l) {
  const label = l.dealLabel;
  const badge = l.dealScore == null
    ? ''
    : label === 'super' || label === 'labs'
      ? `<span class="badge ${label}">−${l.dealScore}% zem tirgus</span>`
      : label === 'dārgs'
        ? `<span class="badge dārgs">+${Math.abs(l.dealScore)}% virs tirgus</span>`
        : `<span class="badge tirgus">tirgus cena</span>`;

  const img = safeUrl(l.image);
  const url = safeUrl(l.url);
  const prev = l.priceHistory?.length ? l.priceHistory.at(-1).price : null;
  const drop = prev && l.price < prev ? `<span class="drop">↓ bija ${fmt.format(prev)} €</span>` : '';
  const meta = [l.year, l.mileage != null ? `${fmt.format(l.mileage)} km` : null, l.engine ? `${l.engine} L` : null, l.fuel]
    .filter(Boolean).map(esc).join(' · ');

  return `
    <article class="card ${label === 'super' ? 'super' : ''}">
      <div class="thumb ${img ? '' : 'empty'}" data-make="${esc(l.make)}" ${img ? `style="background-image:url('${esc(img)}')"` : ''}>${badge}</div>
      <div class="body">
        <div class="title">${esc(l.make)} ${esc(l.model)}</div>
        <div class="meta">${meta}</div>
        <div class="price">
          <b>${fmt.format(l.price)} €</b>
          ${l.marketPrice ? `<s>tirgus ~${fmt.format(l.marketPrice)} €</s>` : ''}
        </div>
        ${drop}
        <div class="foot-row">
          <span>${esc(l.source)}${l.comparables ? ` · salīdz. ar ${l.comparables}` : ''}</span>
          ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Atvērt →</a>` : ''}
        </div>
      </div>
    </article>`;
}

let debounce;
async function loadListings() {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData($('#filterForm'))) if (v !== '') params.set(k, v);
  try {
    const data = await api('/api/listings?' + params);
    $('#count').textContent = `Atrasti ${fmt.format(data.total)} sludinājumi`;
    $('#grid').innerHTML = data.items.length
      ? data.items.map(card).join('')
      : '<div class="empty-state">Nav datu. Noskenē ss.lv vai ielādē demo datus augšā.</div>';
  } catch (e) {
    $('#count').textContent = '';
    $('#grid').innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
  }
}

async function refresh() {
  await Promise.all([loadStats(), loadListings()]);
}

$('#filterForm').addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(loadListings, 250);
});

$('#scrapeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  const btn = $('#scrapeBtn');
  btn.disabled = true;
  setStatus(`Skenē ss.lv (${form.pages} lapas)…`);
  try {
    const r = await api('/api/scrape', { method: 'POST', body: JSON.stringify({ make: form.make, pages: Number(form.pages) }) });
    setStatus(`Atrasti ${r.found} sludinājumi · ${r.added} jauni · ${r.priceDrops} cenu kritumi`, 'ok');
    await refresh();
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

$('#demoBtn').addEventListener('click', async () => {
  const r = await api('/api/demo', { method: 'POST' });
  setStatus(`Demo dati: ${r.added} jauni`, 'ok');
  refresh();
});

$('#clearBtn').addEventListener('click', async () => {
  if (!confirm('Dzēst visus saglabātos sludinājumus?')) return;
  await api('/api/listings', { method: 'DELETE' });
  setStatus('Dati notīrīti');
  refresh();
});

loadMakes().then(refresh).catch((e) => setStatus(e.message, 'err'));
