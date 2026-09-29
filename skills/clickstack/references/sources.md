# ClickStack primary-source map

Reviewed: 2026-09-28. Current docs and `main` links are discovery references.
For each applied claim record the fetched URL/heading/date and exact target
version; bind code/DDL evidence to a commit or image digest. Current samples
are not contracts for an older deployment.

## Existing official skills and reuse

The official [ClickHouse/agent-skills](https://github.com/ClickHouse/agent-skills)
catalog includes `clickhouse-best-practices`, `clickhouse-architecture-advisor`
and `clickstack-otel-collector`. Prefer these installed, scope-compatible skills
for their specialty rather than reproducing their SQL/engine rule catalogs.
Public references remain usable without installing a plugin.

The inspected [collector skill](https://github.com/ClickHouse/agent-skills/blob/main/skills/clickstack-otel-collector/SKILL.md)
explicitly covers **Managed ClickStack on ClickHouse Cloud**: a new local
Docker/Compose collector or configuration for an existing gateway. Full
Kubernetes deployment is out of its scope. Its schema/database defaults and
Cloud operations must not be transplanted into a SigNoz or OSS database.

Useful concepts: dedicated ingestion identity, keeping secrets out of chat and
command output, rich synthetic telemetry and verification in the destination UI.
Do not import its broad command allowlists, installer commands, Cloud account
operations or SQL grants as authorization. Missing tools are capability gaps,
not permission to provision infrastructure or alter the host configuration.

## Task-to-source routing

| Task | Primary source | Applicability |
|---|---|---|
| Identify the stack | [Overview](https://clickhouse.com/docs/clickstack/overview) | ClickStack combines a telemetry store, collection and HyperDX UX; not another name for ClickHouse |
| Inventory component ownership | [Architecture](https://clickhouse.com/docs/clickstack/architecture) | Full OSS includes MongoDB application state; Managed has a different ownership model |
| Choose or identify mode | [Deployment options](https://clickhouse.com/docs/clickstack/deployment/overview) | All-in-one, Helm, Compose, managed, HyperDX-only and browser local mode have different limits |
| Follow OTLP ingestion | [Ingestion overview](https://clickhouse.com/docs/clickstack/ingesting-data/overview) | Both OSS and managed use a customer-run collector; verify actual endpoints/auth |
| Inspect physical schema | [Schemas](https://clickhouse.com/docs/clickstack/ingesting-data/schemas) | ClickHouse exporter tables, field types and custom-schema support; inspect pinned DDL |
| Production readiness | [Production guidance](https://clickhouse.com/docs/clickstack/managing/production) | Authentication, network exposure, persistence, sizing and operational concerns |
| UI implementation or custom sources | [HyperDX source](https://github.com/hyperdxio/hyperdx) | Pin commit, inspect source definitions, configuration and contribution/license requirements |
| SQL/schema optimization | [Official skills catalog](https://github.com/ClickHouse/agent-skills) | Engine-specific advice cannot authorize changing SigNoz-owned tables |

## Version-sensitive facts

Full OSS typically has ClickHouse telemetry plus MongoDB-backed dashboards,
alerts, users and saved visualizations. Do not omit MongoDB from restoration
because telemetry is in ClickHouse. Conversely do not invent a customer-managed
MongoDB for Managed ClickStack or the browser-only variant.

Schema docs illustrate `otel_logs`, `otel_traces` and metric-type tables with
case-sensitive fields such as `Timestamp`, `TraceId`, `SpanId`, `ServiceName`,
`ResourceAttributes`, `SpanAttributes` and `Duration`. Current schema docs and
the Managed collector skill can use different database defaults (`default` vs
`otel`). Discover the actual database and DDL; do not resolve this difference
by guessing or creating a new schema.

Local mode is for bounded single-user exploration and lacks production
authentication/alerting and backend persistence. HyperDX-only supports existing
ClickHouse/custom schemas but leaves ingestion and schema management to the user.
Connectivity alone proves neither semantic compatibility nor tenant isolation.

All-in-one is documented for non-production use. Published Docker ports can
invalidate ordinary host firewall assumptions. Inspect bindings and access
controls; never expose database, MongoDB or unauthenticated collector endpoints
just to make a demonstration work.
