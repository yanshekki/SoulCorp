---
id: web-search
name: Web Search
version: 1
category: research
risk: low
requires_approval: false
token_cost_class: light
permissions:
  - net.outbound.http
tools:
  - id: web_search
    description: Search the public web
    parameters:
      query: string
      max_results: number
  - id: fetch_url
    description: Fetch a URL as text
    parameters:
      url: string
      max_chars: number
when_to_use: |
  When you need current facts, citations, market data, docs, or news not in the workspace.
---

# Web Search

Use web_search for discovery, then fetch_url for promising results. Summarize with sources. Never invent URLs.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:web-search`.
- Respect company skill enablement and risk policy.
