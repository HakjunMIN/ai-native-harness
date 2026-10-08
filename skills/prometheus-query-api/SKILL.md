---
name: prometheus-query-api
description: Use when a BFF, Grafana plugin, dashboard, alert, or migration needs PromQL or the Prometheus-compatible HTTP query API, including Grafana Mimir query-frontend, instant or range queries, metric metadata, tenant headers, query limits, response or error mapping, or SigNoz-to-PromQL translation.
---

# Prometheus Query API

## Required live documentation

Before technical advice, code, configuration or queries, follow the
[live-documentation protocol](../sdlc/references/live-documentation.md) and
**fetch the relevant official URLs** in [sources](references/sources.md) during
this task. Local guidance below defines project policy and verification questions,
not current upstream facts. Record fetched URL/section/date and matching version;
failed retrieval blocks dependent guidance rather than falling back to memory.

Prometheus-compatible querying behind the product boundary: Grafana -> BFF (Spring
or Go) -> Mimir or Prometheus query API. Read the
[shared principles](../sdlc/references/principles.md) and this plugin's
`api-contract` skill. Load `mimir-oss` for storage, ingestion,
tenancy or migration operations.

## Route before acting

| Need | Load |
|---|---|
| BFF endpoint, client, tenant header, limits, errors or tests | [BFF contract](references/bff-contract.md) |
| PromQL translation, histograms, rates, labels or parity | [PromQL semantics](references/promql-semantics.md) |
| SigNoz parity or cutover evidence | `mimir-oss` and its migration reference |
| Spring implementation and test style | `spring-boot-bff`, `spring-testing` |
| Go implementation and test style | `go-backend`, `go-testing` |
| Grafana datasource or panel behavior | `grafana-plugin-dev` |

## Procedure

1. Discover the pinned server, version, Prometheus HTTP prefix and enabled
   features from fetched server-specific documentation and deployed configuration;
   do not assume an upstream HTTP prefix or default.
2. Map each approved product operation to a server-owned query template.
   Accept typed parameters, not browser PromQL, tenant IDs or upstream URLs.
3. Inspect actual series and labels for every metric. Do not infer names,
   suffixes or labels from OTel semantic conventions.
4. Bound time range, step, series, label matchers, timeout and cost at the BFF.
   Verified authentication determines the tenant header.
5. Return a versioned BFF response and stable ProblemDetail errors. Preserve
   meaningful upstream warnings and distinguish client, query, limit, timeout
   and availability failures.
6. Keep unit, stubbed contract and real Mimir integration evidence separate.

Arbitrary PromQL is a separate product decision. It needs a threat and cost
review, explicit tenant isolation evidence and approved limits. A frontend
request or deadline is not that decision.

## Output and stop conditions

Return in Korean: server/version provenance, operation-to-query mapping,
sanitized request/response examples, error mapping, limits, test evidence and
unresolved semantic differences. Unknown prefix, tenant mapping, metric names
or real API behavior blocks the dependent verification.

Example: a panel needs p95 latency by service. Inspect the real histogram series
and service label, add a typed BFF operation and test it with a synthetic
fixture. Do not expose a raw `query` field to make the panel generic.
