# DealRadar 🚗📡

**Auto sludinājumu agregators ar AI asistentu: ss.lv + AutoScout24 + mobile.de vienuviet, katrs auto salīdzināts ar tirgu.**
Victoria PX projektu nedēļa, 19.–23.10.2026. Autors: Rihards Indars (PX23).

🌐 **https://dealradar.riciboy.eu** (publicēšana: [DEPLOY.md](DEPLOY.md))

## Problēma
Lai atrastu izdevīgu auto, cilvēkam jāpārlūko vairākas vietnes un pašam jāmin, vai cena ir laba.
ss.lv nerāda, vai konkrētā cena ir zem vai virs tirgus.

## Risinājums
DealRadar savāc sludinājumus no vairākiem avotiem vienā datubāzē, salīdzina katru auto ar līdzīgiem
(marka, modelis, gads, nobraukums) un parāda, **cik % tas ir lētāks vai dārgāks par tirgu**.
Labākie piedāvājumi ir saraksta augšā.

## Funkcijas
- **3 īsti avoti** — ss.lv (LV), AutoScout24 (DE) un mobile.de (DE); skenē paralēli, viena avota kļūda neaptur pārējos.
- **Auto bildes** — tiek nolasītas no katras vietnes; ja bildes nav, rāda neitrālu siluetu.
- **AI asistents** — raksti parastā valodā ("dīzeļa universālis līdz 6000 € pēc 2012"). Ar `ANTHROPIC_API_KEY` to apstrādā Claude, kas pats izsauc meklēšanas rīku mūsu datubāzē un neko neizdomā; bez atslēgas strādā latviešu valodas parsētājs.
- **Deal score** — katrs auto salīdzināts ar līdzīgiem no VISIEM avotiem (arī Latvija pret Vāciju); marku/modeļu nosaukumi tiek normalizēti ("Mercedes-Benz" = "Mercedes", "320d" = "320").
- **Cenu skala** — redzams, kur cena atrodas starp līdzīgu auto lētāko un dārgāko.
- **Cenu vēsture** — ja cena atkārtotā skenēšanā samazinās, tas tiek parādīts.
- **Meklēšana kā lielajos portālos** — marka → modeļu izvēlne ar sludinājumu skaitu, gads no–līdz, cena no–līdz, nobraukums, degviela, virsbūve (sedans, universālis, hečbeks, apvidus, minivens, kupeja, kabriolets), vietne, kārtošana. Virsbūvi ņem no vietnes datiem vai nosaka pēc modeļa.
- **Demo dati** — 400 testa sludinājumi; prezentācija strādā arī bez interneta.
- **Drošība** — validācija, XSS aizsardzība, admin parole, pieprasījumu limiti.

## Palaišana
Vajadzīgs **Node.js 22+**.

```bash
npm install
npm run seed     # ielādē demo datus (nav obligāti)
cp .env.example .env   # pēc izvēles: ieliec ANTHROPIC_API_KEY AI asistentam
npm start        # uzbūvē Tailwind CSS un palaiž → http://localhost:3000
npm test         # palaiž automātiskos testus
```

## Tehniskā izvēle un pamatojums
| Daļa | Tehnoloģija | Kāpēc |
|---|---|---|
| Serveris | Node.js + Express | Viena valoda (JS) frontendā un backendā, vienkāršs REST API |
| Skrāpēšana | `fetch` + Cheerio | ss.lv ir statisks HTML; AutoScout24 un mobile.de sludinājumus iegulda lapā kā JSON — to nolasa tieši, bez smaga pārlūka |
| AI | Claude API ar rīku izsaukšanu (tool use) | Modelis meklē tikai mūsu datos caur `search_cars` rīku, tā ievade tiek validēta kā lietotāja ievade |
| Dati | JSON fails ar atomisku pierakstu | Prototipam pietiek, nav jāinstalē datubāze |
| Frontend | HTML + JS bez ietvara | Ātri ielādējas, viegli saprotams kods |
| Dizains | Tailwind CSS v4 (CLI), minimāls stils | Dizaina sistēma (`@theme`) vienā failā; krāsa tikai nozīmei: zaļš = zem tirgus, oranžs = virs |
| Fonts | Geist, hostēts lokāli | Ar latviešu burtiem, strādā bez interneta |
| Hostings | Cloudflare Tunnel → dealradar.riciboy.eu | Bezmaksas HTTPS, nav jāatver porti |
| Testi | `node:test` (iebūvēts) | Nav papildu atkarību |

## Arhitektūra
```
public/            frontend (index.html, app.js, fonts/; app.css tiek uzbūvēts)
src/styles.css     Tailwind ievade un dizaina sistēma
src/server.js      REST API
src/scrapers/      sslv.js, autoscout24.js, mobilede.js, demo.js; index.js = avotu reģistrs
src/assistant.js   AI asistents (Claude + bezsaistes režīms)
src/search.js      kopīga meklēšana (API un AI)
src/makes.js       marku ID katrā avotā + nosaukumu normalizēšana
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
| POST | `/api/scrape` `{make, pages, sources}` | skenē vietnes (`sslv`, `autoscout24`, `mobilede`) |
| POST | `/api/assistant` `{question}` | AI asistents |
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
- Skenēt/dzēst var tikai ar `ADMIN_TOKEN` (salīdzināts ar `timingSafeEqual`); limits 120 pieprasījumi minūtē no IP.
- Vienlaikus var notikt tikai viena skrāpēšana; 1,5 s pauze starp lapām, lai nenoslogotu ss.lv.

## Testi
Automātiskie: `npm test` (29 testi). Manuālie scenāriji: skat. [TESTI.md](TESTI.md).

## Ierobežojumi un nākotnes plāni
- Ja kāda vietne maina lapas struktūru, parsētājs jāatjauno (katram ir tests ar paraugu).
- **mobile.de** un daļēji **AutoScout24** izmanto bot aizsardzību, tāpēc skenēšana var tikt bloķēta. Tad lietotne parāda skaidru paziņojumu par konkrēto vietni, un pārējās turpina strādāt. Stabilam produktam būtu jāizmanto oficiālie partneru API.
- Vācijas un Latvijas tirgus cenas atšķiras; nākotnē — atsevišķs "importa ietaupījuma" aprēķins ar transporta un reģistrācijas izmaksām.
- Nākotnē: PostgreSQL, automātiska skenēšana ik stundu, e-pasta paziņojumi par jauniem super dealiem.

## Ieguldījums
| Dalībnieks | Loma |
|---|---|
| Rihards Indars | Viss: ideja, backend, skrāperis, deal algoritms, frontend, testi, dokumentācija |
