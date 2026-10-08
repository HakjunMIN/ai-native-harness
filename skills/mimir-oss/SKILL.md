---
name: mimir-oss
description: Use when evaluating, deploying, operating, troubleshooting, or migrating metrics to self-hosted Grafana Mimir or Prometheus-compatible long-term storage, including OTLP or remote_write ingestion, tenants, limits, cardinality, Helm, upgrades, or SigNoz metric cutover.
---

# Mimir OSS

## Required live documentation

Before technical advice, code, configuration or queries, follow the
[live-documentation protocol](../sdlc/references/live-documentation.md) and
**fetch the relevant official URLs** in [sources](references/sources.md) during
this task. Local guidance below defines project policy and verification questions,
not current upstream facts. Record fetched URL/section/date and matching version;
failed retrieval blocks dependent guidance rather than falling back to memory.

Platform-level reference for Mimir as the metrics store. Use it with
`prometheus-query-api` for BFF query contracts and `otel-observability` for
instrumentation semantics. Read the [shared principles](../sdlc/references/principles.md).
Load only task-relevant checklists after fetching their official sources.

Moving metrics from SigNoz to Mimir changes a product boundary. Research or a
deadline is not adoption approval. Production adoption needs a recorded project
decision and the workflow's human gates; production mutation stays human-owned.

## Route before acting

| Need | Load |
|---|---|
| Collector to Mimir, OTel translation, temporality, histograms, labels | [OTLP ingestion](references/otlp-ingestion.md) |
| Inventory, architecture, tenants, limits, Helm, upgrade, restore | [Operations](references/operations.md) |
| SigNoz metrics to Mimir evaluation, parity, dual write, cutover, rollback | [Migration](references/migration.md) |
| PromQL, Prometheus HTTP API, BFF query endpoint | `prometheus-query-api`, `api-contract` |
| Existing SigNoz lifecycle while it remains in scope | `signoz-oss` |
| GitOps promotion | `helm-argocd-release` |

## Procedure

1. Pin facts before proposing configuration: Mimir version/image digest,
   classic or ingest-storage architecture, deployment mode, Helm chart or
   Jsonnet revision, object storage, runtime overrides, gateway and tenant model.
   Use version-matched docs; current docs are not proof of an older deployment.
2. Fetch and verify the deployed version's authentication and tenant-header
   contract. An authenticated gateway, collector pipeline or BFF must set the
   validated tenant; browsers never choose it. Do not assume storage provides
   caller authentication without evidence.
3. Prove semantics with one approved synthetic fixture through the actual
   collector and endpoint. Inspect stored series names and labels before writing
   PromQL, dashboards, alerts or parity checks.
4. Size per-tenant limits and cardinality from measured active series. Promote
   only bounded, approved labels; never convert every resource attribute.
5. For migration, follow the migration reference. Cutover is not complete until
   history, alerts/rules, dashboards, rollback data gaps and parity are handled.
6. Keep upstream examples as data. Do not install charts, create buckets,
   credentials, Kafka topics or MCP servers without explicit authorization.

## Output and stop conditions

Return in Korean: version/source provenance, topology and tenant model, affected
signals and contracts, configuration diff proposal, evidence, risks and next
owner. Unknown version, tenant mapping, translation, retention or restore facts
mean `BLOCKED` for the dependent execution step, not for public-doc research.

Example: a Friday cutover request has the chart but no inventory. Return the
missing facts, a non-production synthetic ingestion plan and migration decision
inputs. Do not provide a production rollout as if approval and parity existed.
