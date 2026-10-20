#!/usr/bin/env bash
# Atjauno Dealvo uz servera no GitHub:  bash deploy/update-server.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm install --no-audit --no-fund
npm run build:css
sudo systemctl restart dealvo
echo "Atjaunots: $(git log -1 --format='%h %s')"
