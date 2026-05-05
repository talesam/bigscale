#!/usr/bin/env bash
# Builds the bigscale image with version metadata.
# These values populate the OCI labels (org.opencontainers.image.*).
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${BIGSCALE_VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || echo dev)}"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "==> Building bigscale:$VERSION"
echo "    BUILD_DATE=$BUILD_DATE"
echo "    VCS_REF=$VCS_REF"
echo ""

BIGSCALE_VERSION="$VERSION" BUILD_DATE="$BUILD_DATE" VCS_REF="$VCS_REF" \
  docker compose build "$@"

# Extra tag with the version (in addition to :latest), only for "real" versions.
if [ "$VERSION" != "dev" ] && [ "$VERSION" != "unknown" ]; then
  docker tag bigscale:latest "bigscale:$VERSION" 2>/dev/null || true
  echo ""
  echo "✓ Image available: bigscale:latest, bigscale:$VERSION"
else
  echo ""
  echo "✓ Image available: bigscale:latest"
fi
