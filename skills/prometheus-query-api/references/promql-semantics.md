# PromQL semantics investigation

Fetch task-relevant URLs in [sources](sources.md) using the
[live-documentation protocol](../../sdlc/references/live-documentation.md).
Start with [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
and [functions](https://prometheus.io/docs/prometheus/latest/querying/functions/),
then verify version and engine compatibility. This is a question checklist, not
an offline catalog of PromQL expressions or OTel label mappings.

## Discover before composing

1. Identify the server/version and fetch docs for required selectors, functions,
   experimental features, naming rules and result forms.
2. Inspect metadata, labels and stored series for an approved fixture and tenant.
3. Record exact names, labels, units, type, temporality and histogram form.
4. Derive the smallest query answering the approved product question from the
   retrieved syntax and observed data; do not invent a query from assumed labels.
5. Test against expected fixture values before comparing dashboards.

## OTel-derived metrics

Fetch [Mimir collector documentation](https://grafana.com/docs/mimir/latest/configure/configure-otel-collector/)
and its configuration reference at the matching version before inferring mappings.
Check name escaping, suffixes, resource-to-label/metadata translation, promotion,
join keys and cardinality against the active pipeline and stored series. Do not
publish a ready-to-use query based only on a documented default. Verify support
and meaning of every join or helper function on the actual query engine.

## Questions by query intent

| Intent | Resolve from fetched docs and fixtures |
|---|---|
| Counter rate/increase | Reset handling, extrapolation, aggregation order, sample interval and window |
| Histogram quantile | Stored representation, supported functions, required grouping and interpolation |
| Gauge current value | Instant-query evaluation, aggregation, missing values and stale series |
| Range display | Output step versus calculation window, lookback, evaluation timestamps and boundaries |
| Resource filter/join | Actual keys, matching semantics, supported syntax and many-to-many risk |

## SigNoz parity

Retrieve the source query's semantics too. Record aggregation, temporal window,
temporality, grouping, filters, unit and quantile method. Prove parity using known
fixtures in at least two tenants and define tolerances before comparison. Explain
differences instead of adjusting the target query or thresholds until it matches.
