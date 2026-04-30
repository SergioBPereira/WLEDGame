#!/usr/bin/env bash
set -euo pipefail

SRC=/root/wled_game
DST=/opt/wledgame

if [[ $EUID -ne 0 ]]; then echo "must run as root"; exit 1; fi

if [[ ! -f "$SRC/wleds.json" ]]; then
  echo "ERROR: $SRC/wleds.json not found."
  echo "Copy wleds.example.json to wleds.json and edit with your WLED IPs."
  exit 1
fi

if ! id wledgame >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin wledgame
fi

mkdir -p "$DST" /var/lib/wledgame
rsync -a --delete \
  --exclude=node_modules --exclude=docs --exclude=.git --exclude=tests \
  --exclude=wleds.example.json \
  "$SRC"/ "$DST"/
chown -R wledgame:wledgame "$DST" /var/lib/wledgame

if ! cmp -s "$SRC/package-lock.json" "$DST/.last-deployed-lock" 2>/dev/null; then
  echo "[deploy] installing deps"
  (cd "$DST" && sudo -u wledgame npm ci --no-audit --no-fund)
  cp "$SRC/package-lock.json" "$DST/.last-deployed-lock"
fi

chown -R wledgame:wledgame "$DST" /var/lib/wledgame
echo "[deploy] OK"
