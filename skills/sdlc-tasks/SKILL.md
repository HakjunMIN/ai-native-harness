---
name: sdlc-tasks
description: Use when a plan needs implementation tasks before G2 approval, or approved tasks need Jira publication and reconciliation before implementation.
---

# Implementation tasks and Jira publication

**Required:** Read the [protocol](../sdlc/references/protocol.md) and
[ticket contract](references/task-contract.md). Use `jira-sync` only for Jira
publication; local work has no remote writes.
This skill has draft and publish modes, not a new human approval gate.

## Draft: after design, before G2

Require `next=plan` and valid G1. The architect drafts; the conductor owns state.
Read the complete discovery, plan, contracts, UX decisions and relevant code.

1. Split into narrow **vertical outcomes**, each independently demonstrable or
   verifiable and small enough for one fresh agent context. A bounded task can
   remain one implementation task. Do not split a feature into DB/API/UI-only assignments.
   Necessary preparatory work must have its own verifiable result; broad refactors
   use green expand/migrate/contract steps, with genuine blocking edges.
2. Write one draft JSON using the [definition template](../../templates/task-plan.json).
   Include changeKind, risks, goal, scope/non-goals, parent AC references, local AC
   IDs, contract/UX references in details, verification and blockers. Non-behavior
   changes require verificationReason; do not relabel behavior to avoid RED.
   Keep exact edit allowlists and executable commands in implementation handoffs,
   resolved against current code, not in long-lived tracker prose.
3. Preserve stable positive IDs; never recycle retired IDs. Map ACs to applicable
   checks. The conductor runs `node <PLUGIN_ROOT>/scripts/tasks.mjs prepare
   <state> <config> <draft>`; it generates the canonical manifest, optional detailed
   Markdown and hashes, then updates state last. No approval or Jira effect occurs.
   Light requires one independent outcome and generates no child document. Use
   strict for decomposition. Do not manually edit generated views.
4. Present outcomes, granularity, AC coverage and dependency graph to the human.
   Resolve split/merge feedback. Include the manifest and documents in the
   policy-required plan review and human G2 approval. No publication or implementation yet.

## Publish: after G2, before implementation

Only Jira strict/legacy work enters this mode. Local work and Jira light skip it.
Require `next=publish`, valid G2 and unchanged manifest/document hashes.
Approval covers the exact implementation task set and its Jira publication to the configured
project, not permission escalation or parent closure.

1. Discover Jira creation fields, issue type, parent relation and blocking-link
   types. If missing, return `BLOCKED`/`NEEDS_HUMAN`; local task drafts are not Jira tickets.
2. In dependency order, reconcile the stable `sdlc:<PARENT>:ticket:<id>` marker.
   Persist intent **before** sending. Create or update only the approved content;
   establish parent and blocking relationships, then read back via `jira-sync`.
3. Record each confirmed Jira key, approved manifest hash, blocker keys and
   sanitized readback evidence in `publications`. On timeout preserve key/marker
   and `unknown`; never blindly create again. Partial publication stays `publish`.
4. After every Jira ticket is confirmed, set phase using `nextPhase` and run check.
   `state.mjs ready <state>` returns the pending implementation task frontier for
   `sdlc-implement`; mark the chosen task `in_progress` before dispatch.

Example: retry behavior depends on initial error display. Publish both Jira tickets
after G2, but execute the retry task only after the first task's evidenced completion.
Jira ticket creation is not task completion.

Return manifest/document hashes, ID-to-Jira mapping, publication gaps and next
owner. Changed implementation task scope invalidates G2; code-only G3 invalidation
preserves task identity and any Jira ticket mapping. Never turn outbox entries or
Jira status alone into readiness.
