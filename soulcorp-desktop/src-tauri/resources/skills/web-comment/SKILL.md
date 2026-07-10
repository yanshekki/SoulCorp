---
id: web-comment
name: Web Comment
version: 1
category: growth
risk: critical
requires_approval: true
token_cost_class: medium
permissions:
  - browser.navigate
  - browser.input
  - browser.submit
tools:
  - id: browser_goto
    description: Open page
    parameters:
      url: string
  - id: browser_fill
    description: Fill field
    parameters:
      selector: string
      value: string
  - id: browser_click
    description: Click
    parameters:
      selector: string
when_to_use: |
  Posting public comments only when CEO enabled critical skills and domain is allowlisted.
---

# Web Comment

Default dry-run: draft comment and plan steps without submit. Require CEO gate for submit.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:web-comment`.
- Respect company skill enablement and risk policy.
