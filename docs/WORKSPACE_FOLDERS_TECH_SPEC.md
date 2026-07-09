# Workspace Folders — Technical Specification

**Last updated: July 2026**

## Overview

Technical details for workspace storage, Tauri commands, agent-scoped APIs, and deliverable linking. Agents interact through **`agent_workspace_*`** commands; the CEO UI uses the full **`workspace_*`** command set.

---

## Implemented

| Feature | Status | Key paths |
|---------|--------|-----------|
| WorkspaceStorage | ✅ | `workspace/storage.rs` |
| Page parse / serialize | ✅ | Markdown + JSON metadata |
| FTS index maintenance | ✅ | `workspace/index.rs` |
| CEO commands (full access) | ✅ | `lib.rs` workspace group |
| Agent list folder | ✅ | `agent_workspace_list_folder` |
| Agent read/search | ✅ | `agent_workspace_read_page`, `agent_workspace_search` |
| Agent write deliverable | ✅ | `agent_workspace_write_deliverable` |
| Agent append journal | ✅ | `agent_workspace_append_journal` |
| Agent create/append page | ✅ | `agent_workspace_create_page`, `agent_workspace_append_page` |
| Agent context bundle | ✅ | `agent_workspace_get_context` |
| Activity listing | ✅ | `agent_workspace_list_activity`, `list_agent_activity` |
| Deliverable deep links | ✅ | Phase 22 — links in scrum runs |
| Activity feed UI | ✅ | `AgentWorkspaceActivityFeed.tsx` |
| Client wrappers | ✅ | `agentWorkspaceClient.ts` |

---

## Architecture

### Command tiers

| Tier | Caller | Scope |
|------|--------|-------|
| Full workspace | CEO UI | All folders CRUD |
| Agent workspace | Scrum executor / tools | Agent + assigned task paths |
| Read-only resolve | Backlinks, search | Company-wide index |

### Agent tool loop

When `scrum_use_agent_tools` is enabled, `scrum/agent_tools.rs` calls agent workspace commands in an LLM tool-use loop with `ActivityRunContext` for Observatory.

### Deliverable path

```
run_work_execution
  → agent_runtime::execute_for_task
  → agent_workspace_write_deliverable
  → work node status InReview
  → autopilot deliverable gate (optional)
```

### Security notes

- Agent commands validate agent ID and task assignment
- Subprocess runtimes use `agent_runtime/security.rs` path rules
- No arbitrary filesystem escape outside company workspace root

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Signed agent API tokens | In-process Tauri only |
| Folder quota enforcement | Token budget indirect limit |
| Virus scan on import | User-trusted local import |

---

## Related docs

- [WORKSPACE_FOLDERS_SYSTEM.md](WORKSPACE_FOLDERS_SYSTEM.md)
- [AGENT_RUNTIME.md](AGENT_RUNTIME.md)
- [PROJECTS_SCRUM.md](PROJECTS_SCRUM.md)