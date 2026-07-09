# God Mode

**Last updated: July 2026**

## Overview

God Mode gives the CEO **sandbox intervention powers** for experimentation and recovery. Available in **v2** edition (feature flag `showGodMode`). Each power is invoked via Tauri commands, logged to history, and may consume tokens or affect simulation state.

---

## Implemented

| Power | Status | Command |
|-------|--------|---------|
| Time warp | ✅ | `god_mode_time_warp` |
| Mass motivation | ✅ | `god_mode_mass_motivation` |
| Emergency budget | ✅ | `god_mode_emergency_budget` |
| Divine inspiration | ✅ | `god_mode_divine_inspiration` |
| Black swan event | ✅ | `god_mode_black_swan` |
| Agent mutation | ✅ | `god_mode_agent_mutation` |
| Reality edit | ✅ | `god_mode_reality_edit` |
| Perfect hiring | ✅ | `god_mode_perfect_hiring` |
| Total chaos | ✅ | `god_mode_total_chaos` |
| Reset agent memory | ✅ | `god_mode_reset_agent_memory` |
| Force relationship | ✅ | `god_mode_force_relationship` |
| Status + history | ✅ | `get_god_mode_status`, `get_god_mode_history` |
| Frontend page | ✅ | `GodModePage.tsx` (v2 ribbon) |

**Key paths:** `commands/god_mode.rs`, `stores/gameStore.ts`

---

## Architecture

God mode actions mutate `AppState` directly (agents, finance, events, relationships) and append to `god_mode_history` for audit. Powers respect current play mode where relevant — e.g. chaos events may be suppressed in Serious Work Mode.

### Design intent

- **Recovery**: fix broken runs (budget, morale, hiring)
- **Experimentation**: mutate agents / reality without replaying days
- **Drama**: black swan and total chaos for game mode players

Not required for normal CEO workflow or autopilot operation.

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| God mode in v1 edition | Flag off by default |
| Undo last god action | History view only; no rollback |
| Cooldown / cost balancing | Partial token costs on some powers |
| Multiplayer sync | Local state only |

---

## Related docs

- [RANDOM_EVENTS.md](RANDOM_EVENTS.md)
- [AGENT_SYSTEM.md](AGENT_SYSTEM.md)
- [FINANCE_BUDGET.md](FINANCE_BUDGET.md)
- [PRO_VIP_SYSTEM.md](PRO_VIP_SYSTEM.md)