# Prometheus query source map

Reviewed: 2026-10-02. Use these as discovery entrypoints. Record the server,
version, fetched URL, heading, access date and claim for applied behavior.

| Source | Verify |
|---|---|
| [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/) | Instant and range query parameters, form POST, response envelope, warnings, infos and status codes |
| [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/) | Selectors, string escaping, time durations, staleness and native histogram samples |
| [PromQL functions](https://prometheus.io/docs/prometheus/latest/querying/functions/) | `rate`, `increase`, `histogram_quantile`, native histogram functions and `info` status |
| [UTF-8 names](https://prometheus.io/docs/guides/utf8/) | Quoted metric and label names in Prometheus 3.x |
| [Mimir HTTP API](https://grafana.com/docs/mimir/latest/references/http-api/) | Query-frontend endpoints, configurable prefix, build information and cardinality APIs |
| [Mimir configuration parameters](https://grafana.com/docs/mimir/latest/configure/configuration-parameters/) | Query limits, lookback delta, query sharding and tenant limits for the pinned version |
| [Mimir authentication](https://grafana.com/docs/mimir/latest/manage/secure/authentication-and-authorization/) | Tenant header and federation behavior |
| [Grafana Prometheus datasource](https://grafana.com/docs/grafana/latest/datasources/prometheus/) | Mimir compatibility and datasource configuration boundaries |
| [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana) | Optional authorized PromQL and metadata exploration |

Prometheus docs describe Prometheus server behavior. Mimir is
Prometheus-compatible but has its own query-frontend, limits, caching, sharding
and tenancy. Verify Mimir behavior against the pinned Mimir version and a real
or isolated instance.
