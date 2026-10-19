# Pārbaudes scenāriji

Automātiskie testi: `npm test` → 14/14 izdodas (ss.lv parsētājs, deal algoritms, API).

## 1. Lietotājs atrod labāko dealu
| | |
|---|---|
| Soļi | Atver lapu → "Ielādēt demo datus" → kārtošana "Labākais deals" |
| Sagaidāmais | Augšā auto ar lielāko "−% zem tirgus"; katrā kartē redzama tirgus cena |
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
