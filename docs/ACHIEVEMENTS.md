# Achievements & Endings

**Last updated: July 2026**

## Overview

Achievements track long-term company milestones; **endings** define narrative victory conditions. Defaults are seeded on first launch if empty. The Achievements page is available in v2 (and when `showAchievements` is enabled).

---

## Implemented

| Feature | Status | Key paths |
|---------|--------|-----------|
| Default achievement set | ✅ | `achievements::default_achievements` |
| Default endings set | ✅ | `achievements::default_endings` |
| Progress tracking in state | ✅ | `state.achievements`, `state.endings` |
| Query API | ✅ | `get_achievements` |
| Frontend page | ✅ | `AchievementsPage.tsx` |
| Simulation tick hooks | ✅ | Achievement checks during `run_simulation_tick` |

---

## Architecture

Each achievement/ending record typically includes:

| Field | Role |
|-------|------|
| `id` | Stable key |
| `title`, `description` | UI copy |
| `unlocked` / `progress` | Player state |
| `category` | Grouping in UI |

Unlock conditions are evaluated in Rust against live `AppState` (company metrics, agent counts, gig completions, etc.).

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Steam / platform achievements | Local only |
| Custom mod achievements | Fixed default set |
| Ending cinematic sequences | Text unlock notification |
| Achievement-linked rewards | Cosmetic / narrative only today |

---

## Related docs

- [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)
- [EXPORT_REAL_PRODUCTS.md](EXPORT_REAL_PRODUCTS.md)
- [PRO_VIP_SYSTEM.md](PRO_VIP_SYSTEM.md)