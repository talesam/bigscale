# syntax=docker/dockerfile:1.7
#
# BigScale — single image bundling:
#   • the VPN coordinator (binary `bigscale`, built from the Headscale source)
#   • the admin web panel (SvelteKit + Node)
#   • an entrypoint that orchestrates both processes and mints the API key
#     on first boot.
#
# BigScale is an independent project derived from Headscale. We don't pull
# the upstream prebuilt image; we compile the engine from a pinned source
# revision so this image is fully self-contained and reproducible.

# ─── Stage 1: build the server binary from Headscale source ──────────────────
FROM golang:1.25-alpine AS server-bin

# Pin the upstream Headscale revision we build from. Bump deliberately —
# upstream may introduce breaking config/API changes between minor versions.
ARG HEADSCALE_VERSION=v0.28.0

RUN apk add --no-cache git ca-certificates
WORKDIR /build
RUN git clone --depth 1 --branch "${HEADSCALE_VERSION}" \
        https://github.com/juanfont/headscale.git . \
 && CGO_ENABLED=0 GOOS=linux go build \
        -trimpath \
        -ldflags="-s -w -X github.com/juanfont/headscale/cmd/headscale/cli.Version=${HEADSCALE_VERSION}" \
        -o /bigscale ./cmd/headscale

# ─── Stage 2: panel build ────────────────────────────────────────────────────
FROM node:20-alpine AS panel-build
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ─── Stage 3: final image ────────────────────────────────────────────────────
FROM node:20-alpine

ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF
ARG HEADSCALE_VERSION=v0.28.0

LABEL org.opencontainers.image.title="BigScale" \
      org.opencontainers.image.description="BigScale mesh VPN coordinator (server + admin panel) in a single image" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/talesam/bigscale" \
      org.opencontainers.image.url="https://github.com/talesam/bigscale" \
      org.opencontainers.image.documentation="https://github.com/talesam/bigscale#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="talesam" \
      org.bigscale.engine.version="${HEADSCALE_VERSION}"

RUN apk add --no-cache ca-certificates wget tini bash

# Server binary built from source. The `headscale` symlink is preserved for
# tooling that expects the upstream command name.
COPY --from=server-bin /bigscale /usr/local/bin/bigscale
RUN ln -sf /usr/local/bin/bigscale /usr/local/bin/headscale

# Panel
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
    ADMIN_DATA_DIR=/data \
    BIGSCALE_VERSION=${VERSION}

VOLUME ["/var/lib/bigscale", "/etc/bigscale", "/data"]
EXPOSE 3000 8080 50443 3478/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8080/health >/dev/null 2>&1 \
   && wget -qO- http://localhost:3000/      >/dev/null 2>&1 \
   || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
