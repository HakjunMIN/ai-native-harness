---
name: signoz-oss
description: Use when assessing, customizing, troubleshooting, or planning upgrades for self-hosted SigNoz OSS, its collector, telemetry schema migrations, or upstream fork.
---

# SigNoz OSS

## Required live documentation

Before technical advice, code, configuration or queries, follow the
[live-documentation protocol](../sdlc/references/live-documentation.md) and
**fetch the relevant official URLs** in [sources](references/sources.md) during
this task. Local guidance below defines project policy and verification questions,
not current upstream facts. Record fetched URL/section/date and matching version;
failed retrieval blocks dependent guidance rather than falling back to memory.

Use this platform-level reference alongside `signoz-query-service`, not instead
of its API contract checks. Read [shared principles](../sdlc/references/principles.md) and
[source map](references/sources.md). Load references once; run only the current
SDLC phase. Research may finish with unknowns; execution claims require evidence.

## Route before acting

| Need | Required reference or skill |
|---|---|
| OSS topology, collector, upgrade, fork | This skill and [operations guide](references/operations.md) |
| BFF API mapping or bounded Go patch | `signoz-query-service`, `api-contract` |
| Instrumentation and signal semantics | `otel-observability` |
| Product docs, queries, alerts | Relevant **official** `SigNoz/agent-skills` reference from the source map |
| GitOps promotion | `helm-argocd-release`; human-owned production |
| Explicit alternative-stack evaluation | `clickstack`; never a default dependency |

## Procedure

1. Inventory the installed application/fork commit, collector, migrator, chart
   and ClickHouse versions/digests, deployment mode, metadata store and volumes.
   Record OSS/enterprise boundaries from the pinned code/license and official
   feature documentation; self-hosted does not imply every feature is free OSS.
2. Map actual processes from manifests and fetched version-matched architecture
   docs/source. Do not infer bundled services or invent source paths. Our logical
   boundary remains Grafana -> BFF (Spring or Go) -> supported SigNoz API. Do not expose
   SigNoz UI or add direct BFF-to-ClickHouse access.
3. Follow synthetic telemetry through receiver, processors, exporter, storage
   and API. Inspect the pinned collector's registered components and active
   static/OpAMP configuration. Check auth/TLS, queues, dropped/retried records,
   cardinality, resource attributes, temporality and time units. A listening
   OTLP port is not end-to-end evidence.
4. For upgrades, use the official upgrade-path tool and **every required stop**.
   Inspect the pinned migration runner, ordering, completion criteria and
   compatibility before changing images. Rehearse backup/restore for telemetry
   AND application metadata. Image rollback does not undo schema migrations.
5. For fork changes, keep the diff small, preserve license notices, document
   upstream base/tracking/removal conditions, and use repository Go regression
   tests. Backend BFF tests remain JUnit/API (Go tests for a Go BFF); FE behavior uses existing BDD/TDD.
6. Reuse official skills only after checking installation, revision and scope.
   Missing MCP does not block public-doc research. It blocks required live
   observations. Never auto-install a plugin, upgrade an MCP server, grant
   privileges or switch to a cloud endpoint to satisfy a reference.

## Output and stop conditions

Return Korean version/source provenance, component map, affected contract/schema,
reproduction or upgrade plan, test/restore evidence and unresolved risks using the
handoff. Unknown required migration/edition/API facts mean `BLOCKED` for execution.
Verify feature availability and licensing from fetched version-matched sources
before promising any capability in OSS.

Example: collector replacement receives spans but queries return nothing. Check
exporter/schema/API alignment with one synthetic trace before any migration or
restart. Retain evidence rather than claiming success from receiver health.
