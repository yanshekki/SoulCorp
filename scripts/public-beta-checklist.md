# SoulCorp Public Beta Checklist

## Pre-release verification

- [ ] `bash scripts/verify-phase.sh 24` passes
- [ ] `bash scripts/e2e-smoke.sh` passes
- [ ] `bash scripts/run-hub-marketplace-smoke.sh` passes
- [ ] `pnpm verify` in `soulcorp-desktop/`
- [ ] `cargo test --manifest-path soulcorp-desktop/src-tauri/Cargo.toml --lib`

## Build & sign

- [ ] `TAURI_SIGNING_PRIVATE_KEY` stored in GitHub Actions secrets (repo settings)
- [ ] `bash scripts/build-release.sh` produces `.deb`, `.AppImage`, and `.AppImage.sig`
- [ ] `bash scripts/generate-updater-manifest.sh` writes `latest.json`

## GitHub Release

1. Bump `version` in `soulcorp-desktop/package.json` and `src-tauri/tauri.conf.json`
2. Commit and tag: `git tag v1.0.1 && git push origin v1.0.1`
3. GitHub Actions `Release` workflow uploads:
   - `SoulCorp_*_amd64.deb` — manual install
   - `SoulCorp_*_amd64.AppImage` — portable Linux
   - `SoulCorp_*_amd64.AppImage.sig` — updater signature
   - `latest.json` — in-app updater manifest

## Beta tester instructions

```bash
# Install (Debian/Ubuntu)
sudo dpkg -i SoulCorp_1.0.0_amd64.deb

# Or portable
chmod +x SoulCorp_1.0.0_amd64.AppImage && ./SoulCorp_1.0.0_amd64.AppImage
```

In-app updates: **Settings → General → Check for updates**

## Post-release

- [ ] Verify `latest.json` URL responds: `https://github.com/yanshekki/SoulCorp/releases/latest/download/latest.json`
- [ ] Install previous build and confirm updater finds new version
- [ ] Announce release notes (CEO workflow, Autopilot, Observatory export)