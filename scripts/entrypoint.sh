#!/usr/bin/env bash
# Entrypoint da imagem única BigScale.
# 1. Sobe o coordenador VPN (bigscale serve) em background.
# 2. Aguarda /health responder e o socket Unix aparecer.
# 3. Gera a API key (se /data/api-key não existir) e a deixa pronta para o painel.
# 4. Sobe o painel (node build/index.js) em foreground.
# Repassa SIGTERM/SIGINT para os dois processos para shutdown limpo.

set -e

SERVER_PID=""
PANEL_PID=""

shutdown() {
  echo "[bigscale] sinal recebido, encerrando processos..."
  [ -n "$PANEL_PID"  ] && kill -TERM "$PANEL_PID"  2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill -TERM "$SERVER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

echo "[bigscale] iniciando coordenador VPN..."
/usr/local/bin/bigscale serve &
SERVER_PID=$!

echo "[bigscale] aguardando server (HTTP /health + socket)..."
i=0
until wget -q -O /dev/null http://127.0.0.1:8080/health 2>/dev/null \
      && [ -S /var/run/bigscale/bigscale.sock ] \
      && /usr/local/bin/bigscale apikeys list >/dev/null 2>&1; do
  i=$((i+1))
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[bigscale] server morreu durante o boot. abortando."
    exit 1
  fi
  if [ "$i" -gt 90 ]; then
    echo "[bigscale] timeout aguardando server"
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

if [ ! -s /data/api-key ] || ! grep -q '^hskey-api-' /data/api-key; then
  echo "[bigscale] gerando nova API key..."
  rm -f /data/api-key
  for try in 1 2 3 4 5; do
    KEY="$(/usr/local/bin/bigscale apikeys create --expiration 9999d 2>/dev/null \
            | grep -E '^hskey-api-' | tail -1)"
    if [ -n "$KEY" ]; then
      printf '%s\n' "$KEY" > /data/api-key
      chmod 600 /data/api-key
      echo "[bigscale] API key salva em /data/api-key (tentativa $try)"
      break
    fi
    echo "[bigscale] tentativa $try falhou, retry em 2s..."
    sleep 2
  done
  if [ ! -s /data/api-key ]; then
    echo "[bigscale] não foi possível gerar a API key"
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
else
  echo "[bigscale] API key existente em /data/api-key — reutilizando."
fi

echo "[bigscale] iniciando painel admin..."
cd /app
node build/index.js &
PANEL_PID=$!

# Aguarda qualquer um dos dois processos sair; quando isso ocorre, derruba o outro.
while true; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[bigscale] server (PID $SERVER_PID) saiu — derrubando painel."
    kill -TERM "$PANEL_PID" 2>/dev/null || true
    wait "$PANEL_PID" 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "$PANEL_PID" 2>/dev/null; then
    echo "[bigscale] painel (PID $PANEL_PID) saiu — derrubando server."
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 2
done
