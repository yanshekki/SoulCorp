#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HUB_DIR="${REPO_ROOT}/hub/soulmd-hub"
INTEGRATION_DIR="${HUB_DIR}/tests/integration"
DYNAMIC_DIR="${HUB_DIR}/tests/dynamic"

echo "==> SoulMD Hub security test suite"

if ! command -v php >/dev/null 2>&1; then
  echo "ERROR: php is required to run hub security tests." >&2
  exit 1
fi

echo "-- Syntax check (integration + dynamic)"
while IFS= read -r -d '' file; do
  php -l "${file}" >/dev/null
  echo "  ok ${file#${REPO_ROOT}/}"
done < <(find "${HUB_DIR}/tests" -type f -name '*.php' -print0)

echo "-- Integration tests"
php "${INTEGRATION_DIR}/gate_integration_test.php"
php "${INTEGRATION_DIR}/api_security_test.php"

echo "-- Dynamic harness smoke (offline, no server required)"
php "${DYNAMIC_DIR}/replay_test.php" >/dev/null
php "${DYNAMIC_DIR}/csrf_bypass_test.php" >/dev/null
php "${DYNAMIC_DIR}/gating_bypass_test.php" >/dev/null
php "${DYNAMIC_DIR}/race_idor_test.php" >/dev/null

echo "All hub security tests passed."