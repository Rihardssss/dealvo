# Publicēšana: dealvo.riciboy.eu caur Cloudflare Tunnel

Serveris darbojas uz tava datora, Cloudflare Tunnel to droši padara pieejamu internetā.
Nav jāatver porti rūterī, HTTPS sertifikātu Cloudflare dod automātiski.

```
Pārlūks ──HTTPS──▶ Cloudflare ──tunelis──▶ cloudflared (tavs dators) ──▶ localhost:3000 (Dealvo)
```

## 1. Palaid Dealvo ar admin paroli
Publiskajā versijā skenēt un dzēst datus drīkst tikai ar paroli.

```bash
npm install
# Windows PowerShell:
$env:ADMIN_TOKEN="izdomā-garu-paroli"; $env:ANTHROPIC_API_KEY="sk-ant-..."; npm start
# macOS / Linux:
ADMIN_TOKEN="izdomā-garu-paroli" ANTHROPIC_API_KEY="sk-ant-..." npm start
```

## 2. Uzinstalē cloudflared
- Windows: `winget install --id Cloudflare.cloudflared`
- macOS: `brew install cloudflared`

## 3. Izveido tuneli un subdomēnu
```bash
cloudflared tunnel login                 # atver pārlūku, izvēlies riciboy.eu
cloudflared tunnel create dealvo      # izveido tuneli + credentials failu
cloudflared tunnel route dns dealvo dealvo.riciboy.eu   # DNS ieraksts tiek izveidots automātiski
```

## 4. Konfigurācija
Nokopē `deploy/cloudflared-config.example.yml` uz `~/.cloudflared/config.yml`
(Windows: `C:\Users\<tu>\.cloudflared\config.yml`) un ieliec savu tuneļa ID un credentials faila ceļu
(abi parādās pēc `tunnel create`).

## 5. Palaid tuneli
```bash
cloudflared tunnel run dealvo
```
Atver **https://dealvo.riciboy.eu** 🎉

Lai tunelis startētu automātiski kopā ar datoru: `cloudflared service install`.

## Svarīgi prezentācijas dienā
- Datoram ar serveri un tuneli jābūt ieslēgtam un tīklā.
- Ja skolas WiFi bloķē, demo dati (`npm run seed`) strādā lokāli uz http://localhost:3000 arī bez interneta.
