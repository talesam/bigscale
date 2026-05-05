#!/usr/bin/env bash
# Entrypoint for the single BigScale image.
# 1. Starts the VPN coordinator (`bigscale serve`) in the background.
# 2. Waits for /health to respond and the Unix socket to appear.
# 3. Mints the API key (when /data/api-key is missing) for the panel.
# 4. Starts the panel (`node build/index.js`) in the foreground.
# SIGTERM/SIGINT are forwarded to both processes for a clean shutdown.

set -e

SERVER_PID=""
PANEL_PID=""

shutdown() {
  echo "[bigscale] signal received, terminating processes..."
  [ -n "$PANEL_PID"  ] && kill -TERM "$PANEL_PID"  2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill -TERM "$SERVER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

echo "[bigscale] starting VPN coordinator..."
/usr/local/bin/bigscale serve &
SERVER_PID=$!

echo "[bigscale] waiting for server (HTTP /health + socket)..."
i=0
until wget -q -O /dev/null http://127.0.0.1:8080/health 2>/dev/null \
      && [ -S /var/run/bigscale/bigscale.sock ] \
      && /usr/local/bin/bigscale apikeys list >/dev/null 2>&1; do
  i=$((i+1))
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[bigscale] server died during boot, aborting."
    exit 1
  fi
  if [ "$i" -gt 90 ]; then
    echo "[bigscale] timeout waiting for server"
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

if [ ! -s /data/api-key ] || ! grep -q '^hskey-api-' /data/api-key; then
  echo "[bigscale] minting new API key..."
  rm -f /data/api-key
  for try in 1 2 3 4 5; do
    KEY="$(/usr/local/bin/bigscale apikeys create --expiration 9999d 2>/dev/null \
            | grep -E '^hskey-api-' | tail -1)"
    if [ -n "$KEY" ]; then
      printf '%s\n' "$KEY" > /data/api-key
      chmod 600 /data/api-key
      echo "[bigscale] API key saved at /data/api-key (attempt $try)"
      break
    fi
    echo "[bigscale] attempt $try failed, retry in 2s..."
    sleep 2
  done
  if [ ! -s /data/api-key ]; then
    echo "[bigscale] failed to mint API key"
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
else
  echo "[bigscale] reusing existing API key at /data/api-key"
fi

echo "[bigscale] starting admin panel..."
cd /app
node build/index.js &
PANEL_PID=$!

# Wait until either process exits; when that happens, take the other down too.
while true; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[bigscale] server (PID $SERVER_PID) exited — stopping panel."
    kill -TERM "$PANEL_PID" 2>/dev/null || true
    wait "$PANEL_PID" 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "$PANEL_PID" 2>/dev/null; then
    echo "[bigscale] panel (PID $PANEL_PID) exited — stopping server."
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 2
done
