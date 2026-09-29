---
name: code-review
description: Use when a slice, plan, or final diff needs independent specification, standards, or security review.
---

# Code Review

Read [shared principles](../sdlc/references/principles.md). Standalone review follows
the user's scope; it does not require a Jira/state file. SDLC review follows the
supplied approved policy and handoff, not mutable config or guessed model routing.

1. Establish the reviewed intent, diff, base/HEAD, input hashes and check evidence.
   Remain read-only; ask the caller for missing command output rather than pretend
   to execute from a read/search-only role.
2. Require independence from the author. Light may combine spec and standards in
   one review; strict/legacy keeps distinct spec/standards axes. New policies in
   either profile recommend different-family review, but allow the same model in
   a distinct verified session when `requireDifferentFamily` is false. Explicit
   true or legacy records without policy still require a different family.
   Human review requires policy permission, not just human gate approval.
   Record a same-family choice and routing limitations without blocking solely
   on an unmet recommendation. Never fabricate model IDs, families or session identity.
3. Inspect **spec** (AC → contract → tests → behavior), **standards** (correctness,
   maintainability, failure paths, scope, misleading tests) and assigned **security**
   (auth/tenant boundaries, injection, secret exposure, dependency/runtime risks).
   A named security agent is optional; missing necessary expertise is a blocker.
4. Return blocking/should-fix/nit findings with path/line, concrete failure or
   violated requirement, resolution and limitations. Zero findings must describe
   inspected scope, not assert universal safety.
5. Bind findings to the actual revision. New code requires renewed review. Light
   G4 can reuse combined evidence only at the same revision with complete integrated
   spec/standards/security coverage and no unresolved blockers.

Return the axis/coverage, subject revision, provenance (or human review reference),
evidence and limitations. The conductor records/validates SDLC state. Review DONE
means the inspection finished; it is not a human gate approval or release claim.
