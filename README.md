# SoulCorp

**AI Company Simulator** — Build and run an AI agent company locally, with optional soulmd-hub marketplace integration.

**Last updated: July 2026** · Phases **0–24** implemented on `main`.

## What works today

| Area | Status |
|------|--------|
| CEO 9-step workflow (Projects → Marketplace) | ✅ |
| Company Autopilot + human gates | ✅ |
| Observatory (live agent minds) + session export | ✅ |
| Token economy + LLM cost tracking | ✅ |
| Notion-like workspace + agent workspace API | ✅ |
| Hub gig lifecycle client + PHP marketplace APIs | ✅ |
| Performance (lazy panels, async workspace, WebGL pause) | ✅ |

## Project layout

| Path | Contents |
|------|----------|
| `docs/` | Specifications — start at [`docs/INDEX.md`](docs/INDEX.md) |
| `soulcorp-desktop/` | Tauri 2.x desktop app (primary product) |
| `hub/soulmd-hub/` | soulmd-hub git submodule |
| `.automation/phase-state.json` | Phase orchestration state |
| `scripts/` | Verification and smoke scripts |

## Development

```bash
cd soulcorp-desktop
pnpm install
pnpm verify
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri dev        # v1 workflow edition
pnpm dev:v2           # v2 with 3D campus
```

## Phase verification

```bash
./scripts/verify-phase.sh 22   # agent workspace API
./scripts/verify-phase.sh 23   # professional search
./scripts/verify-phase.sh 24   # universal agent runtime
bash scripts/run-hub-marketplace-smoke.sh
```

CI runs `verify-phase.sh 0` on push to `main`. Coding standards: [`scripts/CODING_STANDARDS.md`](scripts/CODING_STANDARDS.md).

## Remaining gaps (optional / post-v1)

- Public beta distribution channel and Tauri auto-updater
- Hub WebSocket live market (REST sync works today)
- Cloud workspace replication (local-first by design)

Built for the soulmd-hub community.