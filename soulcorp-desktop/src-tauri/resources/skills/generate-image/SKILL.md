---
id: generate-image
name: Generate Image
version: 1
category: media
risk: medium
requires_approval: false
token_cost_class: heavy
permissions:
  - media.generate
  - workspace.write
tools:
  - id: generate_image
    description: Generate an image from a prompt
    parameters:
      prompt: string
      size: string
      style: string
when_to_use: |
  Marketing assets, product mockups, concept art, or visual deliverables.
---

# Generate Image

Write a detailed prompt. Save output under workspace files/media/images. Return path and short caption.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:generate-image`.
- Respect company skill enablement and risk policy.
