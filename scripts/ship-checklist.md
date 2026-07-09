# SoulCorp Ship Checklist

## Core build (Phase 9)

- [x] `build-release.sh` produces Tauri bundles
- [x] `release-install-smoke.sh` validates .deb contents
- [x] Version pinned to 1.0.0 in package.json and tauri.conf.json
- [x] Production builds disable devtools
- [x] `e2e-smoke.sh` runs frontend + hub + 3D smoke hooks
- [x] `static-site-smoke.sh` validates export scaffolding
- [x] CI verify workflow runs phase 0 gate

## Public beta (Phase 25)

- [x] `tauri-plugin-updater` + Settings → Check for updates
- [x] Updater signing pubkey in `tauri.conf.json`
- [x] `generate-updater-manifest.sh` for `latest.json`
- [x] `.github/workflows/release.yml` on `v*` tags
- [ ] `TAURI_SIGNING_PRIVATE_KEY` GitHub secret configured
- [ ] First tagged beta release published

See `scripts/public-beta-checklist.md` for full release steps.