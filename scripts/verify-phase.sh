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
  8)
    test -f "${DESKTOP_DIR}/src/components/world/agentRenderSystem.ts"
    test -f "${DESKTOP_DIR}/src/components/world/pixelAgentSprite.ts"
    test -f "${DESKTOP_DIR}/src/components/world/pixelBuildingTexture.ts"
    grep -q "AgentRenderSystem" "${DESKTOP_DIR}/src/components/world/threeOfficeScene.ts"
    grep -q "InstancedMesh" "${DESKTOP_DIR}/src/components/world/agentRenderSystem.ts"
    echo "Phase 8 checks passed."
    ;;
  9)
    test -f "${REPO_ROOT}/scripts/release-install-smoke.sh"
    test -f "${DESKTOP_DIR}/src-tauri/target/release/bundle/deb/SoulCorp_1.0.0_amd64.deb" \
      || echo "WARN: release .deb not built yet (run build-release.sh)."
    echo "Phase 9 ship checks passed."
    ;;
  17)
    test -f "${DESKTOP_DIR}/src-tauri/src/commands/vip.rs"
    test -f "${DESKTOP_DIR}/src/components/UI/VipExecutivePanel.tsx"
    grep -q "custom_departments" "${DESKTOP_DIR}/src-tauri/src/tier/mod.rs"
    grep -q "ai_co_ceo" "${DESKTOP_DIR}/src-tauri/src/tier/mod.rs"
    grep -q "spawn_co_ceo" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "create_custom_department" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "run_co_ceo_briefing" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "VipExecutivePanel" "${DESKTOP_DIR}/src/components/UI/ShellLayout.tsx"
    grep -q "custom_departments" "${DESKTOP_DIR}/src/types/game.ts"
    echo "Phase 17 VIP Co-CEO + custom departments checks passed."
    ;;
  16)
    test -f "${DESKTOP_DIR}/src-tauri/src/ai/health.rs"
    grep -q "get_meeting_ai_status" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "chat_with_fallback" "${DESKTOP_DIR}/src-tauri/src/ai/mod.rs"
    grep -q "pub async fn advance_meeting" "${DESKTOP_DIR}/src-tauri/src/commands/meeting.rs"
    grep -q "ollama_base_url" "${DESKTOP_DIR}/src-tauri/src/state/mod.rs"
    grep -q "meeting-ai-status" "${DESKTOP_DIR}/src/components/UI/MeetingPanel.tsx"
    grep -q "Test meeting AI connection" "${DESKTOP_DIR}/src/components/UI/SettingsPanel.tsx"
    grep -q "MeetingAiStatus" "${DESKTOP_DIR}/src/types/game.ts"
    echo "Phase 16 real LLM meeting checks passed."
    ;;
  15)
    test -f "${DESKTOP_DIR}/src-tauri/src/relationships/mod.rs"
    test -f "${DESKTOP_DIR}/src/components/UI/RelationshipGraphView.tsx"
    grep -q "get_agent_relationship_graph" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "get_recruitment_analytics" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "agent_relationships" "${DESKTOP_DIR}/src-tauri/src/state/mod.rs"
    grep -q "compatibility_score" "${DESKTOP_DIR}/src-tauri/src/commands/recruitment.rs"
    grep -q "RelationshipGraphView" "${DESKTOP_DIR}/src/components/UI/RecruitmentPanel.tsx"
    grep -q "recruitment-analytics" "${DESKTOP_DIR}/src/components/UI/RecruitmentPanel.tsx"
    grep -q "relationship-graph" "${DESKTOP_DIR}/src/App.css"
    echo "Phase 15 relationship graph + recruitment analytics checks passed."
    ;;
  14)
    test -f "${REPO_ROOT}/hub/soulmd-hub/public_html/api/market-gig-submit-qc.php"
    test -f "${REPO_ROOT}/hub/soulmd-hub/public_html/api/market-gig-reject-qc.php"
    test -f "${REPO_ROOT}/hub/soulmd-hub/public_html/api/market-gig-dispute.php"
    grep -q "submitGigForQc" "${REPO_ROOT}/hub/soulmd-hub/private/src/SoulCorpHub.php"
    grep -q "rejectGigQc" "${REPO_ROOT}/hub/soulmd-hub/private/src/SoulCorpHub.php"
    grep -q "disputeGig" "${REPO_ROOT}/hub/soulmd-hub/private/src/SoulCorpHub.php"
    grep -q "submit_gig_for_qc" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "reject_gig_qc" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "dispute_hub_gig" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "submitGigForQc" "${DESKTOP_DIR}/src/services/hubClient.ts"
    grep -q "Submit for QC" "${DESKTOP_DIR}/src/components/UI/MarketplacePanel.tsx"
    grep -q "qc_score" "${DESKTOP_DIR}/src-tauri/src/state/mod.rs"
    grep -q "submit_contract_for_qc_at_index" "${DESKTOP_DIR}/src-tauri/src/gigs/mod.rs"
    echo "Phase 14 gig QC / disputed flow checks passed."
    ;;
  13)
    grep -q "get_event_foresight" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "get_morale_heatmap" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "executive_lounge" "${DESKTOP_DIR}/src-tauri/src/hub/client.rs"
    grep -q "god_mode_reality_debt" "${DESKTOP_DIR}/src-tauri/src/state/mod.rs"
    grep -q "morale-heatmap" "${DESKTOP_DIR}/src/components/UI/RecruitmentPanel.tsx"
    grep -q "foresight-block" "${DESKTOP_DIR}/src/components/UI/EventFeed.tsx"
    grep -q "build_netlify_toml" "${DESKTOP_DIR}/src-tauri/src/static_site/mod.rs"
    echo "Phase 13 Pro/VIP depth checks passed."
    ;;
  12)
    test -f "${DESKTOP_DIR}/src-tauri/src/static_site/mod.rs"
    grep -q "export_static_site_zip" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "build_index_html" "${DESKTOP_DIR}/src-tauri/src/static_site/mod.rs"
    grep -q "export_static_site_zip" "${DESKTOP_DIR}/src-tauri/src/commands/export.rs"
    grep -q "Export Static Site" "${DESKTOP_DIR}/src/components/UI/SettingsPanel.tsx"
    grep -q "Netlify" "${DESKTOP_DIR}/src-tauri/src/static_site/mod.rs"
    echo "Phase 12 static site export checks passed."
    ;;
  11)
    test -f "${DESKTOP_DIR}/src-tauri/src/commands/onboarding.rs"
    test -f "${DESKTOP_DIR}/src/components/UI/OnboardingWizard.tsx"
    test -f "${DESKTOP_DIR}/src/services/onboardingClient.ts"
    grep -q "get_onboarding_state" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "complete_onboarding" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "onboarding_completed" "${DESKTOP_DIR}/src-tauri/src/state/mod.rs"
    grep -q "OnboardingWizard" "${DESKTOP_DIR}/src/App.tsx"
    grep -q "onboarding-overlay" "${DESKTOP_DIR}/src/App.css"
    echo "Phase 11 onboarding checks passed."
    ;;
  10)
    test -f "${DESKTOP_DIR}/src-tauri/src/commands/gigs.rs"
    test -f "${DESKTOP_DIR}/src-tauri/src/gigs/mod.rs"
    test -f "${REPO_ROOT}/hub/soulmd-hub/public_html/api/market-gig-start.php"
    test -f "${REPO_ROOT}/hub/soulmd-hub/public_html/api/market-gig-complete.php"
    grep -q "accept_hub_gig" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
    grep -q "assign_gig" "${DESKTOP_DIR}/src-tauri/src/hub/client.rs"
    grep -q "start_gig" "${DESKTOP_DIR}/src-tauri/src/hub/client.rs"
    grep -q "complete_gig" "${DESKTOP_DIR}/src-tauri/src/hub/client.rs"
    grep -q "listGigContracts" "${DESKTOP_DIR}/src/services/hubClient.ts"
    grep -q "marketplace-tabs" "${DESKTOP_DIR}/src/components/UI/MarketplacePanel.tsx"
    grep -q "startGig" "${REPO_ROOT}/hub/soulmd-hub/private/src/SoulCorpHub.php"
    grep -q "completeGig" "${REPO_ROOT}/hub/soulmd-hub/private/src/SoulCorpHub.php"
    echo "Phase 10 gig lifecycle checks passed."
    ;;
  *)
    echo "Phase ${PHASE} has no extra automated checks yet."
    ;;
esac

echo "All verification steps completed."