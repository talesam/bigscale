#!/usr/bin/env bash
# Entrypoint for the single BigScale image.
# 1. Starts the VPN coordinator (`bigscale serve`) in the background.
# 2. Waits for /health to respond and the Unix socket to appear.
# 3. Mints the API key (when /data/api-key is missing) for the panel.
# 4. Joins the panel itself to the tailnet as `panel.<base_domain>` so peers
#    can reach it on its tailnet IP for tunnel-identity-authenticated APIs
#    (POST /api/devices/me/os-user).
# 5. Starts the panel (`node build/index.js`) in the foreground.
# SIGTERM/SIGINT are forwarded to both processes for a clean shutdown.

set -e

SERVER_PID=""
PANEL_PID=""
TS_PID=""

shutdown() {
  echo "[bigscale] signal received, terminating processes..."
  [ -n "$PANEL_PID"  ] && kill -TERM "$PANEL_PID"  2>/dev/null || true
  [ -n "$TS_PID"     ] && kill -TERM "$TS_PID"     2>/dev/null || true
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

# ─── Join the tailnet as `panel` ─────────────────────────────────────────────
# The panel needs a tailnet IP so peers can authenticate by tunnel identity
# (POST /api/devices/me/os-user). tailscaled creates a TUN interface inside
# the container; the panel then listens on 0.0.0.0:3000 and is reachable on
# its tailnet IP automatically. Requires NET_ADMIN + /dev/net/tun on the
# container — already wired in docker-compose.yml. Falls back to userspace
# networking if /dev/net/tun is missing (still works inbound via the
# `tailscale serve` step below).
#
# State persists at /var/lib/tailscale (mounted by docker-compose), so we
# only mint a preauth key on the very first boot.
PANEL_HOSTNAME="${BIGSCALE_PANEL_HOSTNAME:-panel}"
TS_DISABLED="${BIGSCALE_DISABLE_TAILNET_PEER:-false}"

if [ "$TS_DISABLED" = "true" ]; then
  echo "[bigscale] tailnet peer disabled via BIGSCALE_DISABLE_TAILNET_PEER"
else
  if [ -c /dev/net/tun ]; then
    TS_TUN_FLAG=""
    echo "[bigscale] starting tailscaled (TUN mode)..."
  else
    TS_TUN_FLAG="--tun=userspace-networking"
    echo "[bigscale] /dev/net/tun absent — starting tailscaled in userspace mode"
  fi
  /usr/sbin/tailscaled \
      $TS_TUN_FLAG \
      --statedir=/var/lib/tailscale \
      --socket=/var/run/tailscale/tailscaled.sock \
      >/var/log/tailscaled.log 2>&1 &
  TS_PID=$!

  # Wait for the local control socket
  i=0
  until [ -S /var/run/tailscale/tailscaled.sock ]; do
    i=$((i+1))
    if ! kill -0 "$TS_PID" 2>/dev/null; then
      echo "[bigscale] tailscaled died during boot — see /var/log/tailscaled.log"
      tail -n 30 /var/log/tailscaled.log 2>/dev/null || true
      kill -TERM "$SERVER_PID" 2>/dev/null || true
      exit 1
    fi
    if [ "$i" -gt 30 ]; then
      echo "[bigscale] timeout waiting for tailscaled socket"
      kill -TERM "$TS_PID" "$SERVER_PID" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done

  # If state already has a NodeKey, we're already registered — `tailscale up`
  # without --authkey just brings the link back online.
  if /usr/bin/tailscale --socket=/var/run/tailscale/tailscaled.sock status >/dev/null 2>&1; then
    echo "[bigscale] tailnet state present, bringing peer up..."
    /usr/bin/tailscale --socket=/var/run/tailscale/tailscaled.sock up \
        --login-server=http://127.0.0.1:8080 \
        --hostname="$PANEL_HOSTNAME" \
        --accept-dns=false \
        --reset || true
  else
    echo "[bigscale] minting preauth key for panel peer (first boot)..."
    # Idempotent — `users create` is non-zero if the user already exists.
    /usr/local/bin/bigscale users create _panel >/dev/null 2>&1 || true
    # v0.28 CLI: `preauthkeys create --user` requires a numeric user ID, not a
    # name. Resolve `_panel` to its ID via `users list -o json`.
    PANEL_USER_ID="$(/usr/local/bin/bigscale users list -o json 2>/dev/null \
                    | jq -r '.[] | select(.name=="_panel") | .id' | head -1)"
    if [ -z "$PANEL_USER_ID" ]; then
      echo "[bigscale] could not resolve _panel user id"
      PANEL_PREAUTH=""
    else
      # v0.28 keys are prefixed `hskey-auth-`; older builds emitted bare hex.
      PANEL_PREAUTH="$(/usr/local/bin/bigscale preauthkeys create --user "$PANEL_USER_ID" --expiration 24h 2>/dev/null \
                      | grep -E '^(hskey-auth-[A-Za-z0-9_-]+|[a-f0-9]{40,})$' | tail -1)"
    fi
    if [ -z "$PANEL_PREAUTH" ]; then
      echo "[bigscale] failed to mint preauth key for panel — continuing without tailnet peer"
      kill -TERM "$TS_PID" 2>/dev/null || true
      TS_PID=""
    else
      /usr/bin/tailscale --socket=/var/run/tailscale/tailscaled.sock up \
          --login-server=http://127.0.0.1:8080 \
          --authkey="$PANEL_PREAUTH" \
          --hostname="$PANEL_HOSTNAME" \
          --accept-dns=false || \
        echo "[bigscale] tailscale up returned non-zero — peer may not be reachable until next boot"
    fi
  fi

  if [ -n "$TS_PID" ]; then
    PANEL_TS_IP="$(/usr/bin/tailscale --socket=/var/run/tailscale/tailscaled.sock ip -4 2>/dev/null | head -1)"
    if [ -n "$PANEL_TS_IP" ]; then
      echo "[bigscale] panel reachable on tailnet at $PANEL_TS_IP (hostname: $PANEL_HOSTNAME)"
      printf '%s\n' "$PANEL_TS_IP" > /data/panel-tailnet-ip
    else
      echo "[bigscale] tailnet IP not yet assigned — peers may need to retry"
    fi
    # In userspace mode, the panel needs `tailscale serve` to forward inbound
    # tailnet TCP/3000 to the local panel listener. In TUN mode the panel
    # binds 0.0.0.0:3000 directly and this is a no-op.
    if [ -n "$TS_TUN_FLAG" ]; then
      /usr/bin/tailscale --socket=/var/run/tailscale/tailscaled.sock \
          serve --bg --tcp=3000 tcp://127.0.0.1:3000 2>/dev/null \
        || echo "[bigscale] could not configure tailscale serve — peers may not reach :3000 in userspace mode"
    fi
  fi
fi

echo "[bigscale] starting admin panel..."
cd /app
node build/index.js &
PANEL_PID=$!

# Wait until any of the tracked processes exits; when one does, take the
# others down too. tailscaled exiting is non-fatal — it can be restarted on
# the next container boot, and the panel keeps serving the cookie-auth UI.
while true; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[bigscale] server (PID $SERVER_PID) exited — stopping panel."
    kill -TERM "$PANEL_PID" "$TS_PID" 2>/dev/null || true
    wait "$PANEL_PID" 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "$PANEL_PID" 2>/dev/null; then
    echo "[bigscale] panel (PID $PANEL_PID) exited — stopping server."
    kill -TERM "$SERVER_PID" "$TS_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 2
done
