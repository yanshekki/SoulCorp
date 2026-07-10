---
id: transcribe-media
name: Transcribe Media
version: 1
category: media
risk: low
requires_approval: false
token_cost_class: medium
permissions:
  - media.read
  - workspace.write
tools:
  - id: transcribe
    description: Transcribe audio/video to text
    parameters:
      file_path: string
      language: string
when_to_use: |
  Turning meeting recordings or media files into searchable workspace text.
---

# Transcribe Media

Transcribe accurately, keep speaker labels if possible, write transcript page to workspace.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:transcribe-media`.
- Respect company skill enablement and risk policy.
