#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"

echo "==> Universal agent runtime smoke checks"

cd "${DESKTOP_DIR}"

required_files=(
  "src-tauri/resources/agent_runtimes.json"
  "src-tauri/src/agent_runtime/registry.rs"
  "src-tauri/src/agent_runtime/security.rs"
  "src-tauri/src/agent_runtime/adapters/mod.rs"
  "src-tauri/src/commands/agent_runtime.rs"
  "src/components/UI/command-center/AgentRuntimeSection.tsx"
  "src/utils/agentRuntimeCatalog.ts"
  "src/acceptance/runtimeAcceptance.ts"
)

for file in "${required_files[@]}"; do
  test -f "${DESKTOP_DIR}/${file}"
done

test ! -f "${DESKTOP_DIR}/src/utils/clawRuntime.ts"

grep -q "get_agent_runtime_catalog" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
grep -q "probe_all_agent_runtimes" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
grep -q "test_agent_runtime" "${DESKTOP_DIR}/src-tauri/src/lib.rs"
grep -q "AgentRuntimeSection" "${DESKTOP_DIR}/src/components/UI/command-center/CommandCenterPanel.tsx"
grep -q "command-runtime-status-card" "${DESKTOP_DIR}/src/styles/design-system.css"
grep -q "agent_runtime_fallback_to_llm" "${DESKTOP_DIR}/src-tauri/src/state/mod.rs"
grep -q "MAX_CAPTURE_BYTES" "${DESKTOP_DIR}/src-tauri/src/agent_runtime/security.rs"
grep -q "runRuntimeAcceptanceTests" "${DESKTOP_DIR}/src/acceptance/acceptanceTests.ts"

pnpm typecheck
pnpm exec tsx scripts/run-runtime-acceptance.ts

echo "Universal agent runtime smoke checks passed."