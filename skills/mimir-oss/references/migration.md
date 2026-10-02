# SigNoz metrics to Mimir migration

Use this only for an explicit evaluation or approved migration. It does not
authorize production cutover. Combine it with `signoz-oss` for the current
SigNoz inventory and `prometheus-query-api` for query translation.

## Decision inputs

Record the requested outcome, affected tenants, metrics-only scope, owners,
retention, availability, cost, data residency and the exact current/target
versions. Compare query, alert, dashboard, API and operational ownership.
Record the project decision before implementation. A deadline is not a decision.

## Migration inventory

| Area | Required inventory |
|---|---|
| Producers | Services, collectors, exporters, temporality, histogram type and resource attributes |
| Consumers | BFF operations, Grafana panels, saved queries, exports and API clients |
| Alerting | SigNoz alerts, recording logic, notification routes and silence ownership |
| Data | Retention by tenant, required historical range and acceptable gap |
| Tenants | Customer identity to Mimir tenant mapping and isolation tests |

## Parity plan

1. Create a known synthetic counter, gauge and histogram for at least two tenants.
2. Send identical data to both stores through approved pipelines.
3. Inspect actual Mimir series names and labels before translating queries.
4. Compare aligned windows, units, rates, counter resets, empty versus zero,
   missing-series behavior, histogram quantiles and group labels.
5. Define tolerances before comparison. Explain each difference by semantics,
   not by changing thresholds after the result.
6. Verify wrong-tenant reads fail and per-tenant limits do not drop parity data.

SigNoz and Mimir can use different temporal aggregation and quantile methods.
Equal-looking dashboards are insufficient without fixture and query evidence.

## History and cutover

Choose one approved history strategy:

* Keep SigNoz readable for pre-cutover ranges with explicit UI or API routing.
* Backfill Prometheus TSDB blocks after an approved export and conversion.
  SigNoz ClickHouse data is not a TSDB block source; rehearse and validate it.
* Accept a documented history gap with product-owner approval.

Do not switch long-range dashboards to Mimir after a short dual-write window
unless history handling is approved. Migrate alerts and recording rules before
read cutover. Keep SigNoz metric ingestion during the agreed rollback window.

Rollback is a data and alerting decision, not only a feature flag. Record which
store owns writes, reads and alerts during each phase, and how data written
only to one store will be reconciled.
