# SoulCorp Desktop

**Last updated: July 2026**

Tauri 2.x desktop client — Rust backend + React 19 + TypeScript + Three.js.

## Overview

Run an AI company locally: **9-step CEO workflow** (Projects → Meeting → Workspace → Departments → Recruitment → Agent Brains → Observatory → Tokens → Marketplace), optional **Company Autopilot** with human gates, and full offline play.

## Features (implemented)

| Area | Highlights |
|------|------------|
| **Workflow** | CEO ribbon, command center, autopilot pipeline panel |
| **Projects** | Directives, sprints, scrum worker, parallel execution |
| **Meetings** | Multi-agent LLM meetings (Ollama / hub / cloud) |
| **Workspace** | TipTap editor, FTS search, six-view navigator, agent workspace API |
| **Agents** | SOUL.md, brain/runtime cascade, OpenClaw subprocess support |
| **Observatory** | Live agent sessions, mind stream, activity timeline |
| **Tokens** | Company pool, dept/agent wallets, usage ledger |
| **3D campus** | v2 edition — isometric office + interior design (optional in v1) |
| **Hub** | Gig lifecycle, NEAR tier upgrades (when configured) |
| **Export** | Backup, reports (MD/HTML/PDF), static site ZIP, Vercel/GitHub deploy |

## Development

```bash
pnpm install
pnpm verify
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri dev        # v1 workflow edition
pnpm dev:v2           # v2 with 3D campus
```

## Phase verification

From the SoulCorp repo root:

```bash
bash scripts/verify-phase.sh 22
```

## Local data

| Data | Location |
|------|----------|
| Game state | SQLite in Tauri app data dir (`rusqlite`) |
| Workspace | `workspaces/{companyId}/` markdown + files |
| Prisma schema | Tooling mirror only — not runtime DB |

## Documentation

Full specs: [`../docs/INDEX.md`](../docs/INDEX.md)

Key docs: [Architecture](../docs/ARCHITECTURE_OVERVIEW.md) · [Autopilot](../docs/COMPANY_AUTOPILOT.md) · [Performance](../docs/PERFORMANCE.md)

## Editions

| Command | Edition |
|---------|---------|
| `pnpm dev` / `pnpm build` | v1 — workflow-first |
| `pnpm dev:v2` / `pnpm build:v2` | v2 — campus + design studio + god mode |