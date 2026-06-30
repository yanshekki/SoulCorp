#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${REPO_ROOT}/.automation/phase-state.json"
PHASE="${1:-}"

if [[ -z "${PHASE}" ]]; then
  echo "Usage: $0 <phase-number>"
  exit 1
fi

BRANCH=$(python3 - <<PY
import json
with open("${STATE_FILE}") as f:
    data = json.load(f)
print(data["phases"]["${PHASE}"]["branch"])
PY
)

cd "${REPO_ROOT}"
git fetch origin
git checkout main
git pull origin main
git checkout -B "${BRANCH}"

echo "Ready to implement phase ${PHASE} on branch ${BRANCH}"