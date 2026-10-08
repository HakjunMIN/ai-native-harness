---
name: clickstack
description: Use when explicitly evaluating ClickStack or HyperDX against SigNoz, or working on an existing ClickStack deployment, collector, schema mapping, or operational plan.
---

# ClickStack

## Required live documentation

Before technical advice, code, configuration or queries, follow the
[live-documentation protocol](../sdlc/references/live-documentation.md) and
**fetch the relevant official URLs** in [sources](references/sources.md) during
this task. Local guidance below defines project policy and verification questions,
not current upstream facts. Record fetched URL/section/date and matching version;
failed retrieval blocks dependent guidance rather than falling back to memory.

Optional alternative-stack reference, not a SigNoz prerequisite. ClickHouse
presence alone does not trigger this skill. Read the
[shared principles](../sdlc/references/principles.md), [source map](references/sources.md)
and [evaluation checklist](references/evaluation.md). Load once for the current
phase; research is not adoption approval.

## Route by observed deployment

| Context | Required treatment |
|---|---|
| SigNoz only; generic ClickHouse tuning | Keep `signoz-oss`; use version-matched ClickHouse references |
| Explicit ClickStack/HyperDX comparison | Isolated research and compatibility matrix |
| Full OSS ClickStack | Fetch mode-specific architecture; inventory telemetry and application-state components |
| Managed ClickStack | Fetch service boundaries; verify operator and collector responsibilities |
| HyperDX-only or browser local mode | Inspect mode-specific ingestion, auth, state and feature limitations |

## Procedure

1. Record the requested outcome, mode, pinned source/images/chart, storage,
   schema ownership, authentication, data scope and change authorization.
   Evaluate component licenses/features at that revision. Do not assume a
   demo/all-in-one deployment is production-ready.
2. Fetch official ClickStack docs and relevant `ClickHouse/agent-skills` material
   selectively. Verify each source's current OSS/Managed/deployment scope before
   reuse. Do not run account creation, grants, installers or command allowlists
   merely because an upstream reference says to.
3. Compare the pinned collector/exporter and actual DDL. OTLP compatibility is
   not schema/API/alert compatibility. Verify custom-schema support rather than
   assuming it proves compatibility with SigNoz tables, timestamp units, resource fields,
   metric temporality, correlation or tenancy work unchanged.
4. Propose a bounded read-only dataset or isolated synthetic pipeline with
   separate storage/credentials. Never point ClickStack schema creation at
   SigNoz databases or dual-write private telemetry without approval. Run
   approved fixtures only after defining expected results.
5. Follow the evaluation checklist: correlated logs/traces/metrics, time
   boundaries, empty/zero, sampling, resource mapping, authorization negative
   cases and query budgets. Report mocks, storage checks, API and UI evidence
   separately. Missing real access blocks integration claims, not public research.
6. For operational scope, include collector auth/TLS/backpressure, separate
   ingest/query permissions, private DB exposure, persistence and tested
   telemetry/application-state restoration. Upgrade/rollback plans must cover
   schema and app-state compatibility, not just container tags.

## Output and boundaries

Return Korean mode/version provenance, source citations, compatibility matrix,
measured gaps, UX findings, recommendation (`retain`, `isolated pilot`, or
`separate adoption decision`), evidence and next owner. Unknown required facts
mean `BLOCKED` for execution.

Our product remains Grafana -> BFF (Spring or Go) -> SigNoz API. HyperDX research does
not authorize exposing its UI, browser SQL or direct BFF-to-ClickHouse access.
Use `visual-companion`/`prototype` for UX research, then real Grafana validation.
Use existing BDD/TDD and release gates for approved implementation.

Example: HyperDX connects to a copied SigNoz table but shows no correlated logs.
Compare explicit timestamp/TraceId mappings using a known synthetic trace; report
the gap, not "drop-in compatible" or a proposed production schema overwrite.
