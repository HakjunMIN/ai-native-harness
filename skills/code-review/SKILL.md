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
   one review; strict/legacy keeps distinct spec/standards axes. New policies
   require a reviewer model different from the author model unless
   `requireDifferentModel` is false; the same family is allowed. Different-family
   review is recommended, required only when `requireDifferentFamily` is true or
   for legacy records without policy.
   Human review requires policy permission, not just human gate approval.
   Record a same-family choice and routing limitations without blocking solely
   on an unmet recommendation. Never fabricate model IDs, families or session identity.
3. Inspect **spec** (AC → contract → tests → behavior), **standards** (correctness,
   maintainability, failure paths, scope, misleading tests) and assigned **security**
   (auth/tenant boundaries, injection, secret exposure, dependency/runtime risks).
   A named security agent is optional; missing necessary expertise is a blocker.
   Apply [project governance](../sdlc/references/project-governance.md): inspect
   relevant standards and accepted ADRs, compare them with the supplied Project
   baseline, and report violations by document/section. Check shared-change
   approval, exception scope/expiry, and index/standard updates for replaced ADRs.
   Enforce accepted `review` rules by judgement; for `check` rules confirm the
   named check ran on the subject revision instead of re-deriving it. Ignore
   `proposed` rules. Note a repeated mechanical finding as a `retro` candidate.
   Ask the conductor for comparison evidence when tools cannot establish drift;
   a passing state check is not that evidence. Standalone reviews use applicable
   current project rules without inventing an SDLC baseline or gate requirements.
4. Return blocking/should-fix/nit findings with path/line, concrete failure or
   violated requirement, resolution and limitations. Mark `blocking` only for a
   violated approved AC/contract, a security defect with an exploit path, a broken
   build/test or data loss; other issues are should-fix/nit follow-ups. Zero
   findings must describe inspected scope, not assert universal safety.
   For each blocking finding also state `critical: true|false`. Always critical:
   an unmet AC, a security defect with an exploit path, data loss, a broken build,
   test or required quality check, an auth/tenant, destructive data or public
   contract change, secrets, or production effects. Only internal contract,
   standard or ADR violations may be non-critical. End with the round number and
   the blocking and critical counts so the conductor can copy them verbatim.
5. Bind findings to the actual revision. New code requires renewed review. A subject
   gets at most 2 rounds: round 2 reviews only the fix diff and its blast radius and
   must not raise new should-fix/nit items outside it. Blockers left after round 2
   go to the human as `NEEDS_HUMAN` (accept with follow-ups, fix once more, descope),
   unless the approved policy lets the agent accept non-critical ones (protocol
   autonomous execution).
   Light G4 can reuse combined evidence only at the same revision with complete integrated
   spec/standards/security coverage and no unresolved blockers.

Return the axis/coverage, subject revision, provenance (or human review reference),
evidence and limitations. The conductor records/validates SDLC state. Review DONE
means the inspection finished; it is not a human gate approval or release claim.
