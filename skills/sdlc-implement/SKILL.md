---
name: sdlc-implement
description: Use when a Jira ticket has an approved implementation plan and code must be delivered in tested vertical slices.
---

# Implement

Read [protocol](../sdlc/references/protocol.md). Require `next=implement`, G2 passed
and unchanged approved artifacts. Invoke `tdd`; read the relevant technology skills.

For each unblocked slice:

1. Give `sdlc-test-writer` the AC, contracts, exact test allowlist and test command.
   Require a meaningful failing assertion with observed output; missing tools,
   compilation errors and failing unrelated tests are not RED.
2. Dispatch `sdlc-implementer` with RED evidence and production-only edit allowlist.
   Implement GREEN then refactor; rerun the same tests on final code.
   The implementer may not alter tests, snapshots, tolerances or skip flags.
   A disputed assertion returns BLOCKED to the test-writer/human.
3. Audit all changed paths. Use `sdlc-spec-reviewer` then
   `sdlc-code-reviewer`, requiring `code-review`; record both axes. Each uses a
   verified model family different from the code author. If unsupported, stop.
4. Fix blocking findings through the responsible author and recheck affected tests.
   Increment attempts. At three failures invoke `diagnosing-bugs`; unresolved work
   becomes NEEDS_HUMAN, not another autonomous loop.
5. Record slice RED, final GREEN, reviews, actual model provenance, code revision and
   changed paths in `03-impl-log.md`. Mark done only after all evidence is present.

Run integrated relevant tests after the last slice; commit source according to
repository policy before recording G3 subjectHead. Do not push. Evidence files
remain separate from executable source; validate state after writing them.
G3 passes only with all slices done and final integration green.

Test-writer changes to approved behavior return to plan/discovery approval.
Independent work can run in parallel only with disjoint edits and completed
dependency contracts. The conductor alone updates shared state. Return verify
handoff with base/head, coverage, unresolved limits and Jira synchronization status.
