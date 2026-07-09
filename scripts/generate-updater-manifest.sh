#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"
BUNDLE_DIR="${DESKTOP_DIR}/src-tauri/target/release/bundle"
GITHUB_REPO="${GITHUB_REPOSITORY:-yanshekki/SoulCorp}"
VERSION="${1:-$(node -p "require('${DESKTOP_DIR}/package.json').version")}"
TAG="v${VERSION}"
OUTPUT="${2:-${REPO_ROOT}/latest.json}"

APPIMAGE_NAME="SoulCorp_${VERSION}_amd64.AppImage"
APPIMAGE_PATH="${BUNDLE_DIR}/appimage/${APPIMAGE_NAME}"
SIG_PATH="${APPIMAGE_PATH}.sig"

if [[ ! -f "${APPIMAGE_PATH}" ]]; then
  echo "ERROR: missing updater bundle ${APPIMAGE_PATH}"
  echo "Run: TAURI_SIGNING_PRIVATE_KEY_PATH=... bash scripts/build-release.sh"
  exit 1
fi

if [[ ! -f "${SIG_PATH}" ]]; then
  echo "ERROR: missing signature ${SIG_PATH}"
  exit 1
fi

SIGNATURE="$(tr -d '\n' < "${SIG_PATH}")"
DOWNLOAD_BASE="https://github.com/${GITHUB_REPO}/releases/download/${TAG}"
PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

node <<NODE
const fs = require("fs");
const manifest = {
  version: "${VERSION}",
  notes: "SoulCorp public beta update",
  pub_date: "${PUB_DATE}",
  platforms: {
    "linux-x86_64": {
      url: "${DOWNLOAD_BASE}/${APPIMAGE_NAME}",
      signature: "${SIGNATURE}",
    },
  },
};
fs.writeFileSync("${OUTPUT}", JSON.stringify(manifest, null, 2) + "\n");
NODE

echo "Wrote ${OUTPUT} for ${TAG}"