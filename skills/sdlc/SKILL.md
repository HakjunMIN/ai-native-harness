---
name: sdlc
description: Use when a Jira ticket or local request needs an end-to-end SDLC workflow, a status check, or resumption after a session handoff.
---

# SDLC conductor

**Required:** Read [protocol](references/protocol.md).

With no ID or new request, list `docs/sdlc/*/state.json` phases and blockers,
without creating work. For a new request without Jira, use the user's existing written scope or
ask for it if missing, then create a local ID with
`intake.mjs start local-<slug> REQUEST_FILE [REPO_ROOT]`.
Never invent the request or mark G0/G1 passed. With an ID, check repository setup;
invoke `sdlc-setup` if missing, without requiring Jira mappings for local work.

For a new ticket invoke `sdlc-discover`. For an existing ticket run `state.mjs check`
then `next`. On stale evidence, explain the earliest invalid gate and invalidate
it through the protocol, preserving the audit trail. Do not repair by marking pass.

| State phase | Invoke |
|---|---|
| discover | sdlc-discover |
| plan | sdlc-plan |
| publish | sdlc-tickets (publish mode) |
| implement | sdlc-implement |
| verify | sdlc-verify |
| release | sdlc-release |
| done | report actual release or spike outcome |

Route one phase at a time. Continue automatically only across agent-owned gates.
Plan snapshots risk/review policy before G2. Local work uses its local ID and
routes directly to implementation, even when strict. Jira light uses the parent
issue; Jira strict/legacy publishes child tickets.
`publish` is a phase, not a new human gate. Never treat
local ticket drafts or an outbox as successfully published work.
At G1/G2/G5b request explicit human approval through the host question tool and
stop dependent work if absent. Return BLOCKED for required unavailable dependencies
or routing, without stopping unrelated authorized work.
Do not turn a background agent launch into a completion claim.

Use `sdlc-handoff` before session changes. All specialists receive the handoff
contract and exact skill references. You own shared state; validate results and
allowed-path diffs before accepting them. Final report in Korean: phase, evidence,
Jira sync status only for Jira runs (local runs: not applicable), and next human
action. A production PR is not a deployment.
