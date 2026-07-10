---
id: generate-audio
name: Generate Audio
version: 1
category: media
risk: medium
requires_approval: false
token_cost_class: heavy
permissions:
  - media.generate
  - workspace.write
tools:
  - id: generate_audio
    description: TTS or short audio clip
    parameters:
      text: string
      voice: string
  - id: text_to_speech
    description: Convert text to speech
    parameters:
      text: string
      voice: string
when_to_use: |
  Voiceovers, narration, short SFX, or audio demos for deliverables.
---

# Generate Audio

Prefer clear short scripts. Save under files/media/audio. Note duration and format.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:generate-audio`.
- Respect company skill enablement and risk policy.
