---
id: post-to-x
name: Post to X
version: 1
category: growth
risk: high
requires_approval: true
token_cost_class: light
permissions:
  - social.x.post
tools:
  - id: x_post
    description: Publish post via API
    parameters:
      text: string
      media_paths: string[]
when_to_use: |
  Publishing to X/Twitter when API credentials and high-risk social are enabled.
---

# Post to X

Draft first with draft-outreach. Require CEO approval for live post. Log post id.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:post-to-x`.
- Respect company skill enablement and risk policy.
