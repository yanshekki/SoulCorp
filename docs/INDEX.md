# SoulCorp Documentation Index

**Final Recommended Document Set (June 2026)**

This index lists all the core specification documents for the SoulCorp project.  
These files are considered sufficient, clear, and well-structured for direct use with Grok Build or future development.

---

## 1. Project Overview & Vision

| File | Purpose |
|------|---------|
| `README.md` | High-level project overview, vision, goals, and current status |
| `VISUAL_STYLE_OPTION2.md` | Detailed description of the chosen isometric visual style (Stardew Valley × Pokémon Legends) |

---

## 2. Core Technical Architecture

| File | Purpose |
|------|---------|
| `TECH_STACK_FINAL.md` | Final locked technology stack for both Desktop (Tauri) and Platform Hub |
| `TAURI_DESKTOP_SPEC.md` | Detailed technical specification for the Tauri 2.x desktop client (Rust backend + React + Three.js) |
| `SOULMD_HUB_EXTENSION_PLAN.md` | Plan for extending the existing soulmd-hub repository (PHP + MySQL + NEAR) |
| `NEW_API_ENDPOINTS_FOR_HUB.md` | New REST API endpoints required in soulmd-hub for marketplace, sync, and economy features |

---

## 3. In-Game Systems (Detailed Specs)

| File | Purpose |
|------|---------|
| `AGENT_SYSTEM.md` | How AI employees work, their personality system (SOUL.md), daily behavior, and hiring flow |
| `MEETING_SYSTEM.md` | Fully observable multi-agent meeting system and its impact on gameplay |
| `RECRUITMENT_HR.md` | HR department and recruitment process integrated with soulmd-hub marketplace |
| `RANDOM_EVENTS.md` | Random events & drama system, including the important toggle for Serious Work Mode |
| `PRO_VIP_SYSTEM.md` | Pro and VIP tier benefits, requirements, and economic balance |
| `FINANCE_BUDGET.md` | Internal company finance, budgeting, agent salaries, and strategic allocation |
| `GOD_MODE.md` | Player (CEO) intervention powers and their design philosophy |
| `ACHIEVEMENTS.md` | Achievement system and multiple long-term endings |
| `OFFLINE_FIRST_SYNC.md` | Offline-first architecture and user-controlled cloud sync design |

---

## 4. Advanced Features (Notion-like Workspace & Folders)

| File | Purpose |
|------|---------|
| `NOTION_LIKE_SYSTEM.md` | High-level design of the built-in Notion-style document and progress system |
| `NOTION_LIKE_UI_DATA_SYNC.md` | Detailed UI design, data model, and real-time sync logic for the Notion-like system |
| `WORKSPACE_FOLDERS_SYSTEM.md` | High-level design of per-agent and user workspace folder system |
| `WORKSPACE_FOLDERS_TECH_SPEC.md` | Technical specification for folder structure, permissions, agent autonomy, and storage |

---

## How to Use This Documentation

- Start with `README.md` + `TECH_STACK_FINAL.md` to understand the overall vision and technology.
- Refer to the specific system files (e.g. `AGENT_SYSTEM.md`, `MEETING_SYSTEM.md`) when implementing individual features.
- The advanced workspace documents (`NOTION_LIKE_*` and `WORKSPACE_FOLDERS_*`) are critical for the productivity layer of the application.
- All documents are written to be clear and actionable for AI-assisted development (Grok Build).

---

**This set of 19 documents represents the current recommended foundation for building SoulCorp.**
