# syntax=docker/dockerfile:1.7

# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS prod

ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.title="BigScale Panel" \
      org.opencontainers.image.description="Painel admin web para o coordenador VPN BigScale" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/talesam/bigscale" \
      org.opencontainers.image.url="https://github.com/talesam/bigscale" \
      org.opencontainers.image.documentation="https://github.com/talesam/bigscale#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.authors="Tales A. Mendonça <tales@example.com>" \
      org.opencontainers.image.vendor="BigCommunity"

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "build/index.js"]
