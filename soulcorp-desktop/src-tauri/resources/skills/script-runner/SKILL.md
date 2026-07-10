---
id: script-runner
name: Script Runner
version: 1
category: engineering
risk: high
requires_approval: true
token_cost_class: medium
permissions:
  - script.exec
tools:
  - id: run_script
    description: Run a skill script (.sh .php .js .py .rs) with argv; returns JSON
    parameters:
      entry: string
      args: string[]
      command: string
      skill_id: string
      timeout_secs: number
  - id: list_script_skills
    description: List custom company/global script skills
    parameters: {}
when_to_use: |
  When you need to execute a custom script skill or Lab script (PHP, Node, Python, Shell, Rust).
---

# Script Runner

Prefer structured stdout JSON from scripts.

## Lab command form

```
test.php a b c
```

Maps to `entry=test.php`, `args=["a","b","c"]`.

## Safety

Requires high-risk policy. Paths are jailed to skill directories.
