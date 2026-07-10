---
id: draft-outreach
name: Draft Outreach
version: 1
category: growth
risk: low
requires_approval: false
token_cost_class: light
permissions:
  - workspace.write
tools:
  - id: write_summary_page
    description: Write draft outreach
    parameters:
      title: string
      content: string
when_to_use: |
  Drafting email/social/community posts without publishing.
---

# Draft Outreach

Never auto-send. Produce 2-3 variants with CTA. Save to workspace for CEO review.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:draft-outreach`.
- Respect company skill enablement and risk policy.
