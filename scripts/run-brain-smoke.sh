#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"

echo "==> Agent brain smoke checks"

cd "${DESKTOP_DIR}"

required_files=(
  "src-tauri/src/brain/resolver.rs"
  "src-tauri/src/commands/brain.rs"
  "src/components/UI/brain/MeetingBrainPicker.tsx"
  "src/components/UI/brain/ExecutionRuntimePicker.tsx"
  "src/components/UI/brain/EffectiveBrainPill.tsx"
  "src/utils/agentRuntimeCatalog.ts"
  "src/acceptance/brainAcceptance.ts"
)

for file in "${required_files[@]}"; do
  test -f "${DESKTOP_DIR}/${file}"
done

grep -q "get_brain_resolution_preview" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
grep -q "MeetingBrainPicker" "${DESKTOP_DIR}/src/components/UI/SettingsPanel.tsx"
grep -q "ExecutionRuntimePicker" "${DESKTOP_DIR}/src/components/UI/SettingsPanel.tsx"
grep -q "MeetingBrainPicker" "${DESKTOP_DIR}/src/components/UI/OnboardingWizard.tsx"
grep -q "get_brain_resolution_preview" "${DESKTOP_DIR}/src/components/UI/MeetingPanel.tsx"
grep -q "brain-pill-transport" "${DESKTOP_DIR}/src/styles/design-system.css"
grep -q "legacyMeetingProviderToRegistryId" "${DESKTOP_DIR}/src/utils/agentRuntimeCatalog.ts"
grep -q "runBrainAcceptanceTests" "${DESKTOP_DIR}/src/acceptance/acceptanceTests.ts"

pnpm typecheck
pnpm exec tsx scripts/run-brain-acceptance.ts

echo "Agent brain smoke checks passed."