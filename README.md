# Dealvo

Lietotu auto meklētājs. Savāc sludinājumus no ss.lv, AutoScout24 un mobile.de un parāda, kuri auto ir lētāki nekā līdzīgi auto tirgū.

Victoria projektu nedēļa, 2026.

## Ko tas dara

- Nolasa sludinājumus no trim vietnēm, pats ik pēc 3 min (pa vienai markai); tukšu datubāzi piepilda uzreiz
- Lapa pati atjaunojas, kad parādās jauni dati
- Ja kāds atver marku ar veciem datiem, to uzreiz atjauno
- Salīdzina katru auto ar līdzīgiem un parāda, par cik % tas ir lētāks vai dārgāks
- Filtri: marka, modelis, gads, cena, nobraukums, degviela, virsbūve
- Auto lapa ar bildēm, datiem un pārdevēju
- AI asistents: uzraksti, ko meklē, un tas atrod auto. Saprot arī turpinājumu („un kaut ko lētāku?”), salīdzina auto („salīdzini pirmos divus”) un novērtē konkrētu auto („vai šis ir labs pirkums?”). Atpazīst modeļus („golfs līdz 5000”), cenu diapazonu un pasaka tipisko cenu („cik maksā Octavia 2016?”)
- Tulkošana: lapu var pārslēgt uz EN, RU, DE, LT, EE; sludinājuma aprakstu var iztulkot ar vienu pogu

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
- SQLite datubāze (tabulas `listings` un `price_history`, struktūra failā `src/schema.sql`)
- Cheerio (lapu nolasīšanai)
- Tailwind CSS
- Claude API (AI asistentam)
- Cloudflare Tunnel (hostingam)

## Kā aprēķina cenu

Katram auto atrod līdzīgus auto (tā pati marka un modelis, gads ±2, nobraukums ±60 000 km). Ja tādu ir mazāk par 3, meklē plašāk (±3 un ±5 gadi), un citu gadu auto cenu pārrēķina uz šī auto gadu (ap 8% vērtības zudums gadā). No to cenām ņem mediānu, tā ir tirgus cena. Ja auto ir lētāks par to, tas ir labs piedāvājums.

## Drošība

- Ievade tiek pārbaudīta
- Visi SQL vaicājumi ir parametrizēti (aizsardzība pret SQL injekcijām)
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

## Komanda

| Dalībnieks | Grupa | Atbildība |
|---|---|---|
| Rihards Indars | PX23 | Ideja, serveris, datu nolasīšana, cenu aprēķins, AI asistents |
| Miks Henrijs Ozoliņš | PX24 | Testēšana ar īstām vietnēm (ss.lv, AutoScout24, mobile.de), kļūdu saraksts, TESTI.md |
| Kristiāns Štībelis | PX24 | Publicēšana internetā (Cloudflare Tunnel, dealvo.riciboy.eu), DEPLOY.md |
| Kārlis Gustavs Roštoks | PX23 | AI asistenta testēšana un uzlabošana, datubāzes shēma (ER diagramma) |
| Rihards Berķis | PX24 | Dizaina un lietojamības pārbaude uz datora un telefona, prezentācija un demo scenārijs |

