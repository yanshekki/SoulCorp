---
id: browser-assist
name: Browser Assist
version: 1
category: growth
risk: high
requires_approval: true
token_cost_class: medium
permissions:
  - browser.navigate
tools:
  - id: browser_goto
    description: Open URL
    parameters:
      url: string
  - id: browser_snapshot
    description: Accessibility snapshot of page
    parameters:
      selector: string
when_to_use: |
  Inspecting public pages when high-risk browser is enabled. No form submit by default.
---

# Browser Assist

Respect domain allowlist. Prefer snapshot over screenshots. Do not enter credentials unless vault skill is used.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:browser-assist`.
- Respect company skill enablement and risk policy.
