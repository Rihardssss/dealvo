// Cloudflare Worker, caur kuru Dealvo serveris nolasa ss.lv (ss.lv bloķē datu centru IP adreses).
// Uzstādīšana: Cloudflare → Workers & Pages → Create → Worker → "Edit code" → iekopē šo failu → Deploy.
// Settings → Variables and Secrets → pievieno Secret ar nosaukumu KEY (tā pati vērtība, kas .env SCRAPE_PROXY_KEY).
// Drīkst atvērt tikai ss.lv adreses, tāpēc to nevar izmantot citam nolūkam.

export default {
  async fetch(request, env) {
    if (!env.KEY || request.headers.get('x-key') !== env.KEY) return new Response('forbidden', { status: 403 });
    let target;
    try { target = new URL(new URL(request.url).searchParams.get('url')); } catch { return new Response('bad url', { status: 400 }); }
    if (target.protocol !== 'https:' || !/^(www\.)?ss\.lv$/.test(target.hostname)) return new Response('host not allowed', { status: 400 });

    const res = await fetch(target, {
      headers: {
        'User-Agent': request.headers.get('x-ua') || 'Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'lv,en;q=0.8',
      },
      redirect: 'follow',
    });
    return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'text/html; charset=utf-8' } });
  },
};
