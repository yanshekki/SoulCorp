#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"
PHASE="${1:-0}"

echo "==> Verifying SoulCorp phase ${PHASE}"

cd "${DESKTOP_DIR}"
pnpm install --frozen-lockfile || pnpm install
pnpm verify

if pkg-config --exists glib-2.0 2>/dev/null; then
  cargo check --manifest-path src-tauri/Cargo.toml
else
  echo "WARN: glib-2.0 not found; skipping cargo check."
  echo "Install Tauri Linux prerequisites: https://tauri.app/start/prerequisites/"
  cargo fmt --manifest-path src-tauri/Cargo.toml --check
fi

case "${PHASE}" in
  0)
    echo "Phase 0 checks passed."
    ;;
  *)
    echo "Phase ${PHASE} has no extra automated checks yet."
    ;;
esac

echo "All verification steps completed."