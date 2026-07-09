#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HUB_BASE_URL="${HUB_BASE_URL:-https://soulmd-hub.ysk.hk}"
HUB_API_KEY="${HUB_API_KEY:-}"

pass=0
fail=0
warn=0

check() {
  local label="$1"
  local ok="$2"
  if [[ "$ok" == "1" ]]; then
    echo "  PASS: ${label}"
    pass=$((pass + 1))
  else
    echo "  FAIL: ${label}"
    fail=$((fail + 1))
  fi
}

warn_msg() {
  local label="$1"
  echo "  WARN: ${label}"
  warn=$((warn + 1))
}

echo "SoulCorp hub marketplace deploy verification"
echo "Base URL: ${HUB_BASE_URL}"
echo

echo "== Local smoke (optional) =="
if command -v php >/dev/null 2>&1; then
  if bash "${REPO_ROOT}/scripts/run-hub-marketplace-smoke.sh"; then
    check "local marketplace smoke" 1
  else
    check "local marketplace smoke" 0
  fi
else
  warn_msg "php not found — skipped local smoke"
fi
echo

echo "== Public API endpoints =="
required_paths=(
  "api/market-gigs.php?status=open"
  "api/market-gigs.php"
  "api/market-gig-assign.php"
  "api/market-gig-start.php"
  "api/market-gig-submit-qc.php"
  "api/market-gig-reject-qc.php"
  "api/market-gig-dispute.php"
  "api/market-gig-complete.php"
  "api/market-gig-cancel.php"
  "api/sync-pull.php"
  "api/sync-push.php"
  "api/user-soul-balance.php"
)

for path in "${required_paths[@]}"; do
  code="$(curl -sSL -o /tmp/hub_deploy_body.json -w "%{http_code}" \
    "${HUB_BASE_URL%/}/${path}" 2>/dev/null || echo "000")"
  # GET endpoints should not 404; POST-only endpoints may return 405 on GET — both OK
  if [[ "$code" == "404" || "$code" == "000" ]]; then
    check "${path} reachable (got ${code})" 0
  else
    check "${path} reachable (HTTP ${code})" 1
  fi
done
echo

echo "== market-gigs contract =="
gigs_code="$(curl -sSL -o /tmp/hub_gigs.json -w "%{http_code}" \
  "${HUB_BASE_URL%/}/api/market-gigs.php?status=open" 2>/dev/null || echo "000")"
if [[ "$gigs_code" == "200" ]] && grep -q '"success"' /tmp/hub_gigs.json 2>/dev/null; then
  check "market-gigs returns success JSON" 1
else
  check "market-gigs returns success JSON (HTTP ${gigs_code})" 0
  if [[ -f /tmp/hub_gigs.json ]]; then
    head -c 200 /tmp/hub_gigs.json >&2 || true
    echo >&2
  fi
fi
echo

echo "== Web marketplace UI =="
market_code="$(curl -sSL -o /tmp/hub_market.html -w "%{http_code}" \
  "${HUB_BASE_URL%/}/marketplace.php?tab=gigs" 2>/dev/null || echo "000")"
if [[ "$market_code" == "200" ]] && grep -q "SoulCorp Gigs\|SoulCorp 外包任務" /tmp/hub_market.html 2>/dev/null; then
  check "marketplace.php gigs tab present" 1
else
  check "marketplace.php gigs tab present (HTTP ${market_code})" 0
fi
echo

echo "== Authenticated sync (optional) =="
if [[ -z "$HUB_API_KEY" ]]; then
  warn_msg "HUB_API_KEY not set — skipped sync-pull / sync-push / soul-balance checks"
else
  pull_code="$(curl -sSL -o /tmp/hub_pull.json -w "%{http_code}" \
    -H "Authorization: Bearer ${HUB_API_KEY}" \
    "${HUB_BASE_URL%/}/api/sync-pull.php" 2>/dev/null || echo "000")"
  if [[ "$pull_code" == "200" ]] && grep -q '"open_gigs"' /tmp/hub_pull.json 2>/dev/null; then
    check "sync-pull authenticated" 1
  else
    check "sync-pull authenticated (HTTP ${pull_code})" 0
  fi

  push_code="$(curl -sSL -o /tmp/hub_push.json -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${HUB_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"queue":[]}' \
    "${HUB_BASE_URL%/}/api/sync-push.php" 2>/dev/null || echo "000")"
  if [[ "$push_code" == "200" ]] && grep -q '"accepted"' /tmp/hub_push.json 2>/dev/null; then
    check "sync-push authenticated (empty queue)" 1
  else
    check "sync-push authenticated (HTTP ${push_code})" 0
  fi

  balance_code="$(curl -sS -o /tmp/hub_balance.json -w "%{http_code}" \
    -H "Authorization: Bearer ${HUB_API_KEY}" \
    "${HUB_BASE_URL%/}/api/user-soul-balance.php" 2>/dev/null || echo "000")"
  if [[ "$balance_code" == "200" ]] && grep -q '"tier"' /tmp/hub_balance.json 2>/dev/null; then
    check "user-soul-balance authenticated" 1
  else
    check "user-soul-balance authenticated (HTTP ${balance_code})" 0
  fi
fi
echo

echo "Summary: ${pass} passed, ${fail} failed, ${warn} warnings"
if [[ "$fail" -gt 0 ]]; then
  echo "Deploy verification FAILED."
  exit 1
fi

echo "Deploy verification passed."
exit 0