---
name: sdlc-plan
description: Use when a Jira ticket or local request has approved discovery and needs an implementation design, contracts, outcomes, and a test matrix.
---

# Plan

Read [protocol](../sdlc/references/protocol.md). Run state check; require `next=plan`
and G1 passed with unchanged artifact hashes. An urgent ticket is not an exception.

Use `sdlc-architect` for architecture/decomposition; a light plan may be written
directly by the conductor. Load domain/API/stack references only when relevant.
The author writes
`02-plan.md`, task-specific ADRs and `openapi.yaml` when contracts change.
For SigNoz lifecycle/collector/schema work, include `signoz-oss`; for explicit
ClickStack/HyperDX research or an existing in-scope deployment, include `clickstack`.
An alternative-stack study does not authorize changing the product boundary.

The plan includes:

| Section | Required detail |
|---|---|
| Architecture | alternatives, chosen boundary, C4 where architectural, BFF -> query-service |
| Contracts | plugin/BFF payloads, auth/tenant handling, error/time semantics, pinned upstream mapping |
| Implementation tasks | canonical outcome/AC definitions and blockers; light uses one parent-only task, strict generates detailed views |
| Test matrix | each AC -> unit/integration/API or FE Gherkin/E2E test, environment and fixtures |
| UX | chosen variant, real Grafana evidence, accessibility/visual checks |
| Release | immutable artifact, chart changes, compatibility, rollback and human-owned prod step |

After the design, use `sdlc-tasks` draft mode. Write one authoring definition and
run `tasks.mjs prepare`; it snapshots config/risk policy, generates immutable
manifest/documents and records hashes/pending slices. Do not hand-copy ACs into
Markdown. Review policy, granularity, AC coverage and blockers with the
human. Small bounded work can be one implementation task; DB/API/UI-only division
is not a vertical outcome. Resolve precise file allowlists and commands at
implementation handoff from current code, keeping long-lived tasks behavior/contract focused.
Reuse Gradle/JS tooling. Do not schedule backend Gherkin or direct ClickHouse.

Strict/legacy plans require independent `code-review`. For new strict policy,
different-family review is recommended; a same-model independent session is valid
when `requireDifferentFamily` is false. Enforce explicit true and legacy requirements;
human review needs policy permission. Resolve blocking findings and attach provenance. Light plans do not
require a separate model review; the human still approves policy and scope at G2.

Present plan, detailed implementation task set, dependency graph and review to the human for G2.
Approval binds to current discovery, contracts, plan, policy and `taskPlan` hashes;
Jira strict approval authorizes publication of that task set as Jira child tickets; local
plans do not authorize or require Jira publication. G2 evidence
must contain the manifest reference; its document hashes are checked transitively.
No creation or implementation before approval. After G2, use `state.mjs next`:
local and Jira light go to implement, Jira strict/legacy to publish. A changed
requirement first
invalidates G1; changing a reviewed plan invalidates G2 and all downstream evidence.
