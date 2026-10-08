---
description: "Project-level guidance for the installed ai-native-sdlc workflow"
---

# AI development workflow

Use this project's `.agents/skills/` for ai-native-sdlc tasks. Choose the most
specific matching skill and read its `SKILL.md` before working. For a Jira ticket,
a new natural-language request, or a paused SDLC run, use `sdlc`. Use
`sdlc-setup` to map the actual project modules, commands, and host capabilities
before running the workflow. Technical skills can be used independently.

Before editing this project's AGENTS.md, inspect it with `lstat`: shared installs
may make it a symlink to a common template. Never edit through that symlink.
Follow `sdlc-setup`'s `references/project-instructions.md` to create a local regular
file and update its ownership manifest before adding project-specific guidance.

For SDLC work, first select the ticket and resolve its `harness.lock.json` using
`.ai-native-sdlc/scripts/harness.mjs resolve docs/sdlc/<ID>/state.json`. Use the
returned root for that ticket's skills, references, role profiles and scripts;
`.agents/skills/` is the discovery/bootstrap entrypoint, not an override of an
existing lock. Local intake and `harness.mjs start JIRA-ID` pin new runs. Every
sub task inherits the conductor's lock and authoritative state path. Missing
locks need explicit adoption; mismatched/missing snapshots block, never fall back
to latest. Do not modify snapshots, switch shared links, or weaken current safety
hooks. Project instructions and current security requirements remain applicable.

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
Each standard rule states its enforcement: a named automated check for mechanical
rules, or review for judgement calls. Keep this file to navigation pointers; put
rules proposed by `retro` into standards or checks, not here.
