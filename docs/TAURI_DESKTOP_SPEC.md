# Tauri Desktop Client Specification

**Last updated: July 2026**

## Overview

`soulcorp-desktop/` is the primary SoulCorp product: a Tauri 2 application with a Rust command layer and React SPA. The app supports **v1** (workflow-focused) and **v2** (3D campus + creative tools) editions from one codebase.

---

## Implemented

| Feature | Status | Key paths |
|---------|--------|-----------|
| App bootstrap + SQLite init | ✅ | `lib.rs` setup, `db::init_database` |
| Multi-company registry | ✅ | `list_companies`, `create_company`, `switch_company` |
| Onboarding wizard | ✅ | `OnboardingWizard.tsx`, `complete_onboarding` |
| Sidebar + CEO ribbon | ✅ | `navigation.ts`, `CollapsibleDock` |
| Lazy panel host (LRU 6) | ✅ | `PanelHost.tsx`, `lazyPanels.ts` |
| 3D office (v2 / optional v1) | ✅ | `GameScene`, `ThreeOfficeRenderer` |
| 100+ Tauri commands | ✅ | `lib.rs` invoke_handler |
| Window state persistence | ✅ | `tauri-plugin-window-state` |
| Smoke watchdog | ✅ | `commands::spawn_smoke_watchdog` |
| Scrum background worker | ✅ | `scrum::spawn_scrum_worker` |
| Edition gating | ✅ | `config/features.ts` (`showOffice3D`, `showGodMode`, etc.) |
| Acceptance scripts | ✅ | `src/acceptance/`, `scripts/acceptance-check.mjs` |

---

## Project structure

```
soulcorp-desktop/
├── src/                    # React frontend
│   ├── App.tsx             # Shell, nav, panel routing
│   ├── config/
│   │   ├── navigation.ts   # CEO_WORKFLOW_CHAIN, nav groups
│   │   ├── lazyPanels.ts   # React.lazy panel map
│   │   └── features.ts     # Edition feature flags
│   ├── components/
│   │   ├── UI/             # Pages: Projects, Meeting, Tokens, …
│   │   ├── workspace/      # WorkspaceShell, editors, navigator
│   │   └── design/         # Design studio (v2)
│   ├── services/           # Tauri invoke clients
│   └── stores/             # Zustand state
├── src-tauri/
│   └── src/
│       ├── commands/       # Tauri command handlers (grouped)
│       ├── autopilot/      # Company autopilot
│       ├── scrum/          # Projects pipeline
│       ├── workspace/      # Pages, FTS, cache
│       ├── agent_runtime/  # Execution backends
│       ├── brain/          # Provider resolution
│       ├── token_budget/   # Token economy
│       └── db/             # rusqlite persistence
└── prisma/                 # Tooling schema mirror
```

---

## Command groups (representative)

Commands are registered in `lib.rs`. Grouped by domain:

| Domain | Examples |
|--------|----------|
| **Company** | `create_company`, `switch_company`, `get_onboarding_state` |
| **Agents** | `list_agents`, `update_agent_soul`, `get_agent_runtime_status` |
| **Scrum** | `issue_directive`, `route_directive`, `run_work_execution`, `get_scrum_snapshot` |
| **Autopilot** | `get_autopilot_snapshot`, `ceo_approve_directive_cmd`, `set_full_autopilot` |
| **Meeting** | `start_meeting`, `advance_meeting`, `generate_meeting_notes` |
| **Workspace** | `list_workspace_snapshot`, `get_workspace_page`, `search_workspace` |
| **Agent workspace** | `agent_workspace_read_page`, `agent_workspace_write_deliverable` |
| **Tokens** | `get_token_economy`, `allocate_department_tokens_cmd`, `rebalance_token_wallets_cmd` |
| **Recruitment** | `hire_candidate`, `sync_workspace_organization_cmd` |
| **Hub / gigs** | `list_hub_gigs`, `accept_hub_gig`, `complete_hub_gig` |
| **God mode** | `god_mode_time_warp`, `god_mode_mass_motivation`, … |
| **Export / deploy** | `export_company_backup`, `push_static_site_to_vercel` |

Async handlers use `tokio::task::spawn_blocking` for disk/CPU-heavy workspace and export work.

---

## Editions

| Flag | v1 | v2 |
|------|----|----|
| `PRODUCT_EDITION` | `v1` (default) | `v2` |
| 3D campus | Optional (`showOffice3D`) | On |
| Design studio | Off | On |
| God mode in ribbon | Off | On |
| CEO workflow panels | All 9 steps | All 9 + campus |

Dev commands:

```bash
pnpm dev          # v1
pnpm dev:v2       # v2 with campus
pnpm verify       # typecheck + production build (v1)
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

---

## Local data layout

| Data | Storage |
|------|---------|
| Game state | SQLite in Tauri app data dir (`rusqlite`) |
| Workspace pages | `workspaces/{companyId}/` markdown + JSON metadata |
| Exports | User-accessible exports folder (`open_exports_folder`) |
| Window geometry | Plugin state file |

No mock or auto-seeded agents at startup — companies start empty after onboarding.

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Command API versioning | Breaking changes handled ad hoc; no `/v2` command namespace |
| Plugin auto-update | ✅ Settings → Check for updates; signed via `TAURI_SIGNING_PRIVATE_KEY` |
| iOS/Android Tauri mobile | Scaffold exists (`mobile_entry_point`); not shipped |
| Unified OpenAPI for commands | Tauri invoke only; no HTTP surface |

---

## Related docs

- [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)
- [PERFORMANCE.md](PERFORMANCE.md)
- [NOTION_LIKE_UI_DATA_SYNC.md](NOTION_LIKE_UI_DATA_SYNC.md)
- [COMPANY_AUTOPILOT.md](COMPANY_AUTOPILOT.md)