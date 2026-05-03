# syntax=docker/dockerfile:1.7
#
# BigScale — imagem única que empacota:
#   • o coordenador VPN (binário `bigscale`, motor Headscale rebatizado)
#   • o painel admin web (SvelteKit + Node)
#   • um entrypoint que orquestra os dois processos e gera a API key na 1ª subida.

# ─── Stage 1: binário do server ──────────────────────────────────────────────
FROM headscale/headscale:latest AS server-bin

# ─── Stage 2: build do painel ────────────────────────────────────────────────
FROM node:20-alpine AS panel-build
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ─── Stage 3: imagem final ───────────────────────────────────────────────────
FROM node:20-alpine

ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.title="BigScale" \
      org.opencontainers.image.description="Coordenador VPN mesh BigScale (server + painel admin) em uma única imagem" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/talesam/bigscale" \
      org.opencontainers.image.url="https://github.com/talesam/bigscale" \
      org.opencontainers.image.documentation="https://github.com/talesam/bigscale#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="BigCommunity"

RUN apk add --no-cache ca-certificates wget tini bash

# Binário do server (rebrand: bigscale -> headscale como symlink p/ compat)
COPY --from=server-bin /ko-app/headscale /usr/local/bin/bigscale
RUN ln -sf /usr/local/bin/bigscale /usr/local/bin/headscale

# Painel
WORKDIR /app
COPY --from=panel-build /app/build         ./build
COPY --from=panel-build /app/package.json  ./
COPY --from=panel-build /app/node_modules  ./node_modules

# Entrypoint
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN mkdir -p /var/lib/bigscale /etc/bigscale /var/run/bigscale /data

ENV NODE_ENV=production \
    PORT=3000 \
    HEADSCALE_CONFIG=/etc/bigscale/config.yaml \
    BIGSCALE_SERVER_URL=http://127.0.0.1:8080 \
    BIGSCALE_API_KEY_FILE=/data/api-key \
    ADMIN_DATA_DIR=/data

VOLUME ["/var/lib/bigscale", "/etc/bigscale", "/data"]
EXPOSE 3000 8080 50443 3478/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8080/health >/dev/null 2>&1 \
   && wget -qO- http://localhost:3000/      >/dev/null 2>&1 \
   || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
