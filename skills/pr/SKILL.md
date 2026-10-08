---
name: pr
description: Use when writing or rewriting a pull request body, including SDLC release, GitOps promotion and production-proposal PR text.
---

# PR body

Write a body a reviewer can scan before opening the diff: what changed, evidence
that it works, and how dangerous it is to merge. This skill writes text only. It
does not push, open, merge, comment on or re-scope a PR.

Read the [shared principles](../sdlc/references/principles.md). Standalone use
needs no run state. In an SDLC run, `sdlc-release` and `helm-argocd-release`
decide when PR text is needed and supply the verified candidate and artifacts.

## Inputs

- The reviewed diff and base/HEAD. Write after review (SDLC: valid G4), because
  the body describes a diff that has already been reviewed.
- Intent: request or ticket and AC (SDLC: intake/Jira snapshot and `02-plan.md`).
- Observed evidence (SDLC: `03-impl-log.md`, `04-verify-report.md`, UX artifacts).
- Risks: plan risk register, Project baseline, migration and rollback notes.
- Vocabulary: `CONTEXT.md` when present. Keep exact code identifiers.

## Template

If the repository has a PR template (for example `.github/pull_request_template.md`),
fill it and put the sections below inside it without duplicating its fields.
Follow the repository's PR language. Otherwise use:

```markdown
## Summary

<smallest visual that shows the change, with one or two sentences>

## Evidence

- **Before:** <failing test, previous output or screenshot>
  **After:** <passing test, new output or screenshot>

## Merge Danger

**Door:** <one-way | two-way> — <why>
**Blast radius:** <one word> — <what could break>

## Traceability

<run ID; Jira link only for Jira runs; AC IDs; candidate SHA; verify report path/hash;
image digest and rollback target when releasing>
```

Omit Traceability when no run or release data exists. Start at the Summary
heading, skip preambles and keep prose brief.

### Summary

Pick the smallest view that makes the key point clear: usually one, sometimes
several, rarely all.

- Pseudocode for logic; a call tree for runtime flow (for example panel → BFF →
  query-service); a component tree for UI structure and relevant state boundaries.
- A shallow file tree for responsibilities or a broad refactor; Mermaid for
  interaction or data flow (it renders on GitHub, not in a terminal).
- A `diff`-shaped sketch of any of these when the surrounding shape already
  exists; a full code block only when most of it is new or a copyable target
  shape is needed.

Keep only the calls, files, props and boundaries the reviewer needs, next to the
sentence they support. A body that must be huge signals an oversized PR: say so
instead of compressing the evidence.

### Evidence

Show before and after; "tests are green" is a claim, not evidence. A screenshot
is strongest for a visual change when the environment actually captured it
(SDLC: approved UX artifacts). Otherwise name the exact test that failed and now
passes, with the assertion as pseudocode, or the API/console output that changed.
Match the change type: behavior uses RED → GREEN, refactoring uses passing
before/after baselines, documentation/config uses the relevant static, render or
schema check.

Use only observed results bound to the subject revision. Link run artifacts
instead of pasting logs; redact secrets and customer data. Missing or blocked
evidence is stated as missing, never filled in.

### Merge Danger

A **two-way door** is cheap to reverse with a revert. A **one-way door** is not:
schema/data migrations, deletion, incompatible public API or contract changes,
auth/tenant boundary changes, anything shipped outward (notifications, external
writes, published artifacts) and storage migrations where an image rollback is
not schema recovery. A flagged rollout stays two-way only until the first write
in the new format lands. With ArgoCD auto-sync, merging a promotion is a deployment.

Derive the door from the ticket, plan risks and diff, not the diff alone. Never
state lower danger than the approved plan records. If the diff shows a risk the
plan does not, flag it and return it to the conductor; it may require
invalidation. The author grades its own change, so when unsure call it one-way
and say why. Blast radius names what could break: panel layout, BFF API
consumers, tenants, query cost, alerts, dashboards or other plausible effects.

## Updating

A body describes one point in time. After new commits or review fixes, rewrite it
in the same shape for the current SHA. Mark or replace evidence from an older
SHA; never relabel old CI or review results with a new revision.

## Stop and output

Return the body (and title when asked) for the caller to use. Production PR text
belongs under `docs/sdlc/<ID>/production-proposal/` as `sdlc-release` requires.
A written body is not review, approval, passing CI, merge or deployment.

Adapted from Matt Pocock's MIT-licensed
[`pr` skill](https://github.com/mattpocock/skills/tree/main/skills/engineering/pr),
whose Summary view menu credits Dex Horthy's
[`show-me`](https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md).
