#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"
OUTPUT="${SOULCORP_3D_SMOKE_OUTPUT:-/tmp/soulcorp-3d-smoke.json}"
TIMEOUT_SEC="${SOULCORP_3D_SMOKE_TIMEOUT:-90}"
RELEASE_BINARY="${DESKTOP_DIR}/src-tauri/target/release/soulcorp-desktop"
DEBUG_BINARY="${DESKTOP_DIR}/src-tauri/target/debug/soulcorp-desktop"

echo "==> SoulCorp 3D smoke test (xvfb + release/debug binary)"

if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "SKIP: xvfb-run not installed (sudo apt install xvfb)."
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "FAIL: python3 required to validate smoke report."
  exit 1
fi

choose_binary() {
  if [[ -n "${SOULCORP_3D_SMOKE_BINARY:-}" && -x "${SOULCORP_3D_SMOKE_BINARY}" ]]; then
    echo "${SOULCORP_3D_SMOKE_BINARY}"
    return
  fi
  if [[ -x "${RELEASE_BINARY}" ]]; then
    echo "${RELEASE_BINARY}"
    return
  fi
  if [[ -x "${DEBUG_BINARY}" ]]; then
    echo "${DEBUG_BINARY}"
    return
  fi

  echo "No bundled desktop binary found; building debug bundle for smoke test..." >&2
  cd "${DESKTOP_DIR}"
  pnpm verify
  # Plain `cargo build` debug binaries still point at devUrl (localhost:1420).
  # `tauri build --debug` embeds dist/ and is required for headless xvfb smoke.
  pnpm tauri build --debug
  echo "${DEBUG_BINARY}"
}

BINARY="$(choose_binary)"
echo "Using binary: ${BINARY}"

rm -f "${OUTPUT}"

export SOULCORP_3D_SMOKE=1
export SOULCORP_3D_SMOKE_OUTPUT="${OUTPUT}"
export LIBGL_ALWAYS_SOFTWARE="${LIBGL_ALWAYS_SOFTWARE:-1}"
export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"

set +e
xvfb-run -a -s "-screen 0 1280x720x24" timeout "${TIMEOUT_SEC}" "${BINARY}" >/tmp/soulcorp-3d-smoke.log 2>&1
APP_EXIT=$?
set -e

if [[ ! -f "${OUTPUT}" ]]; then
  echo "FAIL: smoke report not written (${OUTPUT})."
  echo "App exit code: ${APP_EXIT}"
  tail -n 40 /tmp/soulcorp-3d-smoke.log || true
  exit 1
fi

python3 - "${OUTPUT}" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    report = json.load(handle)

errors = []
if not report.get("webgl_ok"):
    errors.append(f"webgl_ok=false ({report.get('error')})")
if report.get("render_status") != "ready":
    errors.append(f"render_status={report.get('render_status')}")
if report.get("mode") != "3d":
    errors.append(f"mode={report.get('mode')}")
if float(report.get("non_black_ratio", 0)) < 0.05:
    errors.append(f"non_black_ratio={report.get('non_black_ratio')} (screen likely black)")
if float(report.get("average_luminance", 0)) < 8:
    errors.append(f"average_luminance={report.get('average_luminance')} (too dark)")

if errors:
    print("FAIL: 3D smoke checks failed:")
    for item in errors:
        print(f"  - {item}")
    print(json.dumps(report, indent=2))
    sys.exit(1)

print("PASS: 3D scene rendered with visible content.")
print(json.dumps(report, indent=2))
PY

echo "3D smoke test passed (app exit=${APP_EXIT})."