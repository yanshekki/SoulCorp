# SoulCorp Desktop

Tauri 2.x desktop client for SoulCorp — Rust backend + React 19 + TypeScript + Three.js.

## Features

- Isometric 3D office with instanced agent rendering and building zoom
- Agent simulation: morale, finance, meetings (Ollama / hub LLM), random events, god mode
- Notion-like workspace (TipTap editor, folders, search, entity links, per-agent folders)
- Marketplace gig lifecycle with QC review and dispute flow
- Pro / VIP tiers, NEAR wallet upgrades, executive lounge, AI Co-CEO
- Export: backup JSON, reports (MD/HTML/PDF), static site ZIP, QC-rated deliverables
- One-click deploy to GitHub and Vercel from Settings

## Development

```bash
pnpm install
pnpm verify
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri dev
```

## Phase verification

From the repo root:

```bash
bash scripts/verify-phase.sh 18
```

## Local data

- Game state: SQLite via `rusqlite` in the Tauri app data directory
- Workspace pages: markdown + JSON under `workspaces/`
- Prisma schema (`prisma/schema.prisma`) mirrors core tables for tooling only