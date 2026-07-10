---
id: code-assist
name: Code Assist
version: 1
category: engineering
risk: low
requires_approval: false
token_cost_class: medium
permissions:
  - workspace.read
  - workspace.write
tools:
  - id: propose_patch
    description: Propose a code/doc patch
    parameters:
      path: string
      diff: string
      rationale: string
when_to_use: |
  Implementing features in the company workspace as patches (no shell execution).
---

# Code Assist

Read context first. Propose minimal patches with rationale. Do not claim to run tests unless code-sandbox is enabled.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:code-assist`.
- Respect company skill enablement and risk policy.
