---
id: account-register
name: Account Register
version: 1
category: growth
risk: critical
requires_approval: true
token_cost_class: medium
permissions:
  - browser.navigate
  - browser.input
  - browser.submit
  - secrets.read
tools:
  - id: browser_goto
    description: Open signup
    parameters:
      url: string
  - id: browser_fill
    description: Fill form
    parameters:
      selector: string
      value: string
  - id: secrets_get
    description: Get stored secret ref
    parameters:
      secret_id: string
when_to_use: |
  Creating accounts on allowlisted services with vaulted credentials — CEO gated only.
---

# Account Register

Never put raw passwords in prompts. Dry-run by default. CAPTCHA may require human. Audit every step.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:account-register`.
- Respect company skill enablement and risk policy.
