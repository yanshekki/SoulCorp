---
id: form-submit
name: Form Submit
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
    description: Open form
    parameters:
      url: string
  - id: browser_fill
    description: Fill
    parameters:
      selector: string
      value: string
  - id: browser_click
    description: Submit
    parameters:
      selector: string
when_to_use: |
  Submitting web forms on allowlisted domains after CEO gate.
---

# Form Submit

Dry-run first. Confirm fields. Never bypass CAPTCHA automatically.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:form-submit`.
- Respect company skill enablement and risk policy.
