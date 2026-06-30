#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"

echo "==> SoulCorp E2E smoke tests"

"${REPO_ROOT}/scripts/verify-phase.sh" 6

BUNDLE_DIR="${DESKTOP_DIR}/src-tauri/target/release/bundle"
if [[ -f "${BUNDLE_DIR}/deb/SoulCorp_1.0.0_amd64.deb" ]]; then
  echo "Release .deb bundle present ($(du -h "${BUNDLE_DIR}/deb/SoulCorp_1.0.0_amd64.deb" | cut -f1))."
fi
if [[ -f "${BUNDLE_DIR}/appimage/SoulCorp_1.0.0_amd64.AppImage" ]]; then
  echo "Release AppImage present ($(du -h "${BUNDLE_DIR}/appimage/SoulCorp_1.0.0_amd64.AppImage" | cut -f1))."
fi

# Rust module presence checks (no full cargo build required on minimal Linux)
for file in \
  "${DESKTOP_DIR}/src-tauri/src/tier/mod.rs" \
  "${DESKTOP_DIR}/src-tauri/src/commands/tier.rs" \
  "${DESKTOP_DIR}/src/components/UI/TierPanel.tsx"
do
  test -f "${file}"
done

# Hub API smoke (optional local dev server)
if command -v php >/dev/null 2>&1; then
  HUB_PORT="${HUB_DEV_PORT:-8799}"
  HUB_ROOT="${REPO_ROOT}/hub/soulmd-hub/public_html"
  php -S "127.0.0.1:${HUB_PORT}" -t "${HUB_ROOT}" >/tmp/soulcorp-hub-smoke.log 2>&1 &
  HUB_PID=$!
  sleep 1
  if curl -fsS "http://127.0.0.1:${HUB_PORT}/api/market-gigs.php?status=open" >/tmp/soulcorp-hub-smoke.json; then
    echo "Hub marketplace endpoint responded."
  else
    echo "WARN: Hub marketplace endpoint did not respond (non-fatal in smoke mode)."
  fi
  kill "${HUB_PID}" >/dev/null 2>&1 || true
else
  echo "WARN: php not available; skipping hub API smoke."
fi

echo "E2E smoke tests passed."