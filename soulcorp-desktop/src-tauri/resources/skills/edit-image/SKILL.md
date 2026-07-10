---
id: edit-image
name: Edit Image
version: 1
category: media
risk: medium
requires_approval: false
token_cost_class: heavy
permissions:
  - media.generate
  - workspace.write
tools:
  - id: edit_image
    description: Edit or vary an existing image
    parameters:
      image_path: string
      prompt: string
when_to_use: |
  When refining an existing image asset from the workspace.
---

# Edit Image

Reference an existing workspace image path. Describe the edit clearly. Keep brand consistency.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:edit-image`.
- Respect company skill enablement and risk policy.
