#!/usr/bin/env bash
# Builda a imagem bigscale com metadados de versão.
# Esses valores entram nos LABELs OCI (org.opencontainers.image.*).
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${BIGSCALE_VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || echo dev)}"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "==> Buildando bigscale:$VERSION"
echo "    BUILD_DATE=$BUILD_DATE"
echo "    VCS_REF=$VCS_REF"
echo ""

BIGSCALE_VERSION="$VERSION" BUILD_DATE="$BUILD_DATE" VCS_REF="$VCS_REF" \
  docker compose build "$@"

# Tag adicional com a versão (além de :latest), só se for uma versão "real"
if [ "$VERSION" != "dev" ] && [ "$VERSION" != "unknown" ]; then
  docker tag bigscale:latest "bigscale:$VERSION" 2>/dev/null || true
  echo ""
  echo "✓ Imagem disponível: bigscale:latest, bigscale:$VERSION"
else
  echo ""
  echo "✓ Imagem disponível: bigscale:latest"
fi
