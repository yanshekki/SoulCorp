---
id: export-pack
name: Export Pack
version: 1
category: ops
risk: low
requires_approval: false
token_cost_class: light
permissions:
  - workspace.read
  - export
tools:
  - id: export_zip
    description: Export workspace/project pack
    parameters:
      scope: string
when_to_use: |
  Packaging deliverables for clients or hub gigs.
---

# Export Pack

Use existing export paths. Confirm scope. Return export path for CEO download.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:export-pack`.
- Respect company skill enablement and risk policy.
