---
name: code-review
description: Use when a slice, plan, or final diff requires specification, standards, or cross-family review.
---

# Code Review

Review approved intent and code quality as separate axes, bound to the same revision.

Read the [shared protocol](../sdlc/references/protocol.md) and `<PLUGIN_ROOT>/templates/handoff.md`. Resolve skills through native invocation or this plugin's exact files.

## Procedure

1. Receive the ticket, input/artifact hashes, base and subject HEAD, allowed scope, acceptance criteria, plan, and evidence. Reject a missing or changed review subject.
2. The parent resolves reviewers from actual runtime capabilities and user-configured mappings. Record the author's and reviewer's **actual model IDs and families**. Do not infer family from a role name or hardcode an ID.
3. For a required cross-family review, require reviewer family different from author family. **Same-family review, self-review, or human review cannot substitute**, even under deadline pressure. An unavailable or unverifiable family is `BLOCKED`.
4. The parent assigns separate spec and standards review tasks, in parallel when independent. Reviewers do not delegate and use read/search only; the parent/verifier supplies command evidence.
   - **Spec:** trace ticket/AC → approved design/contract → tests → implementation. Find omitted behavior, incorrect semantics, and unsupported completion claims.
   - **Standards:** inspect conventions, correctness, maintainability, error paths, authentication boundaries, and tests that could pass for the wrong reason.
5. Return findings with severity (`blocking`, `should-fix`, `nit`), file/line, violated requirement or failure path, and requested resolution. Zero findings must include inspected scope and limitations.
6. The parent routes fixes to the owning role, then requests review of the new HEAD. Old review hashes cannot cover later changes.

## Bounded example

The configured different-family reviewer is unavailable and a human offers to approve release. Return `BLOCKED: required cross-family review unavailable`, identifying the missing capability. Preserve the human approval separately; it neither supplies model review nor repairs its absence.

## Stop and output

Return `DONE`, `BLOCKED`, or `NEEDS_HUMAN`; list the axis, reviewed base/HEAD and hashes, actual model/family identities, findings, and limitations. `DONE` means the review task completed, not that a gate passed; blocking findings prohibit progression.

Do not edit reviewed files or run commands from a read-only reviewer. Before phase progression, the parent runs `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>` and audits the review/diff binding.
