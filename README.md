# DealRadar 🚗📡

**Auto sludinājumu agregators, kas atrod labākos piedāvājumus.**
Victoria PX projektu nedēļa, 19.–23.10.2026. Autors: Rihards Indars (PX23).

## Problēma
Lai atrastu izdevīgu auto, cilvēkam jāpārlūko vairākas vietnes un pašam jāmin, vai cena ir laba.
ss.lv nerāda, vai konkrētā cena ir zem vai virs tirgus.

## Risinājums
DealRadar savāc sludinājumus no vairākiem avotiem vienā datubāzē, salīdzina katru auto ar līdzīgiem
(marka, modelis, gads, nobraukums) un parāda, **cik % tas ir lētāks vai dārgāks par tirgu**.
Labākie piedāvājumi ir saraksta augšā.

## Funkcijas
- **ss.lv skrāpēšana** — izvēlies marku un lapu skaitu (1–5), sistēma nolasa sludinājumus.
- **Demo avoti** — 400 testa sludinājumi no 2 izdomātām vietnēm (darbojas bez interneta).
- **Deal score** — cena pret līdzīgu auto mediānu; birkas *super* (≥20%), *labs* (≥10%), *tirgus*, *dārgs*.
- **Cenu vēsture** — ja sludinājuma cena atkārtotā skenēšanā samazinās, tas tiek parādīts.
- **Filtri un kārtošana** — marka, modelis, gads, max cena, max nobraukums.
- **Ievades validācija** — gan serverī, gan pārlūkā.

## Palaišana
Vajadzīgs **Node.js 22+**.

```bash
npm install
npm run seed     # ielādē demo datus (nav obligāti)
npm start        # → http://localhost:3000
npm test         # palaiž automātiskos testus
```

## Tehniskā izvēle un pamatojums
| Daļa | Tehnoloģija | Kāpēc |
|---|---|---|
| Serveris | Node.js + Express | Viena valoda (JS) frontendā un backendā, vienkāršs REST API |
| Skrāpēšana | `fetch` + Cheerio | ss.lv ir statisks HTML — nav vajadzīgs smags pārlūks (Puppeteer) |
| Dati | JSON fails ar atomisku pierakstu | Prototipam pietiek, nav jāinstalē datubāze |
| Frontend | HTML/CSS/JS bez ietvara | Ātri ielādējas, nav build soļa |
| Testi | `node:test` (iebūvēts) | Nav papildu atkarību |

## Arhitektūra
```
public/            frontend (index.html, style.css, app.js)
src/server.js      REST API
src/scrapers/      avoti: sslv.js (īsts), demo.js (testa dati)
src/deals.js       deal algoritms
src/validate.js    ievades validācija
src/db.js          datu glabāšana (data/listings.json)
test/              automātiskie testi + ss.lv HTML paraugs
```
Jaunu vietni pievieno, uzrakstot jaunu failu `src/scrapers/`, kas atgriež sludinājumus tajā pašā formātā.

### API
| Metode | Ceļš | Apraksts |
|---|---|---|
| GET | `/api/listings?make=&model=&minYear=&maxPrice=&maxMileage=&sort=` | sludinājumi ar deal score |
| GET | `/api/stats` | kopsavilkums |
| GET | `/api/makes` | atļautās markas |
| POST | `/api/scrape` `{make, pages}` | skenē ss.lv |
| POST | `/api/demo` | ielādē demo datus |
| DELETE | `/api/listings` | notīra datus |

## Deal algoritms
1. Katram auto atlasa **līdzīgos**: tā pati marka un modelis, gads ±2, nobraukums ±60 000 km (no visiem avotiem).
2. Ja līdzīgo ir **vismaz 3**, aprēķina to cenu **mediānu** = tirgus cena.
   Mediāna, nevis vidējais, lai viens absurds sludinājums (1 € vai 999 999 €) nesabojātu rezultātu.
3. `dealScore = (tirgus − cena) / tirgus × 100%`.
4. Ja līdzīgo ir par maz, score netiek rādīts (nevis izdomāts).

## Drošība
- Skrāpēt var tikai markas no fiksēta saraksta → nevar likt serverim pieprasīt patvaļīgu URL.
- Visi parametri tiek validēti (tips, robežas, simboli); kļūdas atgriež `400`, nevis avāriju.
- Viss teksts no sludinājumiem tiek "escape"-ots → nav XSS (pārbaudīts ar `<script>` sludinājuma nosaukumā).
- Saites atveras tikai, ja tās ir `https://`, ar `rel="noopener noreferrer"`.
- Vienlaikus var notikt tikai viena skrāpēšana; 1,5 s pauze starp lapām, lai nenoslogotu ss.lv.

## Testi
Automātiskie: `npm test` (14 testi). Manuālie scenāriji: skat. [TESTI.md](TESTI.md).

## Ierobežojumi un nākotnes plāni
- Ja ss.lv maina HTML struktūru, parsētājs jāatjauno (tam ir tests ar paraugu).
- Lielākas vietnes (auto24, mobile.de) aizsargā pret skrāpēšanu — tām būtu jāizmanto oficiāls API.
- Nākotnē: PostgreSQL, automātiska skenēšana ik stundu, e-pasta paziņojumi par jauniem super dealiem.

## Ieguldījums
| Dalībnieks | Loma |
|---|---|
| Rihards Indars | Viss: ideja, backend, skrāperis, deal algoritms, frontend, testi, dokumentācija |
