---
name: sdlc-implement
description: Use when a Jira ticket or local run has an approved implementation plan and changes must be delivered in tested outcomes.
---

# Implement

Read [protocol](../sdlc/references/protocol.md). Require `next=implement`, valid G2
and unchanged artifacts/policy. Jira strict/legacy additionally requires confirmed
publication; local runs use the local ID and Jira light uses the parent key.
Load only relevant technical skills.

Run `state.mjs ready <state>` and audit dependencies, edit paths and shared
contracts. Run `workspaces.mjs plan|start` in the run worktree: one nonconcurrent
slice stays on its integration branch; independent, nonoverlapping slices run in
sibling Git worktrees.
`start` records assignments as `in_progress`. Reconcile existing assignments
on resume, never start them twice. After G0–G2 invalidation or a harness upgrade,
renew approvals, commit the approved plan, preserve and clean up old sub task workspaces,
then run `workspaces.mjs reconcile STATE` before `plan`/`start`; follow the
[recovery procedure](../../docs/operations.md#브랜치와-병렬-워크트리).
Handoffs include policy, Jira/local ID, manifest/AC
references, worktree path/branch/base, exact allowed paths and commands.

Include the plan's Project baseline and approved exceptions in each handoff.
Follow [project governance](../sdlc/references/project-governance.md); compare
relevant current documents with the baseline before implementation or resumption.
Report material drift to the conductor for G1/G2 impact assessment; do not silently
adopt changed rules. Shared standards and ADR edits require an explicit allowlist
and coordinated ownership, not parallel independent edits to the same shared files.

1. Follow the approved verification mode: behavior needs meaningful RED then
   GREEN; refactor needs a passing before-baseline then GREEN; docs/config need
   meaningful static/schema/render or relevant tests. Missing tools and syntax
   errors are not behavioral RED. See `tdd` for details.
2. Light: one author may own tests and implementation within the allowlist.
   Strict/legacy: separate test-writer and production implementer; the latter
   cannot change frozen tests/fixtures/skips. Neither mode permits weakening
   expectations to manufacture success. Contract changes return to G2/G1.
3. Audit the diff. Light requires one independent combined spec/standards review;
   use an independent model session or evidenced human review as policy permits.
   Strict/legacy retains separate spec and standards reviews. Dispatch reviewers
   with the configured role model; new policies require a reviewer model different
   from the author model (`requireDifferentModel`), same family allowed. Different-family
   review is recommended, required only for explicit `requireDifferentFamily: true`
   or legacy records without policy; human review needs policy permission.
   Record real provenance, scope, subject revision and blocking findings.
4. Resolve findings and rerun affected checks on final code. Review gets at most
   2 rounds per slice: round 2 is a delta review of the fix; an implementation-only
   fix needs fresh GREEN, not a new RED. Blockers left after round 2 become
   NEEDS_HUMAN (accept with follow-ups, fix once more, descope). Contract-2 runs
   with `residualFindings: follow-up` accept them as the agent when the reviewer
   reports `critical: 0`: log a `D-n` row in `decisions.md` and record
   `acceptance: {actor: "agent", decision, followUps}` with `round: 2`. At three failed
   attempts invoke bounded diagnosis; unresolved work becomes NEEDS_HUMAN.
5. Contract-2 runs: format only approved changed paths with the configured fix
   command, commit, then run `quality-run.mjs run STATE --task N` in the slice's
   assignment and bind the passing report as `slice.quality` (its `subjectHead` is
   the slice revision). See [code quality](../sdlc/references/code-quality.md).
6. Record AC-to-check mapping, mode-specific evidence, final GREEN, reviews and
   revision in `03-impl-log.md`. Mark done only with complete valid evidence.
   Sync progress on the parent for Jira light, child for Jira strict; local work
   has no Jira sync. Completion does not imply deployment.

For G3 code-only revalidation, verify historical RED provenance before reusing it
for unchanged behavior/tests; require fresh GREEN and review. New regression tests
need new RED. With hashed impact analysis, invalidate affected slices plus graph
dependents; if impact is uncertain reset all. Preserved slices never waive final
integrated checks.

Contract-2 runs proceed on recommendations: log non-critical choices in
`decisions.md`, reference them in `03-impl-log.md`, and ask only for the critical
escalation list ([autonomous execution](../sdlc/references/protocol.md#autonomous-execution)).
Stay inside the G2 proceed agreement: report finished slices and the next ready
slice as progress instead of asking. A stop condition applies only when the slice
cannot be completed without crossing it; log optional suggestions as follow-ups.
On one, pause only the affected slice and return what changed, the decision
needed and the recommendation.
Active `slice-commit` and `local-integration` grants replace per-action questions.
Diagnose CI and environment failures from read-only sources (`gh run view --log`,
`gh pr checks`, `az … show|list`, `kubectl get`) before asking.

The conductor alone updates shared state: audit each result, integrate worktree
commits onto the integration branch with required commit authorization, resolve
conflicts, and verify the new revision. Do not mark dependent slices ready before
integration. Run applicable checks on the final combined code; G3 requires all
slice revisions to be ancestors of its committed `subjectHead`. Contract-2 G3 also
binds an integration `quality-run.mjs run STATE` report at that head as
`gate.quality` and in `gate.evidence`. Do not push.
Keep evidence updates separate from executable inputs, then return the verify handoff.
