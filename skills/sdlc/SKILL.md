---
name: sdlc
description: Use when a Jira ticket needs an end-to-end local SDLC workflow, a status check, or resumption after a session handoff.
---

# SDLC conductor

**Required:** Read [protocol](references/protocol.md).

With no ticket key, list `docs/sdlc/*/state.json` phases and blockers, without
creating work. With a key, validate it and check repository setup. Invoke
`sdlc-setup` if missing; never guess service paths or model availability.

For a new ticket invoke `sdlc-discover`. For an existing ticket run `state.mjs check`
then `next`. On stale evidence, explain the earliest invalid gate and invalidate
it through the protocol, preserving the audit trail. Do not repair by marking pass.

| State phase | Invoke |
|---|---|
| discover | sdlc-discover |
| plan | sdlc-plan |
| implement | sdlc-implement |
| verify | sdlc-verify |
| release | sdlc-release |
| done | report actual release or spike outcome |

Route one phase at a time. Continue automatically only across agent-owned gates.
At G1/G2/G5b request explicit human approval through the host question tool and
stop if absent. Return BLOCKED on unavailable dependencies or model routing.
Do not turn a background agent launch into a completion claim.

Use `sdlc-handoff` before session changes. All specialists receive the handoff
contract and exact skill references. You own shared state; validate results and
allowed-path diffs before accepting them. Final report in Korean: phase, evidence,
Jira sync status, next human action. A production PR is not a deployment.
