---
name: sdlc-plan
description: Use when a Jira ticket or local request has approved discovery and needs an implementation design, contracts, outcomes, and a test matrix.
---

# Plan

Read [protocol](../sdlc/references/protocol.md). Run state check; require `next=plan`
and G1 passed with unchanged artifact hashes. An urgent ticket is not an exception.

Before asking about CI or deployed state, read it: `gh run list|view --log`,
`gh pr checks`, `az … show|list`, `kubectl get`, `helm get values`.

Use `sdlc-architect` for architecture/decomposition; a light plan may be written
directly by the conductor. Load domain/API/stack references only when relevant.
The author writes `02-plan.md`; update `openapi.yaml` when contracts change. Follow
[project governance](../sdlc/references/project-governance.md): write cross-feature
decisions in project ADRs and current shared rules in project standards. Keep
feature-only decisions in the plan or a run-local ADR; routine choices need no ADR.
Include a Project baseline section with applicable document paths/sections, actual
baseline commits (content hashes for uncommitted inputs), status/owner and exceptions.
Record registered external decisions in the baseline's external rows, with their
approval evidence and original revision or content hash, never a made-up Git commit.
Do not copy shared rules into every plan. Shared changes and exceptions need
explicit project-owner approval before dependent G2 approval; feature G2 alone
does not approve project policy. Include affected standards, overview and indexes
in the approved edit scope when changing a shared decision.
For SigNoz lifecycle/collector/schema work, include `signoz-oss`; for explicit
ClickStack/HyperDX research or an existing in-scope deployment, include `clickstack`.
For Mimir/Prometheus metrics storage or migration include `mimir-oss`; for PromQL
or Prometheus query API contracts include `prometheus-query-api`. For Go backend
modules include `go-backend` and `go-testing`.
An alternative-stack study does not authorize changing the product boundary.

The plan includes:

| Section | Required detail |
|---|---|
| Architecture | alternatives, chosen boundary, C4 where architectural, BFF -> query-service |
| Contracts | plugin/BFF payloads, auth/tenant handling, error/time semantics, pinned upstream mapping |
| Sub tasks | canonical outcome/AC definitions and blockers; light uses one sub task without a child Jira issue, strict generates detailed views |
| Test matrix | each AC -> unit/integration/API or FE Gherkin/E2E test, environment and fixtures; per `policy.verification.e2e`, map each UI AC to `playwright-bdd` (Grafana) or `playwright` (other web UI) and list the smoke suite and BFF/API consumer flows |
| Quality | per module lint, format-check and typecheck command or non-applicability reason |
| UX | chosen variant, real Grafana evidence, accessibility/visual checks |
| Release | immutable artifact, chart changes, compatibility, rollback and human-owned prod step |

For a contract-2 plan with multiple sub tasks, allocate every material plan risk
to all affected task `risks` arrays; use `[]` for standard-risk tasks. The
independent strict plan review validates this classification and traceability.
`tasks.mjs prepare` rejects missing or inconsistent mappings. A mapped risk
requires independent slice spec/standards review before completion; routine
slices retain task tests and quality checks but no per-slice AI review. Single-task
plans keep their existing review behavior.
| Proceed agreement | contract-2: continue scope, plan-specific stop conditions added to the critical list, separate approvals ([autonomous execution](../sdlc/references/protocol.md#autonomous-execution)) |

After the design, use `sdlc-subtasks` draft mode. Write one authoring definition and
run `tasks.mjs prepare`; it snapshots config/risk policy, generates immutable
manifest/documents and records hashes/pending slices. Contract-2 runs
(`runContract: 2` in the lock) also assess `quality.modules` for every task per
[code quality](../sdlc/references/code-quality.md); prepare binds the exact commands
or N/A reasons into `policy.quality`. Do not hand-copy ACs into
Markdown. Review policy, granularity, AC coverage and blockers with the
human. Small bounded work can be one sub task; DB/API/UI-only division
is not a vertical outcome. Resolve precise file allowlists and commands at
implementation handoff from current code, keeping long-lived sub tasks behavior/contract focused.
Reuse Gradle/Go/JS tooling. Do not schedule backend Gherkin or direct ClickHouse.

Strict/legacy plans require independent `code-review` with a reviewer model
different from the planner's when `requireDifferentModel` is true (new default;
same family allowed). Different-family review is recommended; enforce explicit
`requireDifferentFamily: true` and legacy requirements; human review needs policy
permission. Plan review gets at most 2 rounds; remaining blockers go to the human
at G2 (accept with follow-ups, fix once more, descope). Attach provenance. Light plans do not
require a separate model review; the human still approves policy and scope at G2.

Contract-2 plans resolve non-critical questions with the recommendation and log
them in `decisions.md` ([autonomous execution](../sdlc/references/protocol.md#autonomous-execution));
stop only for the critical escalation list. With the `plan-commit` grant, commit the
approved plan without asking. Present plan, detailed sub task set, dependency graph,
review, the plan decision log, the quality and verification policy and the proceed
agreement to the human for G2; the human may add stop conditions in the same form.
Approval binds to current discovery, contracts, plan, policy and `taskPlan` hashes;
Jira strict approval authorizes publication of that sub task set as Jira child tickets; local
plans do not authorize or require Jira publication. G2 evidence
must contain the manifest reference (contract 2: also the hashed `02-plan.md`); its
document hashes are checked transitively.
No creation or implementation before approval. After G2, use `state.mjs next`:
local and Jira light go to implement, Jira strict/legacy to publish. A changed
requirement first
invalidates G1; changing a reviewed plan invalidates G2 and all downstream evidence.
