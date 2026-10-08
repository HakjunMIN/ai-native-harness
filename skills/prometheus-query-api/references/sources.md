# prometheus-query-api live source map

Follow the [live-documentation protocol](../../sdlc/references/live-documentation.md).
**Fetch relevant URL contents during the current task before applying technical
claims.** This is a discovery index, not a cached manual or a list of verified
current releases. Resolve latest/main links to version-matched docs or tagged
source and record the fetched URL, section, retrieval date and target version.

## Select sources by task

Select the HTTP API for request/response contracts; basics/functions/naming for
PromQL; Mimir API/configuration/authentication for a Mimir deployment. Prometheus
compatibility is not proof of identical limits, errors or feature support.
Verify actual series and the pinned server after retrieving documentation.
Optional MCP query access is separate from public documentation retrieval.

## Official URLs to fetch

- [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/)
- [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [PromQL functions](https://prometheus.io/docs/prometheus/latest/querying/functions/)
- [UTF-8 names](https://prometheus.io/docs/guides/utf8/)
- [Mimir HTTP API](https://grafana.com/docs/mimir/latest/references/http-api/)
- [Mimir configuration parameters](https://grafana.com/docs/mimir/latest/configure/configuration-parameters/)
- [Mimir authentication](https://grafana.com/docs/mimir/latest/manage/secure/authentication-and-authorization/)
- [Grafana Prometheus datasource](https://grafana.com/docs/grafana/latest/datasources/prometheus/)
- [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana)

If a page moves or cannot be read, use its official documentation index or tagged
source as described in the protocol. An inaccessible source is not permission to
reuse a remembered summary; report dependent guidance as blocked when unresolved.
