#!/usr/bin/env bash
set -euo pipefail

HUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../hub/soulmd-hub/public_html" && pwd)"
PORT="${HUB_DEV_PORT:-8787}"

echo "Starting soulmd-hub dev server on http://127.0.0.1:${PORT}"
echo "Set VITE_SOULMD_HUB_URL=http://127.0.0.1:${PORT} for desktop dev."

cd "${HUB_ROOT}"
php -S "127.0.0.1:${PORT}" -t .