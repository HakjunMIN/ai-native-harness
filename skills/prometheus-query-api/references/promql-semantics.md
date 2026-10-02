# PromQL semantics and translation

Discover actual series before writing PromQL:

1. Query metric metadata, labels or series for the approved fixture and tenant.
2. Record exact names, label keys, units, metric type and histogram form.
3. Write the smallest query that answers the approved product question.
4. Test it against expected fixture values before comparing dashboards.

## OTel-derived metrics

Until the real series are observed, write a draft from Mimir's documented
default mapping and label it as unverified:

* `service.name` and `service.namespace` become `job`.
* `service.instance.id` becomes `instance`.
* Filter or group by other resource attributes through `target_info`, joined on
  `job` and `instance`.
* Metric and point attribute names use the escaped form the pinned translation
  strategy produces. Suffixes such as `_total` or `_seconds` are absent unless
  observed.

Replace the draft only with observed names and labels. A promoted label or
quoted UTF-8 selector, such as `{"http.server.request.duration"}`, is valid
only when the stored series shows it.

Unverified draft for a production-filtered rate, assuming underscore escaping:

```promql
sum by (job) (
  rate(http_server_request_count[5m])
  and on (job, instance) target_info{deployment_environment="prod"}
)
```

Use a `target_info` join or `info()` only after confirming the pinned engine
support, join labels and cardinality. Prefer approved promoted labels for
frequent product filters.

## Query patterns

| Need | Pattern and checks |
|---|---|
| Counter rate | `sum by (job) (rate(<counter>[<window>]))`; check resets, scrape or export interval and stale series |
| Counter increase | `increase` extrapolates; do not compare it with raw stored deltas without semantics review |
| Classic histogram quantile | `histogram_quantile(q, sum by (<group>, le) (rate(<metric>_bucket[<window>])))` after confirming bucket series and `le` |
| Native histogram quantile | `histogram_quantile(q, sum by (<group>) (rate(<metric>[<window>])))`; do not add `_bucket` or `le` |
| Gauge current value | Instant query with an explicit aggregation; distinguish missing series from zero |

Pick the range window from the export interval and product meaning. Range step
controls output resolution; the range selector controls each calculation.
Lookback and staleness can hide stopped series or keep recent values visible;
check the pinned server's lookback delta.

## SigNoz parity

Translate a SigNoz query only after recording its aggregation, temporal window,
temporality, grouping, filters, unit and quantile method. Prove parity with known
fixtures in at least two tenants. Define tolerances before comparison and
explain differences instead of adjusting the target query until it matches.
