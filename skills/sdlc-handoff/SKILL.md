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
code, unfinished changes, current evidence, Jira outbox status, running process
ownership, exact allowed paths and one next action. Reference files rather than
copying huge logs or private tokens into the summary.

New session: open this handoff and state, verify hashes and source revision,
invoke `sdlc` with the ticket key. Never resume from “all green” prose alone.
If source, contracts, approvals or evidence changed, invalidate the earliest
affected gate. No fresh approval is implied by a session summary.

Return Korean summary with path and explicit BLOCKED/NEEDS_HUMAN status when
applicable. End only processes owned by this ticket; do not kill by process name.
