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
"${REPO_ROOT}/scripts/verify-phase.sh" "${PHASE}"

git checkout main
git merge --no-ff "${BRANCH}" -m "merge: complete phase ${PHASE}"

python3 - <<PY
import json
from datetime import datetime, timezone
with open("${STATE_FILE}") as f:
    data = json.load(f)
data["phases"]["${PHASE}"]["status"] = "merged"
data["phases"]["${PHASE}"]["merged_at"] = datetime.now(timezone.utc).isoformat()
next_phase = str(int("${PHASE}") + 1)
if next_phase in data["phases"]:
    data["current_phase"] = int(next_phase)
with open("${STATE_FILE}", "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

git add "${STATE_FILE}"
git commit -m "chore: mark phase ${PHASE} as merged"
git push origin main

echo "Phase ${PHASE} merged to origin/main."