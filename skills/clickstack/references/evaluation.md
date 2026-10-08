# ClickStack evaluation and operations checklist

First fetch the relevant official URLs in [sources](sources.md) using the
[live-documentation protocol](../../sdlc/references/live-documentation.md).
The following defines local decisions and evidence, not an offline API manual.

## Decide whether this skill is needed

| Observation | Decision |
|---|---|
| Only SigNoz uses ClickHouse internally | No ClickStack dependency; retain current API/storage ownership |
| Team asks for HyperDX UX or comparative observability research | Isolated evaluation; no adoption implied |
| Existing ClickStack files/deployment are in scope | Identify mode/version and apply its operational checklist |
| Replacement is requested | Separate architecture/adoption decision, migration study and human gates; do not implement a BFF bypass |

Read the [source map](sources.md) for exact docs and official skill boundaries.
An upstream skills catalog reduces duplicated instruction; it does not grant
access or make Cloud-specific commands correct for an OSS fork.

## Required compatibility matrix

For each row record SigNoz evidence, ClickStack evidence, expected behavior,
observed result, uncertainty and source revision. `Not tested` is not compatible.

| Dimension | Evidence to collect |
|---|---|
| Ownership | Deployment mode, binary/chart/collector versions, telemetry and application-state stores |
| Ingestion | Receiver/protocol, auth/TLS, exporter, queue/retry/drop behavior, redaction and sampling |
| Schema | Authorized read-only DDL or pinned migrations; database/table ownership, column types and case, index/TTL dependencies |
| Time | Timestamp precision and conversion, timezone, inclusive/exclusive range edges, span duration units |
| Correlation | Trace/span IDs, parent-child relationships, log-to-trace lookup, service/resource mappings |
| Metrics | Gauge vs sum vs histogram, temporality, units, labels/cardinality, aggregation and missing vs zero |
| Authorization | Query identity, tenant isolation, least-privilege ingest vs read, cross-tenant negative cases |
| Query cost | Bounded window/row limit, measured latency and scanned data under a documented budget |
| Application state | Users, dashboards, alerts, source configs, persistence and restorable backups for the selected mode |
| UX | Supported task flows, keyboard/contrast, dark/light, empty/error/loading states; retain Grafana delivery boundary |

Do not paste a full production DDL dump or payload into an external assistant.
Use sanitized structural evidence approved for the task. Read-only inspection
does not authorize DDL, data copies, TTL changes or broad scans.

## Bounded fixture recipe

In an approved isolated environment, send one trace with two linked spans and a
correlated error log, plus known gauge/counter/histogram measurements. Use fixed,
known event times including a query-range edge, bounded service/resource labels,
and a separate unauthorized identity/tenant for negative access tests.

Before sending, state expected counts, time-window inclusion, IDs, metric units
and authorization outcomes. Record instrumentation/collector/storage/API/UI
observations separately. If sampling or asynchronous ingestion changes expected
counts, capture its configured behavior and timeout; do not loosen assertions
after observing a mismatch. Test fixtures must follow actual API/SDK versions.

For HyperDX-on-SigNoz-schema research, use a sanitized copy or authorized bounded
read-only connection with explicit mappings. Do not allow collector auto-DDL
or schema migration in that source. Do not infer that direct HyperDX database
access authorizes database access from our BFF (Spring or Go) or Grafana browser.

## Operational plan, when requested

Record network/auth boundaries, secret references (not values), durable volumes,
capacity and retention, collector backpressure, identity separation, monitoring,
and upgrade compatibility across UI, state store, collector and ClickHouse.
Fetch the selected mode's architecture and recovery docs to identify every
application-state and telemetry store, then rehearse their restoration. Do not
assume another mode's storage or backup requirements apply.
Test recovery consistency; an old container tag is not a data rollback.

End the research handoff with a recommendation, gaps and separately scoped next
decision. Product-facing UX remains a real Grafana prototype; HyperDX screenshots
are comparative evidence, not an approved production UI. No live deployment,
Cloud provisioning or telemetry transfer is implicit in an evaluation request.
