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

## Uz Linux servera (24/7) — ieteicamais veids

1. Ar WinSCP iekopē tuneļa atslēgu `C:\Users\indar\.cloudflared\ad81e4ab-bb8f-492b-bc94-18fbb159ddcf.json` uz servera mapi `~/.cloudflared/`.
2. Serverī (SSH):
   ```
   git clone https://github.com/Rihardssss/dealvo.git ~/dealvo
   bash ~/dealvo/deploy/setup-server.sh
   ```
3. Windows datorā aptur veco versiju: `deploy\stop-dealvo.cmd` un `schtasks /Delete /TN Dealvo /F`.

Atjaunināšana pēc jauna `git push`: `bash ~/dealvo/deploy/update-server.sh`.
Žurnāli: `journalctl -u dealvo -f`. Admin parole: `cat ~/dealvo/.env`.

### ss.lv uz servera (Cloudflare Worker)
ss.lv bloķē datu centru IP adreses, tāpēc serveris ss.lv lasa caur bezmaksas Cloudflare Worker:
1. Cloudflare → Workers & Pages → Create → Worker, nosaukums `dealvo-sslv` → Deploy → Edit code → iekopē `deploy/cloudflare-worker.js` → Deploy.
2. Worker → Settings → Variables and Secrets → Add: tips Secret, nosaukums `KEY`, vērtība — gara nejauša parole.
3. Serverī `~/dealvo/.env` pievieno `SCRAPE_PROXY=https://dealvo-sslv.<konts>.workers.dev` un `SCRAPE_PROXY_KEY=<tā pati parole>`, tad `sudo systemctl restart dealvo`.

## 6. Lai lapa strādātu vienmēr (Windows dators)

Mapē `deploy/` ir skripti, kas palaiž serveri un tuneli fonā un restartē tos, ja tie apstājas:

| Fails | Ko dara |
|---|---|
| `start-dealvo.cmd` | palaiž serveri un tuneli (minimizētos logos) |
| `stop-dealvo.cmd` | aptur abus |
| `install-autostart.cmd` | vienu reizi: Dealvo startējas pats, kad ielogojies Windows |

Žurnāli: `data/server.log` un `data/tunnel.log`.

Lai dators neaizmigtu: `powercfg /change standby-timeout-ac 0`.

## Svarīgi prezentācijas dienā
- Datoram ar serveri un tuneli jābūt ieslēgtam un tīklā.
- Ja skolas WiFi bloķē, demo dati (`npm run seed`) strādā lokāli uz http://localhost:3000 arī bez interneta.
