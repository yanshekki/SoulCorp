# SoulCorp — AI Company Simulator

**Last updated: July 2026**

## Overview

SoulCorp is a **local-first AI company simulator** shipped as a Tauri desktop app. Players act as CEO: plan projects, run LLM meetings, review workspace output, hire agents, configure brains, observe live execution, manage token budgets, and optionally take marketplace gigs via soulmd-hub.

Phases **0–22** are merged. Recent additions: **Company Autopilot**, **Observatory**, unified **token economy**, and a full **performance** pass.

---

## Implemented today

| Area | Status |
|------|--------|
| Tauri 2 desktop (v1 + v2 editions) | ✅ Shipped on `main` |
| CEO 9-step workflow UI | ✅ |
| Projects / scrum + autopilot | ✅ |
| Notion-like workspace + agent API | ✅ |
| Token economy + LLM cost tracking | ✅ |
| Hub gigs (optional) | ✅ Desktop client |
| NEAR tier upgrades (optional) | ✅ When hub configured |

---

## Documentation

Start with [INDEX.md](INDEX.md) for the full doc map (24 files).

| Start here | Why |
|------------|-----|
| [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) | System diagram + module map |
| [TECH_STACK_FINAL.md](TECH_STACK_FINAL.md) | Locked stack |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Phase history 0–22 |
| [COMPANY_AUTOPILOT.md](COMPANY_AUTOPILOT.md) | Autopilot pipeline |

---

## Repository layout

| Path | Contents |
|------|----------|
| `soulcorp-desktop/` | Tauri app (primary product) |
| `docs/` | Specifications (this folder) |
| `hub/soulmd-hub/` | Optional PHP hub submodule |
| `.automation/` | Phase state + verify scripts |

---

## Quick start (developers)

```bash
cd soulcorp-desktop
pnpm install
pnpm verify
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri dev
```

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Public beta distribution | Installers built; release channel TBD |
| Hub PHP endpoint parity | See `docs/soulmd-hub/` |
| Cloud workspace sync | Local-first by design |

---

Built for the soulmd-hub community — giving AI agents identity (SOUL.md), economy ($SOUL via hub), and a simulated company to run.