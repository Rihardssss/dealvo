# Dealvo

Lietotu auto meklētājs, kas savāc sludinājumus no ss.lv, AutoScout24 un mobile.de un parāda, kuri auto ir lētāki par tirgus cenu.

Projektu nedēļas darbs, Victoria, 19.–23.10.2026.
Autors: Rihards Indars, PX23.

Lapa: https://dealvo.riciboy.eu

## Kāpēc

Kad meklē lietotu auto, jāskatās vairākās vietnēs un pašam jāmin, vai cena ir laba. Neviena no lapām nepasaka, vai konkrētais auto ir lēts vai dārgs salīdzinājumā ar līdzīgiem.

Dealvo savāc sludinājumus vienā vietā, salīdzina katru auto ar līdzīgiem (tā pati marka un modelis, līdzīgs gads un nobraukums) un parāda starpību procentos. Izdevīgākie auto ir saraksta sākumā.

## Ko var izdarīt

- Noskenēt ss.lv, AutoScout24 un mobile.de izvēlētajai markai. Ja kāda vietne nestrādā, pārējās turpina.
- Meklēt pēc markas, modeļa, gada, cenas, nobraukuma, degvielas un virsbūves.
- Redzēt, par cik procentiem auto ir lētāks vai dārgāks par līdzīgiem, un cenu skalu.
- Atvērt auto: bildes, tehniskie dati, apraksts, pārdevējs (dīleris vai privātpersona un pilsēta) un līdzīgi auto.
- Uzrakstīt AI asistentam, ko meklē, piemēram "dīzeļa universālis līdz 6000 pēc 2012". Tas atrod auto un aizpilda filtrus.
- Redzēt, ja auto cena kopš iepriekšējās skenēšanas ir samazinājusies.

Prezentācijai ir arī 400 demo sludinājumi, lai viss strādātu bez interneta.

## Palaišana

Vajag Node.js 22 vai jaunāku.

```
npm install
npm run seed
npm start
```

Pēc tam atver http://localhost:3000.

`npm run seed` ielādē demo datus. Ja gribi, lai AI asistents izmanto Claude, nokopē `.env.example` uz `.env` un ieraksti `ANTHROPIC_API_KEY`. Bez atslēgas asistents strādā ar latviešu valodas parsētāju, kas ir pašā projektā.

Testi: `npm test`

Kā ielikt lapu internetā, aprakstīts failā [DEPLOY.md](DEPLOY.md).

## Tehnoloģijas

| Daļa | Kas izmantots | Kāpēc |
|---|---|---|
| Serveris | Node.js, Express | Viena valoda visam projektam |
| Datu nolasīšana | fetch, Cheerio | ss.lv ir parasts HTML. AutoScout24 un mobile.de dati ir lapā kā JSON, tāpēc nav vajadzīgs pārlūks |
| Dati | JSON fails | Prototipam pietiek, nav jāinstalē datubāze |
| Frontend | HTML, JavaScript, Tailwind CSS | Bez ietvara, lai kods būtu vienkāršs |
| AI | Claude API | Modelis var meklēt tikai mūsu datos caur vienu funkciju, tāpēc neizdomā auto |
| Testi | node:test | Iebūvēts Node.js, nevajag papildu bibliotēkas |
| Hostings | Cloudflare Tunnel | Bezmaksas HTTPS uz sava domēna |

## Kā aprēķina, vai auto ir lēts

1. Katram auto atrod līdzīgos: tā pati marka un modelis, gads ±2, nobraukums ±60 000 km.
2. Ja līdzīgo ir vismaz 3, ņem to cenu mediānu. Tā ir tirgus cena.
3. Atlaide = (tirgus cena − auto cena) / tirgus cena × 100%.

Mediāna tiek izmantota vidējā vietā, jo viens sludinājums par 1 € vai 999 999 € vidējo sabojātu. Ja līdzīgo auto ir par maz, atlaidi nerāda.

Dažādas vietnes vienu un to pašu auto sauc dažādi (piemēram "Mercedes-Benz" un "Mercedes", "320d" un "320"), tāpēc nosaukumi pirms salīdzināšanas tiek vienādoti.

## Drošība

- Visa ievade tiek pārbaudīta serverī. Nederīgi dati atgriež kļūdu 400.
- Teksts no sludinājumiem tiek attēlots kā teksts, tāpēc HTML vai skripti tajā neizpildās (XSS).
- Serveris drīkst pieprasīt tikai ss.lv, AutoScout24 un mobile.de adreses.
- Skenēt un dzēst datus publiskajā versijā var tikai ar admin paroli.
- Ir pieprasījumu limits, un starp lapām ir pauze, lai nenoslogotu vietnes.
- Tālruņi un privātpersonu vārdi netiek saglabāti. Lai sazinātos ar pārdevēju, jāatver oriģinālais sludinājums.

## Projekta struktūra

```
public/           lapa (index.html, app.js, fonti)
src/server.js     API
src/scrapers/     katras vietnes nolasīšana
src/deals.js      atlaides aprēķins
src/search.js     meklēšana un filtri
src/assistant.js  AI asistents
src/validate.js   ievades pārbaude
src/db.js         datu glabāšana
test/             testi un lapu paraugi
```

## API

| Metode | Adrese | Ko dara |
|---|---|---|
| GET | /api/listings | sludinājumu saraksts ar filtriem |
| GET | /api/listing | viena auto pilnā informācija |
| GET | /api/models | markas modeļi |
| GET | /api/stats | kopsavilkums |
| POST | /api/scrape | skenē vietnes |
| POST | /api/assistant | AI asistents |
| POST | /api/demo | ielādē demo datus |
| DELETE | /api/listings | izdzēš datus |

## Testi

35 automātiskie testi (`npm test`) un manuālie scenāriji failā [TESTI.md](TESTI.md).

## Ierobežojumi

- Ja kāda vietne nomaina lapas izskatu, tās nolasīšana jāpielabo. Katrai vietnei ir tests ar lapas paraugu, tāpēc to var ātri pamanīt.
- mobile.de bieži bloķē automātisku nolasīšanu. Tad lapa to parāda, un pārējās vietnes strādā.
- Vācijas un Latvijas cenas atšķiras, bet pagaidām tās salīdzina kopā.

Nākotnē: automātiska skenēšana katru stundu, vairāk Baltijas vietņu (auto24.lv, autoplius.lt) un paziņojumi par jauniem izdevīgiem auto.

## Ieguldījums

| Dalībnieks | Ko izdarīja |
|---|---|
| Rihards Indars | Ideja, prasības, dizaina virziens, testēšana ar īstām vietnēm, publicēšana, prezentācija |

Koda rakstīšanā izmantots AI asistents (Claude).
