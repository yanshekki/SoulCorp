# SoulCorp Documentation Index

**Last updated: July 2026**

This index lists the specification documents for SoulCorp. Each file uses a **hybrid format**: overview, what is implemented in code today, architecture notes, and remaining gaps.

**Source of truth:** `soulcorp-desktop/` Rust modules (`src-tauri/src/lib.rs`) and React frontend (`src/`). Phase history: `.automation/phase-state.json` (phases 0–22 merged).

---

## 1. Project Overview & Vision

| File | Purpose |
|------|---------|
| [README.md](README.md) | High-level project overview and how to use this doc set |
| [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) | Local-first architecture, module map, CEO 9-step workflow |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Phases 0–22 (merged) and post-phase work |
| [VISUAL_STYLE_OPTION2.md](VISUAL_STYLE_OPTION2.md) | Campus/world isometric visual style |
| `soulcorp-desktop/docs/OFFICE_VISUAL_TARGET.md` | Interior office style (Sims × Two Point Hospital) |

---

## 2. Core Technical Architecture

| File | Purpose |
|------|---------|
| [TECH_STACK_FINAL.md](TECH_STACK_FINAL.md) | Locked stack: Tauri 2, Rust, React 19, Three.js, rusqlite |
| [TAURI_DESKTOP_SPEC.md](TAURI_DESKTOP_SPEC.md) | Desktop client structure, commands, editions (v1/v2) |
| [PERFORMANCE.md](PERFORMANCE.md) | Lazy panels, async workspace I/O, WebGL pause, caching |
| [OFFLINE_FIRST_SYNC.md](OFFLINE_FIRST_SYNC.md) | Offline-first persistence and optional hub sync |
| [soulmd-hub/SOULMD_HUB_EXTENSION_PLAN.md](soulmd-hub/SOULMD_HUB_EXTENSION_PLAN.md) | Optional hub extension plan |
| [soulmd-hub/NEW_API_ENDPOINTS_FOR_HUB.md](soulmd-hub/NEW_API_ENDPOINTS_FOR_HUB.md) | Hub REST endpoints for marketplace and sync |

---

## 3. Company Operations (CEO Workflow)

Nine-step ribbon defined in `soulcorp-desktop/src/config/navigation.ts`:

| Step | Panel | Doc |
|------|-------|-----|
| 1 | Projects | [PROJECTS_SCRUM.md](PROJECTS_SCRUM.md) |
| 2 | Meeting | [MEETING_SYSTEM.md](MEETING_SYSTEM.md) |
| 3 | Workspace | [NOTION_LIKE_SYSTEM.md](NOTION_LIKE_SYSTEM.md) |
| 4 | Departments | [AGENT_SYSTEM.md](AGENT_SYSTEM.md) |
| 5 | Recruitment | [RECRUITMENT_HR.md](RECRUITMENT_HR.md) |
| 6 | Agent Brains | [AGENT_RUNTIME.md](AGENT_RUNTIME.md), [AGENT_SKILLS.md](AGENT_SKILLS.md) |
| 7 | Observatory | [OBSERVATORY.md](OBSERVATORY.md) |
| 8 | Tokens | [FINANCE_BUDGET.md](FINANCE_BUDGET.md) |
| 9 | Marketplace | [EXPORT_REAL_PRODUCTS.md](EXPORT_REAL_PRODUCTS.md) |

| File | Purpose |
|------|---------|
| [COMPANY_AUTOPILOT.md](COMPANY_AUTOPILOT.md) | Full-company autopilot pipeline, gates, interventions |
| [AGENT_SYSTEM.md](AGENT_SYSTEM.md) | Agents, SOUL.md, departments, Co-CEO, brain resolution |
| [AGENT_SKILLS.md](AGENT_SKILLS.md) | Skill packs (web search, media, browser) — OpenClaw/Hermes style |

---

## 4. In-Game Systems

| File | Purpose |
|------|---------|
| [MEETING_SYSTEM.md](MEETING_SYSTEM.md) | Observable multi-agent LLM meetings |
| [RECRUITMENT_HR.md](RECRUITMENT_HR.md) | Hiring, interviews, relationship graph |
| [FINANCE_BUDGET.md](FINANCE_BUDGET.md) | Token economy (company / dept / agent wallets) |
| [RANDOM_EVENTS.md](RANDOM_EVENTS.md) | Random events and Serious Work Mode |
| [GOD_MODE.md](GOD_MODE.md) | CEO intervention powers |
| [ACHIEVEMENTS.md](ACHIEVEMENTS.md) | Achievements and long-term endings |
| [PRO_VIP_SYSTEM.md](PRO_VIP_SYSTEM.md) | Pro/VIP tiers, NEAR upgrades, executive features |

---

## 5. Workspace & Productivity Layer

| File | Purpose |
|------|---------|
| [NOTION_LIKE_SYSTEM.md](NOTION_LIKE_SYSTEM.md) | Workspace UX 2.0: six-view navigator, command palette |
| [NOTION_LIKE_UI_DATA_SYNC.md](NOTION_LIKE_UI_DATA_SYNC.md) | Page model, FTS search, lazy snapshot APIs |
| [WORKSPACE_FOLDERS_SYSTEM.md](WORKSPACE_FOLDERS_SYSTEM.md) | Per-agent and org folder layout |
| [WORKSPACE_FOLDERS_TECH_SPEC.md](WORKSPACE_FOLDERS_TECH_SPEC.md) | Storage, permissions, agent workspace API |
| [EXPORT_REAL_PRODUCTS.md](EXPORT_REAL_PRODUCTS.md) | Exports, static site, gig deliverables, deploy |

---

## How to Use This Documentation

1. Start with **ARCHITECTURE_OVERVIEW** + **TECH_STACK_FINAL** for the big picture.
2. Follow the **CEO workflow** table when implementing or testing end-to-end company runs.
3. Check **Implemented** sections in each doc against `src-tauri/src/` and `src/` before assuming a feature exists.
4. Run `pnpm verify` and `cargo test --manifest-path soulcorp-desktop/src-tauri/Cargo.toml --lib` from `soulcorp-desktop/`.

---

**24 core documents** (19 updated specs + 5 new feature docs). Hub extension docs are optional integration references.