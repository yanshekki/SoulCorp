SoulCorp

**AI Company Simulator** — Build and manage a company of intelligent AI agents in a beautiful isometric world.

Local-first architecture with optional marketplace and cloud features via soulmd-hub.

## Project Layout

- `docs/` — specification documents
- `soulcorp-desktop/` — Tauri 2.x desktop application
- `hub/soulmd-hub/` — soulmd-hub git submodule (Phase 5 integration)
- `.automation/phase-state.json` — automated phase orchestration state
- `scripts/` — phase verification and merge helpers

## Development

```bash
cd soulcorp-desktop
pnpm install
pnpm verify
pnpm tauri dev
```

Phase automation helpers:

```bash
./scripts/verify-phase.sh 0
./scripts/merge-phase.sh 0
```

## Documentation

All specifications are in the `docs/` folder.