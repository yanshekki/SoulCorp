---
id: market-research
name: Market Research
version: 1
category: research
risk: medium
requires_approval: false
token_cost_class: medium
permissions:
  - net.outbound.http
  - workspace.write
tools:
  - id: web_search
    description: Search
    parameters:
      query: string
  - id: fetch_url
    description: Fetch
    parameters:
      url: string
  - id: write_summary_page
    description: Write brief
    parameters:
      title: string
      content: string
when_to_use: |
  Competitive scans, market sizing notes, trend briefs for strategy work.
---

# Market Research

Multi-query search, fetch top sources, write structured brief with sources and confidence.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:market-research`.
- Respect company skill enablement and risk policy.
