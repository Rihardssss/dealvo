# Dealvo

Lietotu auto meklētājs. Savāc sludinājumus no ss.lv, AutoScout24 un mobile.de un parāda, kuri auto ir lētāki nekā līdzīgi auto tirgū.

Victoria projektu nedēļa, 2026. Rihards Indars, PX23.

## Ko tas dara

- Nolasa sludinājumus no trim vietnēm
- Salīdzina katru auto ar līdzīgiem un parāda, par cik % tas ir lētāks vai dārgāks
- Filtri: marka, modelis, gads, cena, nobraukums, degviela, virsbūve
- Auto lapa ar bildēm, datiem un pārdevēju
- AI asistents: uzraksti, ko meklē, un tas atrod auto

## Kā palaist

Vajag Node.js 22.

```
npm install
npm run seed
npm start
```

Atver http://localhost:3000

`npm run seed` ielādē testa datus. Testi: `npm test`

## Tehnoloģijas

- Node.js un Express
- Cheerio (lapu nolasīšanai)
- Tailwind CSS
- Claude API (AI asistentam)
- Cloudflare Tunnel (hostingam)

## Kā aprēķina cenu

Katram auto atrod līdzīgus auto (tā pati marka un modelis, gads ±2, nobraukums ±60 000 km). No to cenām ņem mediānu, tā ir tirgus cena. Ja auto ir lētāks par to, tas ir labs piedāvājums.

## Drošība

- Ievade tiek pārbaudīta
- Aizsardzība pret XSS
- Datus mainīt var tikai ar admin paroli
- Tālruņi un privātpersonu vārdi netiek saglabāti

## Faili

- `src/` serveris un loģika
- `src/scrapers/` katras vietnes nolasīšana
- `public/` lapa
- `test/` testi
- `TESTI.md` testu scenāriji
- `DEPLOY.md` kā ielikt internetā

## Autors

Rihards Indars. Koda rakstīšanā izmantots AI asistents (Claude).
