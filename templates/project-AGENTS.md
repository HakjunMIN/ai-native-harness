---
description: "Project-level guidance for the installed ai-native-sdlc workflow"
---

# AI development workflow

Use this project's `.agents/skills/` for ai-native-sdlc tasks. Choose the most
specific matching skill and read its `SKILL.md` before working. For a Jira ticket,
a new natural-language request, or a paused SDLC run, use `sdlc`. Use
`sdlc-setup` to map the actual project modules, commands, and host capabilities
before running the workflow. Technical skills can be used independently.

The installed `.ai-native-sdlc/` directory is the harness source, not this
project's application code. Keep project changes in this repository. Follow
this project's own build, test, review, and deployment rules; do not assume
example paths or commands from the harness. Human approval gates must be
explicitly approved by a person, and production changes remain human-controlled.
