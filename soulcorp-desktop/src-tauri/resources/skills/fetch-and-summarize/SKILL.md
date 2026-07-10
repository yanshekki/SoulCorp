---
id: fetch-and-summarize
name: Fetch & Summarize URL
version: 1
category: research
risk: low
requires_approval: false
token_cost_class: light
permissions:
  - net.outbound.http
  - workspace.write
tools:
  - id: fetch_url
    description: Fetch URL text
    parameters:
      url: string
  - id: write_summary_page
    description: Write summary to workspace
    parameters:
      title: string
      content: string
when_to_use: |
  When given a specific URL to digest into a workspace brief.
---

# Fetch & Summarize URL

Fetch the page, extract main content, write a structured summary with key points and open questions.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:fetch-and-summarize`.
- Respect company skill enablement and risk policy.
