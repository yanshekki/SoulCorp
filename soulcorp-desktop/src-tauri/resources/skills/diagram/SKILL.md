---
id: diagram
name: Diagram
version: 1
category: engineering
risk: low
requires_approval: false
token_cost_class: light
permissions:
  - workspace.write
tools:
  - id: render_mermaid
    description: Render mermaid to SVG/PNG
    parameters:
      source: string
      format: string
when_to_use: |
  Architecture, flowcharts, sequence diagrams for specs or deliverables.
---

# Diagram

Produce valid mermaid, render, and embed path in the deliverable markdown.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:diagram`.
- Respect company skill enablement and risk policy.
