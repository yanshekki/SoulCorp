# Agent Skills

**Last updated: July 2026**

## Overview

Agent **Skills** are capability packs (OpenClaw / Hermes–style `SKILL.md`) that agents can invoke while executing work. They are **not** the same as recruitment skill tags (`AgentRecord.skills` = Coding, Design…).

| Concept | Purpose |
|---------|---------|
| HR tags (`skills[]`) | Hiring / matchmaking |
| Skill packs | Runtime tools: search, media, browser, ops |

---

## Implemented

| Feature | Status | Path |
|---------|--------|------|
| Built-in catalog (20 packs) | ✅ | `src-tauri/resources/skills/*/SKILL.md` |
| Frontmatter parser | ✅ | `skills/catalog.rs` |
| Risk policy defaults | ✅ | low/medium **on**; high/critical **off** |
| Tool protocol parse | ✅ | `skills/protocol.rs` |
| Dispatcher + adapters | ✅ | workspace, http (DDG/Wiki + fetch), media files, browser dry-run |
| Skill tool loop | ✅ | `scrum/agent_tools.rs` when packs enabled; fallback plan/draft/refine |
| OpenClaw/Hermes bridge | ✅ | skill catalog injected into subprocess task prompts |
| Tauri commands | ✅ | `list_skill_catalog`, `get_skill_pack`, `dispatch_skill_tool`, … |
| Agents UI catalog | ✅ | Agents → **Skills** section |

**Partial / gated:** live image/video providers (local prompt/job files); Playwright browser (dry-run + policy); X post (dry-run); secret vault (stub).

---

## Built-in packs

### Research
- `workspace-research` — company workspace search/read  
- `web-search` — web search + fetch URL  
- `fetch-and-summarize` — URL → summary page  
- `market-research` — multi-query research brief  

### Media
- `generate-image`, `edit-image`  
- `generate-audio`, `generate-video` (high)  
- `transcribe-media`  

### Engineering
- `diagram`, `code-assist`  
- `code-sandbox` (high)  
- `export-pack`  

### Ops / growth
- `meeting-prep`, `draft-outreach`  
- `browser-assist` (high)  
- `post-to-x` (high)  
- `web-comment`, `account-register`, `form-submit` (**critical**, default off)

---

## Risk policy (default)

| Risk | Default | Rule |
|------|---------|------|
| low / medium | enabled | Log + token cost when executed |
| high | **disabled** | Policies must opt in |
| critical | **disabled** | CEO gate + domain allowlist + dry-run (future) |

---

## SKILL.md format

```yaml
---
id: web-search
name: Web Search
version: 1
category: research
risk: low
requires_approval: false
token_cost_class: light
permissions:
  - net.outbound.http
tools:
  - id: web_search
    description: ...
    parameters:
      query: string
when_to_use: |
  When you need current facts...
---
# Full instructions (loaded on demand)
```

Progressive disclosure: LLM first sees summaries; full body loads when a skill tool is selected (planned for tool-loop PR).

---

## Commands

| Command | Purpose |
|---------|---------|
| `list_skill_catalog` | All packs + enabled flags |
| `get_skill_pack` | Full pack including body |
| `list_enabled_skills` | Enabled only |
| `get_skills_prompt_fragment` | Prompt text for agents |
| `dispatch_skill_tool` | Stub execute / dry-run |

---

## Roadmap (remaining polish)

1. Wire GameSettings for skill policy (allow high/critical, domain allowlist)  
2. Live image/TTS/video provider HTTP backends when API keys set  
3. Playwright browser automation (still dry-run by default)  
4. CEO autopilot gate for critical skill actions  
5. Optional Skills Hub install from URL/zip  

---

## Related docs

- [AGENT_RUNTIME.md](AGENT_RUNTIME.md)
- [AGENT_SYSTEM.md](AGENT_SYSTEM.md)
- [OBSERVATORY.md](OBSERVATORY.md)
