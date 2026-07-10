# Agent Runtime & Universal Brain

**Last updated: July 2026**

## Overview

**Agent Brains** (CEO step 6) configures how each employee thinks and executes work. The **brain** module resolves AI providers and runtime backends through a cascade (agent → department → global). The **agent_runtime** module executes tasks via in-app LLM or external subprocess runtimes (e.g. OpenClaw).

---

## Implemented

| Feature | Status | Key paths |
|---------|--------|-----------|
| Provider resolution cascade | ✅ | `brain/resolver.rs` |
| Meeting vs execution providers | ✅ | `resolve_meeting_provider`, `resolve_execution_runtime` |
| Runtime catalog | ✅ | `agent_runtime/registry.rs` |
| LLM-only mode | ✅ | `AgentRuntimeMode::LlmOnly` |
| Subprocess mode | ✅ | `AgentRuntimeMode::Subprocess`, OpenClaw adapter |
| Runtime probe / test | ✅ | `probe_all_agent_runtimes`, `test_agent_runtime` |
| Per-agent runtime override | ✅ | `update_agent_runtime_mode` |
| Per-department runtime override | ✅ | `update_department_runtime_mode` |
| Agent tools (workspace) | ✅ | `scrum/agent_tools.rs`, `scrum_use_agent_tools` |
| SOUL.md load/save | ✅ | `load_agent_soul`, `update_agent_soul` |
| AI provider per agent/dept | ✅ | `update_agent_ai_provider`, `update_department_ai_provider` |
| Brain resolution preview | ✅ | `get_brain_resolution_preview` |
| Frontend Agents page | ✅ | `AgentsPage.tsx`, `AgentsPanel.tsx` |
| OpenClaw status | ✅ | `get_openclaw_status`, `test_openclaw_runtime` |
| Activity context on execute | ✅ | `ActivityRunContext` → Observatory |

---

## Architecture

### Resolution order

```mermaid
flowchart TD
  A[Agent override] -->|if unset| D[Department override]
  D -->|if unset| G[Global GameSettings]
  G --> P[Provider / runtime ID]
```

`BrainLayer` enum labels which level won for UI display.

### Runtime modes

| Mode | When | Execution path |
|------|------|----------------|
| LLM-only | Default cloud/local model | `ai/` provider call |
| Subprocess | OpenClaw etc. | `agent_runtime/adapters` spawn CLI |
| LLM + tools | `scrum_use_agent_tools` | `agent_workspace_*` commands in loop |

### Supported meeting providers

Resolved via `supported_meeting_provider_ids()` — includes Ollama, hub, and registry-mapped cloud IDs (`brain/resolver.rs`).

### Key commands

| Command | Purpose |
|---------|---------|
| `get_agent_runtime_catalog` | Available backends for UI |
| `get_agent_runtime_status` | Per-agent effective runtime |
| `get_brain_resolution_preview` | Show cascade result before save |
| `update_agent_soul` | Edit SOUL.md personality |

### Security

`agent_runtime/security.rs` constrains subprocess arguments and workspace paths for external runtimes.

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Docker-isolated agent sandboxes | Subprocess only; no container manager |
| Custom runtime plugins | Fixed adapter set |
| Per-task runtime override | Agent/dept/global only |
| Model fine-tune UI | Provider selection only |

---

## Related docs

- [AGENT_SYSTEM.md](AGENT_SYSTEM.md)
- [AGENT_SKILLS.md](AGENT_SKILLS.md) — capability packs (search, media, browser)
- [OBSERVATORY.md](OBSERVATORY.md)
- [PROJECTS_SCRUM.md](PROJECTS_SCRUM.md)
- [WORKSPACE_FOLDERS_TECH_SPEC.md](WORKSPACE_FOLDERS_TECH_SPEC.md)