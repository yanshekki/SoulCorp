#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"
BUNDLE_DIR="${DESKTOP_DIR}/src-tauri/target/release/bundle"

echo "==> SoulCorp release build"

cd "${DESKTOP_DIR}"
pnpm install --frozen-lockfile || pnpm install
pnpm verify
cargo test --manifest-path src-tauri/Cargo.toml --lib

if pkg-config --exists glib-2.0 2>/dev/null; then
  pnpm release:bundle

  echo ""
  echo "==> Release artifacts"
  ls -lh "${BUNDLE_DIR}/deb/"*.deb 2>/dev/null || true
  ls -lh "${BUNDLE_DIR}/rpm/"*.rpm 2>/dev/null || true
  ls -lh "${BUNDLE_DIR}/appimage/"*.AppImage 2>/dev/null || true

  test -f "${BUNDLE_DIR}/deb/SoulCorp_1.0.0_amd64.deb"
  test -x "${DESKTOP_DIR}/src-tauri/target/release/soulcorp-desktop"

  echo ""
  echo "Install .deb: sudo dpkg -i ${BUNDLE_DIR}/deb/SoulCorp_1.0.0_amd64.deb"
  echo "Run AppImage: chmod +x ${BUNDLE_DIR}/appimage/SoulCorp_1.0.0_amd64.AppImage && ./SoulCorp_1.0.0_amd64.AppImage"
else
  echo "WARN: glib-2.0 not found; skipping Tauri bundle."
  echo "Frontend build completed. Install Linux prerequisites for .deb/.AppImage:"
  echo "https://tauri.app/start/prerequisites/"
fi

echo "Release build step completed."