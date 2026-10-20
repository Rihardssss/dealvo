# Pārbaudes scenāriji

Automātiskie testi: `npm test` → 48/48 izdodas (3 vietņu parsētāji, SQLite datubāze, deal algoritms, API, AI asistents, automātiskā skenēšana, admin aizsardzība).

## 1. Lietotājs atrod labāko dealu
| | |
|---|---|
| Soļi | Atver lapu → "Ielādēt demo datus" → kārtošana "Lielākā atlaide" |
| Sagaidāmais | Augšā auto ar lielāko "−% zem tirgus"; katrā rindā redzama cenu skala |
| Rezultāts | ✅ Izdodas |

## 2. Filtrēšana
| | |
|---|---|
| Soļi | Marka: Volkswagen, Cena līdz: 8000, Gads no: 2012 |
| Sagaidāmais | Tikai VW, visi ≤ 8000 €, visi 2012+; skaits atjaunojas uzreiz |
| Rezultāts | ✅ Izdodas |

## 3. Nederīga ievade
| | |
|---|---|
| Soļi | `GET /api/listings?minYear=abc&maxPrice=-5` un `POST /api/scrape {"make":"../../evil.com"}` |
| Sagaidāmais | Atbilde 400 ar kļūdas tekstu latviski, serveris neavarē |
| Rezultāts | ✅ Izdodas (automātiskie testi 1, 2, 4) |

## 4. Īsti dati no ss.lv
| | |
|---|---|
| Soļi | Marka: BMW, Lapas: 2 → "Skenēt ss.lv" |
| Sagaidāmais | Statusā "Atrasti N sludinājumi"; kartēs bildes un saite "Atvērt →" uz ss.lv |
| Rezultāts | ☐ Aizpildīt prezentācijas dienā |

## 5. Atkārtota skenēšana nedublē datus
| | |
|---|---|
| Soļi | Divreiz noskenē to pašu marku |
| Sagaidāmais | Otrajā reizē 0 jauni; ja cena mainījusies — "↓ bija X €" |
| Rezultāts | ✅ Izdodas (automātiskais tests 5) |

## 6. XSS aizsardzība
| | |
|---|---|
| Soļi | Sludinājums ar nosaukumu `<script>alert(1)</script>` |
| Sagaidāmais | Teksts parādās kā teksts, kods neizpildās |
| Rezultāts | ✅ Izdodas |

## 7. AI asistents
| | |
|---|---|
| Soļi | Ieraksta "dīzeļa VW līdz 8000 eur pēc 2012" → "Jautāt" |
| Sagaidāmais | Atbilde latviski, 3 ieteiktie auto; meklēšanas filtri automātiski aizpildās (VW, dīzelis, 8000, 2013) |
| Rezultāts | ✅ Izdodas (bezsaistes režīmā un ar viltotu Claude API testā) |

## 8. Vairāki avoti vienlaikus
| | |
|---|---|
| Soļi | "Atjaunot datus" → atzīmē ss.lv, AutoScout24, mobile.de → BMW → "Skenēt" |
| Sagaidāmais | Katrai vietnei atsevišķs rezultāts; ja kāda bloķē, tā tiek parādīta sarkanā, pārējās dati saglabājas |
| Rezultāts | ☐ Aizpildīt prezentācijas dienā |

## 9. Sludinājuma pilnais skats un pārdevējs
| | |
|---|---|
| Soļi | Nospiež uz jebkura auto |
| Sagaidāmais | Atveras logs ar bildēm, tehniskajiem datiem, cenu salīdzinājumu, pārdevēju (dīleris/privātpersona + pilsēta) un līdzīgiem auto; Esc aizver |
| Rezultāts | ✅ Izdodas |

## 10. Privātums
| | |
|---|---|
| Soļi | Sludinājums, kura aprakstā un kontaktos ir tālrunis un privātpersonas vārds |
| Sagaidāmais | Tālrunis un vārds netiek saglabāti un netiek rādīti |
| Rezultāts | ✅ Izdodas (automātiskie testi ar ss.lv un AutoScout24 paraugiem) |

## 11. SQL injekcija
| | |
|---|---|
| Soļi | Filtrā ievada `320'; DROP TABLE listings; --` |
| Sagaidāmais | Nekas netiek atrasts, tabula paliek neskarta |
| Rezultāts | ✅ Izdodas (automātiskais tests) |

## 12. AI asistenta saruna
| | |
|---|---|
| Soļi | „dīzeļa VW līdz 9000 eur” → „Un kaut ko lētāku?” → „Salīdzini pirmos divus” → auto lapā „Jautāt AI: vai šis ir labs pirkums?” |
| Sagaidāmais | Otrais jautājums samazina cenu un saglabā VW un dīzeli; salīdzinājums nosauc atšķirības un ieteikumu; novērtējumā ir plusi, mīnusi un secinājums |
| Rezultāts | ✅ Izdodas (automātiskie testi + pārbaudīts pārlūkā) |
