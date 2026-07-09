#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HUB_DIR="${REPO_ROOT}/hub/soulmd-hub"
TEST_FILE="${HUB_DIR}/tests/integration/soulcorp_marketplace_test.php"

if ! command -v php >/dev/null 2>&1; then
  echo "WARN: php not found; skipping hub marketplace smoke."
  exit 0
fi

if [[ ! -f "${TEST_FILE}" ]]; then
  echo "ERROR: missing ${TEST_FILE}"
  exit 1
fi

php "${HUB_DIR}/tests/integration/soulcorp_marketplace_contract_test.php"
php "${TEST_FILE}"