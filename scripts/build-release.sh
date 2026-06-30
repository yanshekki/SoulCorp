#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"

echo "==> SoulCorp release build"

cd "${DESKTOP_DIR}"
pnpm install --frozen-lockfile || pnpm install
pnpm verify

if pkg-config --exists glib-2.0 2>/dev/null; then
  pnpm release:bundle
  echo "Release artifacts are under soulcorp-desktop/src-tauri/target/release/bundle/"
else
  echo "WARN: glib-2.0 not found; skipping Tauri bundle."
  echo "Frontend build completed. Install Linux prerequisites for .deb/.AppImage:"
  echo "https://tauri.app/start/prerequisites/"
fi

echo "Release build step completed."