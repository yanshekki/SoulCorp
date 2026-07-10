---
id: meeting-prep
name: Meeting Prep
version: 1
category: ops
risk: low
requires_approval: false
token_cost_class: light
permissions:
  - workspace.read
tools:
  - id: workspace_search
    description: Search workspace for meeting context
    parameters:
      query: string
  - id: web_search
    description: Optional external context
    parameters:
      query: string
when_to_use: |
  Preparing agendas, briefs, or talking points before a meeting.
---

# Meeting Prep

Pull workspace context first, optionally web search, produce a one-page briefing.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:meeting-prep`.
- Respect company skill enablement and risk policy.
