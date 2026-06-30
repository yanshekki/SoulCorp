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

Phase verification (0–18):

```bash
./scripts/verify-phase.sh 18
```

Phase automation state lives in `.automation/phase-state.json`. Coding standards: `scripts/CODING_STANDARDS.md`. CI runs `verify-phase.sh 0` on push to `main`.

## Documentation

All specifications are in the `docs/` folder.