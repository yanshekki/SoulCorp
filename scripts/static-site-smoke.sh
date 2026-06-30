#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"

grep -q "build_index_html" "${DESKTOP_DIR}/src-tauri/src/static_site/mod.rs"
grep -q "build_sitemap_xml" "${DESKTOP_DIR}/src-tauri/src/static_site/mod.rs"
grep -q "build_vercel_json" "${DESKTOP_DIR}/src-tauri/src/static_site/mod.rs"
grep -q "build_netlify_toml" "${DESKTOP_DIR}/src-tauri/src/static_site/mod.rs"
grep -q "sitemap.xml" "${DESKTOP_DIR}/src-tauri/src/commands/export.rs"
grep -q "Export Static Site" "${DESKTOP_DIR}/src/components/UI/SettingsPanel.tsx"

echo "Static site smoke checks passed."