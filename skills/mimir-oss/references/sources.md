# mimir-oss live source map

Follow the [live-documentation protocol](../../sdlc/references/live-documentation.md).
**Fetch relevant URL contents during the current task before applying technical
claims.** This is a discovery index, not a cached manual or a list of verified
current releases. Resolve latest/main links to version-matched docs or tagged
source and record the fetched URL, section, retrieval date and target version.

## Select sources by task

Select architecture/authentication for topology and tenancy; collector/configuration
for ingestion semantics; chart/releases/migration/tools for operations. Fetch only
what the task needs. Derive recommendations, defaults, supported modes and upgrade
hops from those fetched pages, never from a review date in this repository.

For SigNoz migration, also retrieve the source system's matching documentation.
Do not assume any upstream migration guide proves cross-product compatibility.
Optional MCP tools require installed, authorized access to the intended instance;
public documentation retrieval does not grant administration permissions.

## Official URLs to fetch

- [Architecture overview](https://grafana.com/docs/mimir/latest/get-started/about-grafana-mimir-architecture/)
- [Ingest storage](https://grafana.com/docs/mimir/latest/get-started/about-grafana-mimir-architecture/about-ingest-storage-architecture/)
- [Classic architecture](https://grafana.com/docs/mimir/latest/get-started/about-grafana-mimir-architecture/about-classic-architecture/)
- [Deployment modes](https://grafana.com/docs/mimir/latest/references/architecture/deployment-modes/)
- [Components](https://grafana.com/docs/mimir/latest/references/architecture/components/)
- [Authentication and authorization](https://grafana.com/docs/mimir/latest/manage/secure/authentication-and-authorization/)
- [Tenant IDs](https://grafana.com/docs/mimir/latest/configure/about-tenant-ids/)
- [OTel Collector to Mimir](https://grafana.com/docs/mimir/latest/configure/configure-otel-collector/)
- [Configuration parameters](https://grafana.com/docs/mimir/latest/configure/configuration-parameters/)
- [Native histogram ingestion](https://grafana.com/docs/mimir/latest/configure/configure-native-histograms-ingestion/)
- [Out-of-order samples](https://grafana.com/docs/mimir/latest/configure/configure-out-of-order-samples-ingestion/)
- [Runtime configuration](https://grafana.com/docs/mimir/latest/configure/about-runtime-configuration/)
- [HTTP API](https://grafana.com/docs/mimir/latest/references/http-api/)
- [mimir-distributed Helm chart](https://grafana.com/docs/helm-charts/mimir-distributed/latest/)
- [Versioning](https://grafana.com/docs/mimir/latest/configure/about-versioning/)
- [Releases](https://github.com/grafana/mimir/releases)
- [mimirtool](https://grafana.com/docs/mimir/latest/manage/tools/mimirtool/)
- [Migration guides](https://grafana.com/docs/mimir/latest/migration-guide/)
- [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana)

If a page moves or cannot be read, use its official documentation index or tagged
source as described in the protocol. An inaccessible source is not permission to
reuse a remembered summary; report dependent guidance as blocked when unresolved.
