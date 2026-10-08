---
name: signoz-query-service
description: Use when mapping SigNoz query-service requests, interpreting telemetry responses, or preparing a bounded upstream Go patch.
---

# SigNoz Query-Service

## Required live documentation

Before technical advice, code, configuration or queries, follow the
[live-documentation protocol](../sdlc/references/live-documentation.md) and
**fetch the relevant official URLs** in [sources](references/sources.md) during
this task. Local guidance below defines project policy and verification questions,
not current upstream facts. Record fetched URL/section/date and matching version;
failed retrieval blocks dependent guidance rather than falling back to memory.

Query-service owns access to ClickHouse. The BFF consumes its supported API.

For OSS topology, collector/exporter compatibility, migrations or fork upgrades,
also load [signoz-oss](../signoz-oss/SKILL.md) as a phase-scoped reference.

Read the [shared principles](../sdlc/references/principles.md) and this plugin's `api-contract` skill through the native tool or exact `<PLUGIN_ROOT>/skills/api-contract/SKILL.md`.

## Procedure

1. Discover the actual pinned SigNoz repository revision/image and relevant OpenAPI, routes, or request structs. Record those sources and hashes. Query Builder versions and endpoints must be discovered; **do not assume v3, v4, or a URL from memory**.
2. Map each approved BFF operation to an available query mode: structured Query Builder, PromQL, or an explicitly authorized server-owned operation. Validate request and response examples against the pinned schema.
3. Confirm telemetry semantics from that revision: trace/span identifiers, resource/service attributes, metric temporality and units, log timestamps/severity, aggregation, nulls, and time precision. Do not infer physical table names from a generic OTel model.
4. Enforce authenticated tenant scope, bounded time ranges, limits, and query cost at the BFF boundary. Raw SQL is **not an untrusted browser feature**. Never forward arbitrary browser SQL, identifiers, tenant headers, or credentials.
5. Capture client contract tests and real integration evidence separately. Validate error mapping, empty responses, cancellation, and timeout behavior using approved representative data.
6. If upstream behavior requires a Go patch, document the pinned base, minimal diff, regression test, compatibility impact, and upstream tracking reference. Use existing Go tests/build commands with `go-testing` evidence; avoid unrelated refactors and retain a clear rebase/removal strategy.

## Bounded example

A copied request uses a field absent from the pinned query-service schema. Inspect the pinned route/struct and produce a corrected mapping plus contract test. Do not try guessed versioned URLs until one works or bypass the service with a ClickHouse connection.

## Stop and output

Output version provenance, operation/schema mapping, sanitized request/response examples, test evidence, and upstream patch tracking if applicable.

Unknown version/schema or unavailable real query-service is `BLOCKED` for the affected verification. If the API cannot safely express the requirement, return a design decision request; performance measurements do not authorize direct BFF-to-ClickHouse access.

In an SDLC run, return evidence to the conductor for state validation; standalone use needs no run state.
