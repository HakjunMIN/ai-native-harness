# Parent-ticket review for decomposed work

## Context

In strict SDLC runs, every completed slice currently needs independent spec and
standards reviews, followed by a final integrated review. Review calls multiply
with decomposition even though the release decision is made on the parent ticket.
The existing slice test, quality, integration, approval and final release gates
are useful and must remain.

## Decision

For newly prepared contract-2 plans with multiple tasks, review the complete
integrated change once at G4. Keep each slice's existing behavior/refactor/static
verification, task-scoped module quality evidence, source revision and integration
requirements. Do not require per-slice review for standard-risk tasks. Keep the
existing independent spec/standards slice review for tasks explicitly mapped to a
plan risk. Keep the existing independent plan review, G2 human approval, G4 final
review with security coverage, and release gates.

Single-task plans and all previously approved plans retain their existing review
requirements. Contract-1 plans do not gain the new review policy. The approved
manifest's `policy.sliceReview: "risk-mapped"` opts a newly decomposed contract-2
plan into this behavior; absence of the field preserves legacy validation.

## Risk mapping

The canonical draft's plan-level `risks` are the material risks recorded during
planning. For a decomposed contract-2 plan, every task declares a `risks` array,
which may be empty. Every plan risk must be allocated to at least one affected
task, and a task may not introduce a risk absent from the plan. A nonempty task
risk list requires that slice's independent `spec` and `standards` reviews before
it is done. A risk-free task requires no slice review.

The independent G2 plan reviewer checks that risk classification and task mapping
are substantively complete, including authentication/tenant boundaries,
destructive or schema/data changes, public compatibility and security-sensitive
effects. The validator enforces exact mapping, not semantic classification.
Unmapped, undeclared, duplicate or missing risk data fails preparation or state
validation; it never silently defaults a risky task to standard.

## State and evidence

The `sliceReview` policy is part of the task manifest and state policy, both
covered by G2 approval evidence. Its task-level risk map is part of the same
immutable manifest and generated task documents.

At G3, standard-risk slices need the change-appropriate test evidence and required
quality report, but no slice review. Risk-mapped slices additionally need
independent spec and standards review on their slice revision. At G4, the existing
final review is still required on the exact integrated head and covers the full
base-to-head diff, all task ACs, cross-task integration, spec, standards and
security. New or changed code invalidates stale review evidence. A second review
round remains limited to the fix diff and blast radius.

## Compatibility and rollout

No run-lock or state schema version changes. New contract-2 multi-task plans carry
the new policy; old policy snapshots without it preserve strict per-slice reviews.
Old locked runs continue dispatching to their existing snapshots. Single-task
plans preserve current behavior. No consuming project, installed harness,
active ticket or Jira issue is migrated by this source change.

Rollback for future runs is an explicit harness revision rollback; it does not
silently rewrite an active ticket lock. Any active run upgrade requires the
existing archive, invalidation and reapproval procedure.

## Acceptance criteria

1. A new decomposed contract-2 plan maps every material plan risk to task IDs and
   rejects missing, duplicate, undeclared and unmapped risks.
2. A completed standard-risk task can unlock an evidenced dependent task without
   a slice review; missing test, quality or integration evidence still blocks it.
3. A risk-mapped task cannot complete without independent spec and standards
   reviews.
4. G4 still rejects a missing, stale, self-authored or security-incomplete final
   review and accepts one valid full-scope review on the integrated revision.
5. Single-task plans, contract-1 runs and pre-existing contract-2 manifests
   without the new policy retain their original slice-review requirements.
6. Existing snapshot start/resolve/resume/restore behavior remains intact, and no
   installed consumer is changed by implementation.
