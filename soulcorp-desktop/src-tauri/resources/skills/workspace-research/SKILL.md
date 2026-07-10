---
id: workspace-research
name: Workspace Research
version: 1
category: research
risk: low
requires_approval: false
token_cost_class: light
permissions:
  - workspace.read
tools:
  - id: workspace_search
    description: Search company workspace pages
    parameters:
      query: string
      max_results: number
  - id: workspace_read_page
    description: Read a workspace page by id
    parameters:
      page_id: string
when_to_use: |
  When the answer may already exist in company docs, agent journals, or project briefs.
---

# Workspace Research

Search the company workspace before asking external sources. Prefer reading linked pages and citing page titles.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:workspace-research`.
- Respect company skill enablement and risk policy.
