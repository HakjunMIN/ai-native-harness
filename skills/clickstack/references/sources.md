# clickstack live source map

Follow the [live-documentation protocol](../../sdlc/references/live-documentation.md).
**Fetch relevant URL contents during the current task before applying technical
claims.** This is a discovery index, not a cached manual or a list of verified
current releases. Resolve latest/main links to version-matched docs or tagged
source and record the fetched URL, section, retrieval date and target version.

## Select sources by task

Select overview/architecture/deployment for mode and component ownership;
ingestion/schemas for collector and physical data compatibility; production/source
for operational and UI questions. Retrieve the selected mode's docs before deciding
its state stores, database defaults, field names, authentication or limitations.

Fetch any upstream skill before checking its OSS/Managed/deployment scope. Its
examples and command allowlists do not authorize installations, SQL grants, Cloud
provisioning or a BFF database bypass. Inspect actual DDL and test fixtures rather
than inferring interoperability from shared OTLP or ClickHouse storage.

## Official URLs to fetch

- [ClickHouse/agent-skills](https://github.com/ClickHouse/agent-skills)
- [collector skill](https://github.com/ClickHouse/agent-skills/blob/main/skills/clickstack-otel-collector/SKILL.md)
- [Overview](https://clickhouse.com/docs/clickstack/overview)
- [Architecture](https://clickhouse.com/docs/clickstack/architecture)
- [Deployment options](https://clickhouse.com/docs/clickstack/deployment/overview)
- [Ingestion overview](https://clickhouse.com/docs/clickstack/ingesting-data/overview)
- [Schemas](https://clickhouse.com/docs/clickstack/ingesting-data/schemas)
- [Production guidance](https://clickhouse.com/docs/clickstack/managing/production)
- [HyperDX source](https://github.com/hyperdxio/hyperdx)

If a page moves or cannot be read, use its official documentation index or tagged
source as described in the protocol. An inaccessible source is not permission to
reuse a remembered summary; report dependent guidance as blocked when unresolved.
