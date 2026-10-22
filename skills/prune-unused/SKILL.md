---
name: prune-unused
description: Use when the user explicitly requests unused code or skill cleanup, dead-code review, or a periodic repository pruning audit. - Brought to you by HakjunMIN/ai-native-harness
disable-model-invocation: true
---

# Prune Unused

## Overview

Human-invoked maintenance, independent of SDLC and Jira. Default to a read-only
audit. Periodic means a person returns when needed, not a cron job, CI workflow
or automatic SDLC phase. Never schedule cleanup or treat a generic cleanup
request as approval to delete discovered candidates.

Read [shared principles](../sdlc/references/principles.md) and
[project governance](../sdlc/references/project-governance.md).
Missing references are a lead, not proof of disuse.

## Prerequisites

Use the current repository and both code and skills unless the user narrows
scope. Record the checkout, HEAD, dirty paths and exclusions. Preserve unrelated
work. Installed harnesses, managed links, sibling repositories, ticket snapshots,
locks and historical evidence are not cleanup targets. Propose harness retirement
in its owning source repository; never edit through an installation link.

## Quick start

Invoke in chat, not a shell:

```text
prune-unused: audit this repository's code and skills; report candidates only.
```

## Audit

Use existing analyzers without autofix and trace their findings through the
supported entrypoints. Search errors, unavailable tools, excluded files and
unsupported build configurations are gaps, not zero usage.

| Target              | Usage evidence to inspect                                                                                                                                   |
|---------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Code                | Imports/callers, public exports, CLI/scripts, routes, dynamic registration/reflection, configuration, build tags/platforms, tests, docs and external consumers |
| Skills              | Directory discovery, catalog/manifests, agents, other skills, direct user invocation, installation links, examples and supported consumers                     |
| Apparent duplicates | Triggers, contracts, safety gates and replacement coverage, not matching names or titles                                                                      |

Absent telemetry or internal references cannot establish that a skill or public
interface is unused. Confirm retirement with its owner when consumer usage is
unknown; otherwise retain it as uncertain. No removal quota is required.

## Report and stop

Return Korean prose with exact identifiers and evidence links. State repository,
revision, dirty-file context, scope, search coverage and limitations. Each
candidate has this row:

| ID | Path/symbol  | Decision                                | Evidence and gaps                   | Risk                            | Proposed edits and checks           |
|----|--------------|-----------------------------------------|-------------------------------------|---------------------------------|-------------------------------------|
| P1 | Exact target | Candidate / Keep / Uncertain / Protected | Citations and inspected entrypoints | Low / Medium / High, with reason | Dependent files, before/after checks |

Distinguish observed results from planned checks. Include retained items and
their reasons, or explicitly report no candidates. Do not write a report file
unless requested. Stop for selection of exact candidate IDs and their dependent
edits; unresolved ownership decisions remain pending.

## Applying selected candidates

1. Recheck the revision, worktree and usage evidence. Changed evidence requires
   a refreshed report and selection; old approval is not standing permission.
2. Use [tdd](../tdd/SKILL.md) to select verification and capture the before
   baseline. Refactors need passing before/after behavior checks; documentation
   needs relevant static checks. Behavior changes still need RED/GREEN.
3. Edit only approved, repository-owned paths. Update affected exports,
   registrations, manifests, current docs/links, installer expectations and
   catalog counts together. Preserve historical counts and locked snapshots.
   Update expectations for the approved retirement, never weaken unrelated
   assertions or delete tests to hide a regression.
4. Apply [verification-gate](../verification-gate/SKILL.md). Report actual
   commands/results, removed and retained items, remaining risks and blockers.
   Missing required checks are `BLOCKED`, not completion. No automatic commit,
   push, installation or deployment.

## Bounded example

P1 is an unreachable private helper; P2 is an unreferenced but discoverable skill.
Propose P1 with its risk and checks, retain P2 as uncertain, and wait. If the user
selects P1, recheck consumers before removal; a new caller invalidates the proposal.

## Troubleshooting

| Shortcut or red flag                                  | Response                                               |
|-------------------------------------------------------|--------------------------------------------------------|
| No grep hits or recent invocations                     | Inspect entrypoints and consumers; retain unknown usage |
| Release deadline, previous approval or matching titles | Keep the current evidence and item-selection boundary   |
| A check fails after deletion                           | Investigate; do not suppress the check or claim success |

> Brought to you by HakjunMIN/ai-native-harness
