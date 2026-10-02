# Mimir primary-source map

Reviewed: 2026-10-02. Latest observed release: `mimir-3.2.1`. Links to `latest`
or `main` are discovery entrypoints. For a run, record the fetched URL, heading,
access date, deployed version and the claim each source supports. Use the
matching versioned docs or tag when behavior matters.

## Architecture and tenancy

| Source | Verify |
|---|---|
| [Architecture overview](https://grafana.com/docs/mimir/latest/get-started/about-grafana-mimir-architecture/) | Components, object storage backends and write/read paths |
| [Ingest storage](https://grafana.com/docs/mimir/latest/get-started/about-grafana-mimir-architecture/about-ingest-storage-architecture/) | Since 3.0 the preferred architecture uses Kafka or a Kafka-compatible system; check the deployed architecture |
| [Classic architecture](https://grafana.com/docs/mimir/latest/get-started/about-grafana-mimir-architecture/about-classic-architecture/) | Supported in 3.0 but planned for future deprecation |
| [Deployment modes](https://grafana.com/docs/mimir/latest/references/architecture/deployment-modes/) | Monolithic or microservices; do not assume an older read-write mode is still documented |
| [Components](https://grafana.com/docs/mimir/latest/references/architecture/components/) | Distributor, ingester, querier, query-frontend, scheduler, store-gateway, compactor and optional services |
| [Authentication and authorization](https://grafana.com/docs/mimir/latest/manage/secure/authentication-and-authorization/) | `X-Scope-OrgID`, pipe-separated federation, anonymous tenant and required authenticating proxy |
| [Tenant IDs](https://grafana.com/docs/mimir/latest/configure/about-tenant-ids/) | Length, allowed characters and reserved IDs |

## Ingestion, limits and configuration

| Source | Verify |
|---|---|
| [OTel Collector to Mimir](https://grafana.com/docs/mimir/latest/configure/configure-otel-collector/) | OTLP is recommended; `otlphttp` to `/otlp`; `job`, `instance` and `target_info` mapping |
| [Configuration parameters](https://grafana.com/docs/mimir/latest/configure/configuration-parameters/) | Version-specific defaults for OTel translation, delta ingestion, native histograms, limits and prefixes |
| [Native histogram ingestion](https://grafana.com/docs/mimir/latest/configure/configure-native-histograms-ingestion/) | Exponential histogram acceptance and query requirements |
| [Out-of-order samples](https://grafana.com/docs/mimir/latest/configure/configure-out-of-order-samples-ingestion/) | Instance and tenant out-of-order windows |
| [Runtime configuration](https://grafana.com/docs/mimir/latest/configure/about-runtime-configuration/) | Per-tenant overrides and reload behavior |
| [HTTP API](https://grafana.com/docs/mimir/latest/references/http-api/) | Write, query, build information and cardinality endpoints |

## Operations and migration

| Source | Use |
|---|---|
| [mimir-distributed Helm chart](https://grafana.com/docs/helm-charts/mimir-distributed/latest/) | Chart-specific values, release notes and upgrade guidance |
| [Versioning](https://grafana.com/docs/mimir/latest/configure/about-versioning/) | Stability and deprecation policy for flags and features |
| [Releases](https://github.com/grafana/mimir/releases) | Breaking changes for every hop |
| [mimirtool](https://grafana.com/docs/mimir/latest/manage/tools/mimirtool/) | Rules, analysis, config conversion, bucket checks and block backfill |
| [Migration guides](https://grafana.com/docs/mimir/latest/migration-guide/) | Prometheus, Thanos, Cortex and ingest-storage migrations |

No official guide covers SigNoz-to-Mimir metric migration. Treat Prometheus or
Thanos guides as partial inputs. They do not prove SigNoz schema, Query Builder
or alert semantics.

## Existing tools

[grafana/mcp-grafana](https://github.com/grafana/mcp-grafana) can query
Prometheus-compatible datasources and metadata. Use it only when installed,
authorized and connected to the correct tenant. It is not Mimir administration,
does not replace version inventory, and must not send private data to an
unapproved endpoint.
