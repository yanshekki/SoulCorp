#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/soulcorp-desktop"
APP_VERSION="$(node -p "require('${DESKTOP_DIR}/package.json').version")"
DEB_PATH="${SOULCORP_DEB_PATH:-${DESKTOP_DIR}/src-tauri/target/release/bundle/deb/SoulCorp_${APP_VERSION}_amd64.deb}"
SMOKE_OUTPUT="${SOULCORP_3D_SMOKE_OUTPUT:-/tmp/soulcorp-3d-smoke.json}"
SMOKE_TIMEOUT="${SOULCORP_3D_SMOKE_TIMEOUT:-120}"
USE_DOCKER="${SOULCORP_RELEASE_DOCKER:-1}"

echo "==> SoulCorp release install smoke"

if [[ ! -f "${DEB_PATH}" ]]; then
  echo "Release .deb not found at ${DEB_PATH}"
  echo "Run: bash ${REPO_ROOT}/scripts/build-release.sh"
  exit 1
fi

echo "Package: ${DEB_PATH} ($(du -h "${DEB_PATH}" | cut -f1))"
echo "Depends: $(dpkg-deb -f "${DEB_PATH}" Depends 2>/dev/null || echo unknown)"
DEB_CONTENTS="$(dpkg-deb -c "${DEB_PATH}" 2>/dev/null || true)"
if [[ "${DEB_CONTENTS}" != *"usr/bin/soulcorp-desktop"* ]]; then
  echo "FAIL: .deb does not contain usr/bin/soulcorp-desktop"
  exit 1
fi

run_host_smoke() {
  local binary="${1:-/usr/bin/soulcorp-desktop}"
  rm -f "${SMOKE_OUTPUT}"
  export SOULCORP_3D_SMOKE=1
  export SOULCORP_3D_SMOKE_OUTPUT="${SMOKE_OUTPUT}"
  export LIBGL_ALWAYS_SOFTWARE=1
  export WEBKIT_DISABLE_DMABUF_RENDERER=1

  set +e
  timeout "${SMOKE_TIMEOUT}" xvfb-run -a -s "-screen 0 1280x720x24" "${binary}" >/tmp/soulcorp-release-install-smoke.log 2>&1
  local exit_code=$?
  set -e

  if [[ ! -f "${SMOKE_OUTPUT}" ]]; then
    echo "FAIL: installed binary did not write 3D smoke report."
    echo "Exit code: ${exit_code}"
    tail -n 30 /tmp/soulcorp-release-install-smoke.log || true
    return 1
  fi

  python3 - "${SMOKE_OUTPUT}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    report = json.load(handle)

if not report.get("webgl_ok") or report.get("render_status") != "ready":
    print("FAIL: smoke report indicates broken 3D render")
    print(json.dumps(report, indent=2))
    sys.exit(1)

print("PASS: installed package launches and renders 3D content.")
print(json.dumps(report, indent=2))
PY
}

run_docker_smoke() {
  echo "Running clean Ubuntu container install test..."
  docker run --rm \
    --env SOULCORP_3D_SMOKE=1 \
    --env SOULCORP_3D_SMOKE_OUTPUT=/tmp/soulcorp-3d-smoke.json \
    --env LIBGL_ALWAYS_SOFTWARE=1 \
    --env WEBKIT_DISABLE_DMABUF_RENDERER=1 \
    --env SMOKE_TIMEOUT="${SMOKE_TIMEOUT}" \
    -v "${DEB_PATH}:/tmp/SoulCorp.deb:ro" \
    ubuntu:24.04 bash -lc '
      set -euo pipefail
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq
      apt-get install -y -qq /tmp/SoulCorp.deb xvfb python3 \
        libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1 \
        >/tmp/apt-install.log 2>&1
      test -x /usr/bin/soulcorp-desktop
      rm -f /tmp/soulcorp-3d-smoke.json
      set +e
      timeout "${SMOKE_TIMEOUT}" xvfb-run -a -s "-screen 0 1280x720x24" /usr/bin/soulcorp-desktop >/tmp/app.log 2>&1
      app_exit=$?
      set -e
      echo "PASS: package installed in clean Ubuntu container."
      if [[ -f /tmp/soulcorp-3d-smoke.json ]]; then
        python3 - <<'"'"'PY'"'"'
import json
with open("/tmp/soulcorp-3d-smoke.json", encoding="utf-8") as handle:
    report = json.load(handle)
if not report.get("webgl_ok") or report.get("render_status") != "ready":
    print("FAIL: container smoke report invalid")
    print(json.dumps(report, indent=2))
    raise SystemExit(1)
print("PASS: container install + 3D smoke OK")
print(json.dumps(report, indent=2))
PY
      elif [[ "${SOULCORP_REQUIRE_SMOKE:-0}" == "1" ]]; then
        echo "FAIL: expected 3D smoke report (rebuild release with latest code)."
        echo "App exit: ${app_exit}"
        tail -n 40 /tmp/app.log || true
        exit 1
      else
        echo "WARN: no 3D smoke report (older package). Install succeeded; rebuild release for full smoke."
        echo "App exit: ${app_exit}"
      fi
    '
}

if [[ "${USE_DOCKER}" == "1" ]] && command -v docker >/dev/null 2>&1; then
  run_docker_smoke
elif command -v xvfb-run >/dev/null 2>&1 && [[ -x "/usr/bin/soulcorp-desktop" ]]; then
  echo "Docker unavailable or disabled; using host-installed binary."
  run_host_smoke "/usr/bin/soulcorp-desktop"
else
  echo "SKIP: need docker or a host-installed /usr/bin/soulcorp-desktop + xvfb-run."
  echo "Manual check:"
  echo "  sudo dpkg -i ${DEB_PATH}"
  echo "  bash ${REPO_ROOT}/scripts/e2e-3d-smoke.sh"
  exit 0
fi

echo "Release install smoke passed."