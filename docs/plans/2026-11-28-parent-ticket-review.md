# Parent-ticket review implementation plan

## Status

Approved by the user for implementation on 2026-11-28 and implemented on an
isolated `main`-based worktree. The user then authorized a patch release; it ships
as `0.3.1`. No consuming project is installed, upgraded or migrated.

## Scope

1. Add G2-bound, risk-to-task mapping for newly prepared contract-2 plans with
   multiple outcomes.
2. Retain per-slice review only for tasks mapped to material risks; standard
   slices still require their existing task tests, module-quality evidence and
   integration.
3. Retain the single independent full-scope G4 review with security coverage,
   strict plan review, human approval and release gates.
4. Preserve all prior runs and single-task plans without weakening their existing
   evidence requirements.

See [design and acceptance criteria](../specs/2026-11-28-parent-ticket-review-design.md).

## Sequence

1. Add contract and state tests for plan generation, risk-mapping validation,
   dependent-task readiness, risk-required slice reviews, and final integrated
   review.
2. Implement the policy and task risk mapping in `workflow.mjs` and `tasks.mjs`;
   enforce it in `state.mjs` and preserve legacy behavior when the policy field is
   absent.
3. Update task templates, planner/implementer/reviewer/verifier guidance and the
   protocol/operations documentation.
4. Run targeted contract/review tests, then `npm test`, `npm run validate`,
   `git diff --check`, and a full test-run review. Verify old-release snapshot
   lifecycle tests and distinguish locked-snapshot behavior from the new runtime.

## Verification notes

- Baseline on `0.3.0` (`2ed93dc`): existing tests confirmed strict per-slice
  reviews, test/quality gates, dependent readiness and snapshot restoration.
- The new end-to-end contract-2 test first failed because generated policy
  lacked `sliceReview`; it passed after the policy and risk mapping were added.
- `npm test`: 355 tests, 352 passed, 0 failed, 3 skipped. This includes the
  existing pinned-snapshot lifecycle tests.
- `npm run validate`, JavaScript syntax checks, and `git diff --check` passed.
- Independent code review found no high-confidence correctness blockers.
- No review-time or total-duration saving is claimed without measurements from
  authorized consuming-project runs.
