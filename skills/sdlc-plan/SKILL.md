---
name: sdlc-plan
description: Use when a ticket has approved discovery and needs an implementation design, API contracts, vertical slices, and a test matrix.
---

# Plan

Read [protocol](../sdlc/references/protocol.md). Run state check; require `next=plan`
and G1 passed with unchanged artifact hashes. An urgent ticket is not an exception.

Dispatch `sdlc-architect` with discovery and versioned module context; require
`domain-context`, `api-contract`, and relevant stack skills. Architect writes
`02-plan.md`, ticket ADRs and `openapi.yaml` when contracts change.

The plan includes:

| Section | Required detail |
|---|---|
| Architecture | alternatives, chosen boundary, C4 where architectural, BFF -> query-service |
| Contracts | plugin/BFF payloads, auth/tenant handling, error/time semantics, pinned upstream mapping |
| Slices | ordered IDs, blocking dependencies, exact file scope, RED command/expected failure, GREEN command |
| Test matrix | each AC -> unit/integration/API or FE Gherkin/E2E test, environment and fixtures |
| UX | chosen variant, real Grafana evidence, accessibility/visual checks |
| Release | immutable artifact, chart changes, compatibility, rollback and human-owned prod step |

Each slice delivers observable behavior, not separate all-tests/all-code batches.
Reuse repository Gradle/JS commands and verify their selectors. Do not schedule a
backend Gherkin stack or direct ClickHouse shortcut.

Invoke `code-review` with `sdlc-cross-reviewer` using a confirmed family different
from the architect. Resolve blocking findings, attach provenance and report.
Unavailable model diversity means BLOCKED; a different alias is not diversity.

Present plan and review to the human for G2. Approval binds to the current discovery,
contracts and plan hashes. Populate pending slices without fabricated RED evidence.
Update state/Jira and return an implement handoff. A changed requirement first
invalidates G1; changing a reviewed plan invalidates G2 and all downstream evidence.
