---
id: code-sandbox
name: Code Sandbox
version: 1
category: engineering
risk: high
requires_approval: true
token_cost_class: medium
permissions:
  - sandbox.exec
tools:
  - id: run_python
    description: Run restricted Python
    parameters:
      code: string
      timeout_secs: number
when_to_use: |
  When computation or quick scripts are needed and high-risk sandbox is enabled.
---

# Code Sandbox

No network. Timeout enforced. Prefer small scripts. Capture stdout/stderr only.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:code-sandbox`.
- Respect company skill enablement and risk policy.
