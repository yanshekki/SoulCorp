#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"

echo "==> Search smoke checks"

cd "${DESKTOP_DIR}"

required_files=(
  "src/components/UI/SearchField.tsx"
  "src/components/UI/SearchableListToolbar.tsx"
  "src/components/UI/SearchableTextSection.tsx"
  "src/utils/listSearch.ts"
  "src/utils/textSearch.ts"
  "src/utils/multiSectionTextSearch.ts"
  "src/acceptance/searchAcceptance.ts"
  "src/components/UI/execution/ExecutionLogSection.tsx"
  "src/components/UI/execution/ExecutionRunDetailModal.tsx"
)

for file in "${required_files[@]}"; do
  test -f "${DESKTOP_DIR}/${file}"
done

grep -q "execution-run-global-search" "${DESKTOP_DIR}/src/components/UI/execution/ExecutionRunDetailModal.tsx"
grep -q "SearchableListToolbar" "${DESKTOP_DIR}/src/components/UI/AgentsPanel.tsx"
grep -q "SearchableListToolbar" "${DESKTOP_DIR}/src/components/UI/command-center/CoCeoPanel.tsx"
grep -q "runSearchAcceptanceTests" "${DESKTOP_DIR}/src/acceptance/acceptanceTests.ts"
grep -q "filterByQuery" "${DESKTOP_DIR}/src/components/UI/command-center/CommandCenterPanel.tsx"
grep -q "SearchField" "${DESKTOP_DIR}/src/components/workspace/WorkspaceSearch.tsx"

pnpm typecheck
pnpm exec tsx scripts/run-search-acceptance.ts

echo "Search smoke checks passed."