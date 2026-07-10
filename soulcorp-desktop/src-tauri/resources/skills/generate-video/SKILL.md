---
id: generate-video
name: Generate Video
version: 1
category: media
risk: high
requires_approval: true
token_cost_class: heavy
permissions:
  - media.generate
  - workspace.write
tools:
  - id: generate_video
    description: Generate a short video
    parameters:
      prompt: string
      duration_secs: number
      aspect_ratio: string
  - id: video_job_status
    description: Poll async video job
    parameters:
      job_id: string
when_to_use: |
  Short product clips or marketing videos after CEO/policy allows high-risk media.
---

# Generate Video

Video is expensive and async. Start a job, poll status, then attach the final file. Keep clips short.

## Notes

- Log every tool call to agent activity.
- Charge token budget under `skill:generate-video`.
- Respect company skill enablement and risk policy.
