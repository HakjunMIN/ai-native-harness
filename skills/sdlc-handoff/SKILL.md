---
name: sdlc-handoff
description: Use when switching sessions or agents, nearing context limits, or pausing a blocked SDLC ticket.
---

# Durable handoff

Read [protocol](../sdlc/references/protocol.md) and use
[handoff template](../../templates/handoff.md).

Read state and run the checker. Preserve errors as blockers, never change gates
just to make a summary green. Write the next unused `handoff-<n>.md` in the ticket
directory; never overwrite prior handoffs.

Include ticket/phase/slice, user goal, current base/head, actual models/families,
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
stale publication intents and last readback, plus ready/in-progress ticket IDs.
Include impact-analysis hash and retained/invalidated slice IDs when selectively
revalidating. Keep ambiguous creates visible so a new session reconciles instead of duplicating
issues. Exact paths/commands belong to the current execution handoff, not tracker
ticket text.

New session: open this handoff and state, verify hashes and source revision,
invoke `sdlc` with the Jira key or local ID. Never resume from “all green” prose alone.
If source, contracts, approvals or evidence changed, invalidate the earliest
affected gate. No fresh approval is implied by a session summary.

Return Korean summary with path and explicit BLOCKED/NEEDS_HUMAN status when
applicable. End only processes owned by this ticket; do not kill by process name.
