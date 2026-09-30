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
contracts. Use `workspaces.mjs plan|start`: one nonconcurrent slice stays on a
normal branch; independent, nonoverlapping slices run in separate Git worktrees.
`start` records assignments as `in_progress`. Reconcile existing assignments
on resume, never start them twice. Handoffs include policy, Jira key, manifest/AC
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
   Strict/legacy retains separate spec and standards reviews. Different-family
   review is recommended for new policies, required only for explicit
   `requireDifferentFamily: true` or legacy records without policy. With false,
   same-model independent sessions are eligible; human review needs policy permission.
   Record real provenance, scope, subject revision and blocking findings.
4. Resolve findings and rerun affected checks on final code. At three failed
   attempts invoke bounded diagnosis; unresolved work becomes NEEDS_HUMAN.
5. Record AC-to-check mapping, mode-specific evidence, final GREEN, reviews and
   revision in `03-impl-log.md`. Mark done only with complete valid evidence.
   Sync progress on the parent for Jira light, child for Jira strict; local work
   has no Jira sync. Completion does not imply deployment.

For G3 code-only revalidation, verify historical RED provenance before reusing it
for unchanged behavior/tests; require fresh GREEN and review. New regression tests
need new RED. With hashed impact analysis, invalidate affected slices plus graph
dependents; if impact is uncertain reset all. Preserved slices never waive final
integrated checks.

The conductor alone updates shared state: audit each result, integrate worktree
commits onto the integration branch with required commit authorization, resolve
conflicts, and verify the new revision. Do not mark dependent slices ready before
integration. Run applicable checks on the final combined code; G3 requires all
slice revisions to be ancestors of its committed `subjectHead`. Do not push.
Keep evidence updates separate from executable inputs, then return the verify handoff.
