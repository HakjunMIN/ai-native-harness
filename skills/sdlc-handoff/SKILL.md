---
name: sdlc-handoff
description: Use when switching sessions or agents, nearing context limits, or pausing a blocked SDLC run.
---

# Durable handoff

Read [protocol](../sdlc/references/protocol.md) and use
[handoff template](../../templates/handoff.md).

Read state and run the checker. Preserve errors as blockers, never change gates
just to make a summary green. Write the next unused `handoff-<n>.md` in the run
directory; never overwrite prior handoffs.

Resolve the conductor state with the installed `scripts/harness.mjs resolve STATE`.
Include its `harness.lock.json` path/hash, content SHA256, source commit if known,
resolved snapshot root and exact role/skill paths. Every sub task inherits this
lock. The next session resolves again rather than trusting a machine-specific
path in an older handoff. Never switch shared discovery links or downgrade common
safety hooks to resume a ticket. See [ticket revisions](../sdlc/references/harness-revisions.md).

Include run ID/phase/sub task ID, user goal, current base/head, actual models/families,
approved artifact paths and hashes, decisions and non-goals, last command/exit
code, unfinished changes, current evidence, Jira outbox status if applicable, running process
ownership, exact allowed paths and one next action. Reference files rather than
copying huge logs or private tokens into the summary.
For implementation, include the authoritative conductor state path, integration branch, active worktree paths and
branches, base/slice HEADs, edit scopes, merge status and any unresolved conflicts.
Reconcile recorded workspaces before a new assignment; never start duplicates.

Include intake kind/request evidence, approved policy, verification mode, review
eligibility and manifest. Local work uses the local ID and has no Jira sync;
Jira light uses the parent key, while Jira strict includes local-ID/Jira-key mapping, pending/unknown/
stale publication intents and last readback, plus ready/in-progress sub task IDs.
Include impact-analysis hash and retained/invalidated slice IDs when selectively
revalidating. Keep ambiguous creates visible so a new session reconciles instead of duplicating
issues. Exact paths/commands belong to the current execution handoff, not the
long-lived sub task definition.

Include the Project baseline, approved shared decisions, exception owners/expiry,
drift evidence and pending migrations using
[project governance](../sdlc/references/project-governance.md). For existing runs
without a baseline, carry the new comparison report rather than editing approved
artifacts. The next session checks relevant shared-document changes before work;
a matching state hash alone does not establish that project rules are unchanged.

New session: open this handoff and state, verify hashes and source revision,
invoke `sdlc` with the Jira key or local ID. Never resume from “all green” prose alone.
If source, contracts, approvals or evidence changed, invalidate the earliest
affected gate. No fresh approval is implied by a session summary.

Return Korean summary with path and explicit BLOCKED/NEEDS_HUMAN status when
applicable. End only processes owned by this run; do not kill by process name.
