# SoulCorp Official Technology Stack

**Last updated: July 2026**

## Overview

SoulCorp ships as a **Tauri 2** desktop app with a **Rust** simulation backend and **React 19** frontend. All company logic, AI calls, workspace storage, and token accounting run locally. Optional **soulmd-hub** adds marketplace and NEAR wallet features.

Two product editions are built from the same codebase: **v1** (workflow-first, optional 3D campus) and **v2** (full campus, design studio, god mode ribbon).

---

## Implemented

| Layer | Choice | Status | Key paths |
|-------|--------|--------|-----------|
| Desktop shell | Tauri 2.x | ✅ | `src-tauri/`, plugins: opener, dialog, window-state |
| Backend | Rust 2021 | ✅ | `src-tauri/src/lib.rs` (~100+ invoke commands) |
| Async runtime | tokio + spawn_blocking | ✅ | `commands/workspace.rs`, `meeting.rs`, `export.rs` |
| Game DB | rusqlite (bundled) | ✅ | `db/persistence.rs` — primary persistence |
| Tooling schema | Prisma + SQLite | ✅ | `prisma/schema.prisma` — dev/tooling mirror only |
| Frontend | React 19 + Vite 6 + TS | ✅ | `src/`, strict `pnpm typecheck` |
| 3D | Three.js + R3F + drei | ✅ | `GameScene`, `ThreeOfficeRenderer` |
| Rich text | TipTap 3 (lazy-loaded) | ✅ | `SoulMdEditor`, `workspace-editor.css` |
| State | Zustand stores | ✅ | `gameStore`, `workspaceStore`, `agentActivityStore` |
| Virtual lists | @tanstack/react-virtual | ✅ | Workspace lists, backlog trees |
| AI providers | reqwest + local Ollama | ✅ | `ai/`, `brain/resolver.rs` |
| Agent subprocess | OpenClaw adapter | ✅ | `agent_runtime/openclaw.rs` |
| NEAR wallet | @near-wallet-selector | ✅ | `services/nearWallet.ts`, VIP upgrade flow |
| PDF export | printpdf (Rust) | ✅ | `commands/export.rs` |
| Editions | v1 / v2 feature flags | ✅ | `PRODUCT_EDITION` env, `config/features.ts` |
| CI verify | typecheck + vite build | ✅ | `pnpm verify` |
| Rust tests | cargo test --lib | ✅ | 100+ tests across scrum, autopilot, workspace |

---

## Architecture notes

### Desktop client

```
Tauri 2.x
├── Rust backend
│   ├── rusqlite — companies, agents, scrum, token economy
│   ├── filesystem — workspace markdown + attachments
│   ├── tokio — async command handlers
│   └── rayon — parallel work where needed
└── React 19 frontend
    ├── Vite — manualChunks (vendor, three, tiptap)
    ├── React.lazy — all sidebar panels
    ├── Three.js — isometric campus + interior rooms
    └── TipTap — workspace page editor (code-split)
```

### AI & agent execution

| Mode | Description |
|------|-------------|
| **LLM-only** | In-process provider call (Ollama, hub `/api/chat`, etc.) |
| **Subprocess** | External runtime (e.g. OpenClaw) via `agent_runtime` adapters |
| **Agent tools** | Workspace read/write/search when `scrum_use_agent_tools` enabled |

Brain resolution order: agent override → department override → global settings (`brain/resolver.rs`).

### Platform hub (optional)

| Component | Stack |
|-----------|-------|
| Base | PHP 8 + MySQL + NEAR (existing soulmd-hub repo) |
| Desktop client | `hub/`, `gigs/` modules, sync commands |
| Economy | $SOUL balance fetch, NEAR tier upgrade, gig lifecycle |

Hub is **not required** for offline play. See `docs/soulmd-hub/`.

### Visual

| Scope | Style |
|-------|-------|
| Campus / world | Option 2 — Stardew × Pokémon Legends isometric (`VISUAL_STYLE_OPTION2.md`) |
| Interior offices | Sims × Two Point Hospital (`soulcorp-desktop/docs/OFFICE_VISUAL_TARGET.md`) |
| Default interior theme | `StartupWarm` |

### Distribution

- Native bundles via `pnpm tauri build` (.deb, .AppImage, etc.)
- Window state persisted (size/position, not maximized) via `tauri-plugin-window-state`
- Headless 3D smoke test (xvfb) for CI — phase 7

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Tauri auto-updater | Not wired in production builds yet |
| Docker-packaged local agents | OpenClaw path exists; no bundled Docker images |
| Prisma as runtime DB | Intentionally not used — rusqlite is canonical |
| WebSocket hub live market | REST polling only from desktop |
| BullMQ / IndexedDB queue | Described in early docs; actual queue is Rust-side scrum worker |

---

## Related docs

- [TAURI_DESKTOP_SPEC.md](TAURI_DESKTOP_SPEC.md)
- [PERFORMANCE.md](PERFORMANCE.md)
- [AGENT_RUNTIME.md](AGENT_RUNTIME.md)
- [OFFLINE_FIRST_SYNC.md](OFFLINE_FIRST_SYNC.md)