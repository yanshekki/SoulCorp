# Recruitment & HR

**Last updated: July 2026**

## Overview

**Recruitment** (CEO step 5) is an HR hire desk: browse **real hub candidates** (or create a **custom hire** offline), choose **department + role**, pick or edit **soul.md**, then confirm. Hiring triggers **workspace org folder sync** and updates payroll projections. Pro/VIP tier language is not shown on this page (v1 product surface).

---

## Implemented

| Feature | Status | Key paths |
|---------|--------|-----------|
| List candidates | ✅ | `list_recruitment_candidates` |
| Fetch candidate SOUL | ✅ | `fetch_recruitment_candidate_soul` |
| Record interview | ✅ | `record_recruitment_interview` |
| Hire candidate | ✅ | `hire_candidate`, `commands/recruitment.rs` |
| Hire desk (dept + soul.md) | ✅ | `RecruitmentPanel.tsx`, `RecruitAgentDetailPanel` |
| Custom hire (HR self-hire) | ✅ | `buildCustomHireCandidate`, hire desk |
| Local starter candidates (offline / pure local) | ✅ | `local_seed_candidates` in `recruitment.rs` |
| Hire `display_name` | ✅ | `HireCandidateRequest.display_name` |
| Department soul templates | ✅ | `utils/departmentSoulTemplates.ts` |
| Recruitment analytics | ✅ | `get_recruitment_analytics` (no Pro/VIP gating UI) |
| Relationship graph | ✅ | `get_agent_relationship_graph` |
| Org folder sync on hire | ✅ | `sync_workspace_organization_cmd` |
| Auto-recruit (V1 ops) | ✅ | `operations/auto_recruit.rs` |
| God mode perfect hiring | ✅ | `god_mode_perfect_hiring` |
| Frontend Recruitment page | ✅ | `RecruitmentPage.tsx`, picker components |
| Candidate search/tags | ✅ | `data/recruitmentSearchTags.ts` |

---

## Architecture

### Hire flow

```mermaid
flowchart LR
  C[Candidate pool / Custom hire] --> D[Hire desk]
  D --> Soul[Dept template or hub soul.md]
  Soul --> H[hire_candidate]
  H --> A[AgentRecord created]
  H --> S[sync_workspace_organization_cmd]
  S --> W[Dept folders in workspace]
```

### Post-hire side effects

- Agent added to `AppState.agents` with department and salary
- Workspace folders created/updated under company root
- Token wallets initialized via `token_budget` bootstrap
- Relationship edges seeded for graph UI

### Analytics

`get_recruitment_analytics` returns funnel stats (team size, hires, interviews, skill gaps, compatibility scores). `priority_matching` is retained for serde compatibility but is not used in the UI.

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Hub marketplace candidate streaming | Local list + manual fetch |
| Interview LLM scoring rubric | Record notes only |
| Offer negotiation minigame | Fixed salary on hire |
| HR department automation policies | Auto-recruit basic rules only |

---

## Related docs

- [AGENT_SYSTEM.md](AGENT_SYSTEM.md)
- [WORKSPACE_FOLDERS_SYSTEM.md](WORKSPACE_FOLDERS_SYSTEM.md)
- [FINANCE_BUDGET.md](FINANCE_BUDGET.md)
- [GOD_MODE.md](GOD_MODE.md)