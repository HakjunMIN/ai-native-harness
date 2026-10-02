# OTLP and remote_write ingestion

Use the [source map](sources.md) for exact links. Read the deployed Mimir
configuration and runtime overrides before applying any default below.

## Choose the write path

| Path | Use when | Check |
|---|---|---|
| `otlphttp` to `<gateway>/otlp` | OTel Collector already owns metrics | Collector and Mimir versions, auth extension, tenant header, retry and queue limits |
| `prometheusremotewrite` to `/api/v1/push` | Existing Prometheus remote_write path or approved exporter requirement | Exporter translation options, resource-to-label conversion and remote-write protocol version |
| Dual export to SigNoz and Mimir | Approved migration parity window | Independent queues, failure isolation, cost and tenant routing for both destinations |

Mimir documents OTLP as the recommended collector path. Do not swap exporters
without comparing resulting series names, labels and failure behavior.

## Tenant routing

Choose one owner for the tenant header: an authenticating gateway, a
tenant-specific collector pipeline, or a validated routing component. Map the
customer identity to a valid Mimir tenant ID. Reject reserved values and `|`
unless an approved federation feature needs it. Never derive the tenant from
untrusted telemetry labels without authentication. Keep credentials in the
existing secret mechanism, not Helm values, reports or chat.

## Translation checklist

Run one approved synthetic fixture and inspect the resulting series with the
query API before writing PromQL.

| Topic | Current documented behavior to verify |
|---|---|
| Names | Unsupported characters may be escaped to `_`; the translation strategy depends on validation scheme and translation settings |
| Suffixes | Current config defaults do not add OTLP metric suffixes; never assume `_total`, `_seconds` or `_bytes` |
| Resource attributes | `service.namespace/service.name` maps to `job`; `service.instance.id` maps to `instance`; others go to `target_info` |
| Promotion | Resource-attribute promotion is experimental and must list approved bounded attributes |
| Temporality | Delta OTLP is rejected unless experimental native delta ingestion is enabled; cumulative conversion must be explicit |
| Histograms | Explicit and exponential histograms may become classic, NHCB or native histograms; check flags and stored series |
| Start time | Created-timestamp zero-sample ingestion is optional and affects counter resets |
| Out-of-order | Disabled by default unless a time window is configured |

`service.name` is not automatically a `service_name` label. Query `job` or use
an approved `target_info` join or `info()` only when the pinned query engine
supports it. Promote `deployment.environment` or other resource attributes only
after cardinality and query-contract review.

## Acceptance evidence

1. Collector receives the fixture and exports without dropped or retried data.
2. Mimir accepts the write for the expected tenant and rejects a wrong-tenant read.
3. Series, labels, units, temporality and histogram representation match the plan.
4. Active series, ingestion rate and discarded samples stay within tenant limits.
5. Query, dashboard and alert evidence are recorded separately from write success.

A listening `/otlp` endpoint or HTTP 2xx alone does not prove usable metrics.
