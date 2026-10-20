#!/usr/bin/env bash
# Dealvo uzstādīšana uz Linux servera (Ubuntu/Debian), lai lapa strādātu 24/7.
# Palaid no projekta mapes:  bash deploy/setup-server.sh
# Ko dara:
#   1) uzinstalē Node.js 22 un cloudflared, ja to nav
#   2) uzinstalē projektu (npm install, CSS)
#   3) izveido divus systemd servisus: dealvo (serveris) un dealvo-tunnel (Cloudflare tunelis)
#      Abi startējas paši pēc servera restarta un restartējas, ja nokrīt.
# Citas programmas (piem. FiveM) netiek aiztiktas.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="$(whoami)"
TUNNEL_ID="ad81e4ab-bb8f-492b-bc94-18fbb159ddcf"
HOSTNAME_PUBLIC="dealvo.riciboy.eu"
CREDS="$HOME/.cloudflared/$TUNNEL_ID.json"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

say "1/6 Node.js"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

say "2/6 cloudflared"
if ! command -v cloudflared >/dev/null 2>&1; then
  ARCH="$(dpkg --print-architecture)"   # amd64 vai arm64
  curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  sudo dpkg -i /tmp/cloudflared.deb
fi
cloudflared --version

say "3/6 Projekts"
cd "$APP_DIR"
npm install --no-audit --no-fund
npm run build:css

# Brīvs ports (3000, ja aizņemts, tad nākamais)
PORT=3000
while ss -ltn | awk '{print $4}' | grep -qE "[:.]${PORT}\$"; do PORT=$((PORT + 1)); done
if [ ! -f .env ]; then
  printf 'PORT=%s\nADMIN_TOKEN=%s\n' "$PORT" "$(openssl rand -hex 16)" > .env
  chmod 600 .env
  echo "Izveidots .env (admin parole ir tur: cat .env)"
else
  if grep -q '^PORT=' .env; then PORT="$(grep '^PORT=' .env | cut -d= -f2)"; else echo "PORT=$PORT" >> .env; fi
fi
echo "Ports: $PORT"

say "4/6 Tuneļa atslēga"
if [ ! -f "$CREDS" ]; then
  echo "Nav atrasts $CREDS"
  echo "Ar WinSCP iekopē failu no Windows mapes C:\\Users\\indar\\.cloudflared\\$TUNNEL_ID.json"
  echo "uz servera mapi ~/.cloudflared/ un palaid šo skriptu vēlreiz."
  exit 1
fi
chmod 600 "$CREDS"
cat > "$HOME/.cloudflared/dealvo.yml" <<YML
tunnel: $TUNNEL_ID
credentials-file: $CREDS
ingress:
  - hostname: $HOSTNAME_PUBLIC
    service: http://localhost:$PORT
  - service: http_status:404
YML

say "5/6 Servisi"
NODE_BIN="$(command -v node)"
CF_BIN="$(command -v cloudflared)"
sudo tee /etc/systemd/system/dealvo.service >/dev/null <<UNIT
[Unit]
Description=Dealvo (lietotu auto meklētājs)
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN --disable-warning=ExperimentalWarning --env-file-if-exists=.env src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/dealvo-tunnel.service >/dev/null <<UNIT
[Unit]
Description=Dealvo Cloudflare tunelis
After=network-online.target dealvo.service
Wants=network-online.target

[Service]
User=$RUN_USER
ExecStart=$CF_BIN --no-autoupdate tunnel --config $HOME/.cloudflared/dealvo.yml run
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now dealvo dealvo-tunnel
sudo systemctl restart dealvo dealvo-tunnel

say "6/6 Pārbaude"
sleep 6
if curl -fsS "http://localhost:$PORT/api/config" >/dev/null; then
  echo "Serveris strādā uz porta $PORT."
else
  echo "Serveris neatbild. Žurnāls: journalctl -u dealvo -n 50"
fi
systemctl --no-pager --lines=0 status dealvo dealvo-tunnel | grep -E 'Active:|●' || true
echo
echo "Gatavs. Atver https://$HOSTNAME_PUBLIC"
echo "Žurnāli: journalctl -u dealvo -f   un   journalctl -u dealvo-tunnel -f"
