#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"
BUNDLE_DIR="${DESKTOP_DIR}/src-tauri/target/release/bundle"

echo "==> SoulCorp release build"

cd "${DESKTOP_DIR}"
APP_VERSION="$(node -p "require('./package.json').version")"
pnpm install --frozen-lockfile || pnpm install
pnpm verify
cargo test --manifest-path src-tauri/Cargo.toml --lib

if pkg-config --exists glib-2.0 2>/dev/null; then
  if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
    KEY_PATH="${DESKTOP_DIR}/src-tauri/.signing/soulcorp.key"
    if [[ -f "${KEY_PATH}" ]]; then
      export TAURI_SIGNING_PRIVATE_KEY_PATH="${KEY_PATH}"
      echo "Using local updater signing key at ${KEY_PATH}"
    else
      echo "WARN: No TAURI_SIGNING_PRIVATE_KEY(_PATH); updater artifacts may be unsigned."
    fi
  fi
  pnpm release:bundle

  echo ""
  echo "==> Release artifacts"
  ls -lh "${BUNDLE_DIR}/deb/"*.deb 2>/dev/null || true
  ls -lh "${BUNDLE_DIR}/rpm/"*.rpm 2>/dev/null || true
  ls -lh "${BUNDLE_DIR}/appimage/"*.AppImage 2>/dev/null || true

  test -f "${BUNDLE_DIR}/deb/SoulCorp_1.0.0_amd64.deb"
  test -x "${DESKTOP_DIR}/src-tauri/target/release/soulcorp-desktop"
  if [[ -f "${BUNDLE_DIR}/appimage/SoulCorp_${APP_VERSION}_amd64.AppImage.sig" ]]; then
    bash "${REPO_ROOT}/scripts/generate-updater-manifest.sh" "${APP_VERSION}" > /dev/null
    echo "Updater manifest: ${REPO_ROOT}/latest.json"
  fi

  echo ""
  echo "Install .deb: sudo dpkg -i ${BUNDLE_DIR}/deb/SoulCorp_1.0.0_amd64.deb"
  echo "Run AppImage: chmod +x ${BUNDLE_DIR}/appimage/SoulCorp_1.0.0_amd64.AppImage && ./SoulCorp_1.0.0_amd64.AppImage"
else
  echo "WARN: glib-2.0 not found; skipping Tauri bundle."
  echo "Frontend build completed. Install Linux prerequisites for .deb/.AppImage:"
  echo "https://tauri.app/start/prerequisites/"
fi

echo "Release build step completed."