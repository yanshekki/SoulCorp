#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"
PHASE="${1:-0}"

echo "==> Verifying SoulCorp phase ${PHASE}"

cd "${DESKTOP_DIR}"
pnpm install --frozen-lockfile || pnpm install
pnpm verify

if command -v cargo >/dev/null 2>&1; then
  cargo test --manifest-path src-tauri/Cargo.toml --lib
else
  echo "WARN: cargo not found; skipping Rust unit tests."
fi

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
    test -f "${DESKTOP_DIR}/src/components/BuildingModal.tsx"
    test -f "${DESKTOP_DIR}/src/components/world/ThreeOfficeRenderer.tsx"
    test -f "${DESKTOP_DIR}/src/components/world/webglDiagnostics.ts"
    grep -q "ThreeOfficeRenderer" "${DESKTOP_DIR}/src/components/GameScene.tsx"
    grep -q "onStatusChange" "${DESKTOP_DIR}/src/components/world/ThreeOfficeRenderer.tsx"
    echo "Phase 1 checks passed."
    ;;
  2)
    test -f "${DESKTOP_DIR}/src-tauri/src/ai/provider.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/ai/ollama.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/ai/hub_chat.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/db/persistence.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/soul/mod.rs"
    grep -q "provider_for" "${DESKTOP_DIR}/src-tauri/src/ai/mod.rs"
    grep -q "persist_app_state" "${DESKTOP_DIR}/src-tauri/src/db/persistence.rs"
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
  4)
    test -f "${DESKTOP_DIR}/src-tauri/src/achievements/mod.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/commands/export.rs"
    test -f "${DESKTOP_DIR}/src/components/UI/AchievementsPanel.tsx"
    test -f "${REPO_ROOT}/scripts/offline-checklist.md"
    echo "Phase 4 checks passed."
    ;;
  5)
    test -f "${DESKTOP_DIR}/src-tauri/src/hub/client.rs"
    grep -q "market-gigs.php" "${DESKTOP_DIR}/src-tauri/src/hub/client.rs"
    grep -q "sync-pull.php" "${DESKTOP_DIR}/src-tauri/src/hub/client.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/commands/hub.rs"
    test -f "${DESKTOP_DIR}/src/services/hubClient.ts"
    test -f "${DESKTOP_DIR}/src/components/UI/MarketplacePanel.tsx"
    test -f "${DESKTOP_DIR}/src/components/UI/RecruitmentPanel.tsx"
    test -f "${REPO_ROOT}/scripts/run-hub-dev.sh"
    test -f "${REPO_ROOT}/hub/soulmd-hub/public_html/api/market-gigs.php"
    echo "Phase 5 checks passed."
    ;;
  6)
    test -f "${DESKTOP_DIR}/src-tauri/src/tier/mod.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/commands/tier.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/commands/near.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/report/mod.rs"
    test -f "${DESKTOP_DIR}/src/components/UI/TierPanel.tsx"
    test -f "${REPO_ROOT}/scripts/build-release.sh"
    test -f "${REPO_ROOT}/scripts/e2e-smoke.sh"
    grep -q '"version": "1.0.0"' "${DESKTOP_DIR}/package.json"
    grep -q '"version": "1.0.0"' "${DESKTOP_DIR}/src-tauri/tauri.conf.json"
    grep -q '"devtools": false' "${DESKTOP_DIR}/src-tauri/tauri.conf.json"
    echo "Phase 6 checks passed."
    ;;
  7)
    test -f "${DESKTOP_DIR}/src/services/scene3dSmoke.ts"
    test -f "${DESKTOP_DIR}/src-tauri/src/commands/smoke.rs"
    test -f "${REPO_ROOT}/scripts/e2e-3d-smoke.sh"
    grep -q "is_3d_smoke_test_enabled" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "run3dSmokeTestFromCanvas" "${DESKTOP_DIR}/src/components/world/ThreeOfficeRenderer.tsx"
    echo "Phase 7 checks passed."
    ;;
  *)
    echo "Phase ${PHASE} has no extra automated checks yet."
    ;;
esac

echo "All verification steps completed."