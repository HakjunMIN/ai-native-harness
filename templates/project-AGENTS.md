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

## Project standards and architecture decisions

Follow this project's existing documentation locations and ownership rules.
When no convention exists, use `docs/architecture/overview.md` for current system
boundaries, `docs/architecture/adr/README.md` for the project decision index and
`docs/standards/README.md` for the standards index. Setup records actual locations
here; create only documents needed by authorized work, not empty topic files.

Before discovery or design, read the indexes and documents relevant to the changed
area. Standards define current rules; project ADRs preserve rationale for shared
choices. Keep feature-only decisions in `docs/sdlc/<ID>/02-plan.md` or that run's
`adr/` directory. Reference shared rules instead of copying them into each feature.

Use the installed `sdlc` skill's `references/project-governance.md` for baseline
recording, approval, exceptions, promotion and supersession. Record applicable
paths/sections and baseline commits (content hashes for uncommitted documents) in
the feature plan. Check for relevant drift on resume, review and verification;
the state validator does not automatically track project-document changes.
Project-wide changes and exceptions require the designated owner's explicit
approval; a feature gate approval alone does not authorize changing shared policy.
