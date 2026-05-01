#!/usr/bin/env bash
# Builda as imagens bigscale/server e bigscale/panel com metadados de versão.
# Esses valores entram nos LABELs OCI (org.opencontainers.image.*).
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${BIGSCALE_VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || echo dev)}"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "==> Buildando bigscale/server:$VERSION e bigscale/panel:$VERSION"
echo "    BUILD_DATE=$BUILD_DATE"
echo "    VCS_REF=$VCS_REF"
echo ""

BIGSCALE_VERSION="$VERSION" BUILD_DATE="$BUILD_DATE" VCS_REF="$VCS_REF" \
  docker compose build "$@"

# Tags adicionais com a versão (além de :latest)
docker tag bigscale/server:latest "bigscale/server:$VERSION" 2>/dev/null || true
docker tag bigscale/panel:latest  "bigscale/panel:$VERSION"  2>/dev/null || true

echo ""
echo "✓ Imagens disponíveis:"
echo "    bigscale/server:latest, bigscale/server:$VERSION"
echo "    bigscale/panel:latest,  bigscale/panel:$VERSION"
