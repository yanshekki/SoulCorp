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
  1)
    test -f "${DESKTOP_DIR}/src/components/GameScene.tsx"
    test -f "${DESKTOP_DIR}/src/components/AgentSprite.tsx"
    test -f "${DESKTOP_DIR}/src/components/BuildingModal.tsx"
    test -f "${DESKTOP_DIR}/src/components/world/IsometricWorld.tsx"
    echo "Phase 1 checks passed."
    ;;
  2)
    test -f "${DESKTOP_DIR}/src-tauri/src/ai/provider.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/soul/mod.rs"
    test -f "${DESKTOP_DIR}/src/components/UI/MeetingPanel.tsx"
    test -f "${DESKTOP_DIR}/src/components/UI/FinancePanel.tsx"
    test -f "${DESKTOP_DIR}/src/components/UI/SettingsPanel.tsx"
    test -f "${DESKTOP_DIR}/src/components/UI/GodModePanel.tsx"
    echo "Phase 2 checks passed."
    ;;
  3)
    test -f "${DESKTOP_DIR}/src-tauri/src/workspace/storage.rs"
    test -f "${DESKTOP_DIR}/src/components/workspace/WorkspaceShell.tsx"
    test -f "${DESKTOP_DIR}/src/components/workspace/PageEditor.tsx"
    test -f "${DESKTOP_DIR}/src/components/workspace/FolderTree.tsx"
    echo "Phase 3 checks passed."
    ;;
  *)
    echo "Phase ${PHASE} has no extra automated checks yet."
    ;;
esac

echo "All verification steps completed."