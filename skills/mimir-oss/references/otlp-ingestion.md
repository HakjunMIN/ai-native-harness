# Mimir ingestion investigation

First fetch the relevant official URLs in [sources](sources.md) under the
[live-documentation protocol](../../sdlc/references/live-documentation.md).
Use [Collector ingestion docs](https://grafana.com/docs/mimir/latest/configure/configure-otel-collector/)
and [configuration reference](https://grafana.com/docs/mimir/latest/configure/configuration-parameters/)
as discovery entrypoints, then resolve the deployed version. This checklist
intentionally does not embed endpoint defaults, translation rules or feature status.

## Choose the write path from live sources

Record the collector distribution/version and Mimir version, architecture,
gateway, active configuration and runtime overrides. Fetch the corresponding
receiver/exporter docs before choosing OTLP or remote_write. Verify:

- Supported protocols, endpoint paths, authentication and tenant-header ownership.
- Required collector components and options in the pinned distribution.
- Recommended write path and its prerequisites for this version and deployment.
- Queue, retry, timeout, backpressure and partial-failure behavior.
- For an approved dual-write window, independent failure isolation, cost and tenant
  routing for both destinations. A docs example does not authorize exporter changes.

Choose an authenticated owner for tenant routing. Never trust telemetry labels or
browser headers as identity. Fetch current tenant-ID/federation rules, then enforce
project authorization. Keep credentials in the existing secret mechanism.

## Translation questions to resolve

| Topic | Evidence to retrieve and verify with stored series |
|---|---|
| Names and suffixes | Which validation/translation options apply, and what names and unit/type suffixes result? |
| Resource attributes | Which attributes become labels or metadata, and how are service/instance identities represented? |
| Promotion | Which resource-promotion options are supported, with what stability and cardinality limits? |
| Temporality | Which delta/cumulative forms are accepted, and where must conversion occur? |
| Histograms | Which explicit/exponential representations are accepted and stored under the active settings? |
| Start time | How do created timestamps affect resets and ingestion? |
| Ordering | Which ordering windows and rejection rules apply at instance and tenant scope? |

Do not assume metric suffixes, service labels, joins or histogram forms from
OTel input names or a historical default. Fetch relevant query-engine support
before choosing joins/functions and inspect one approved synthetic fixture.

## Acceptance evidence

1. Collector receives the fixture and exports without dropped or retried data.
2. Mimir accepts the write for the expected tenant and rejects unauthorized reads.
3. Observed names, labels, units, temporality and histogram form match expectations
   derived from fetched version-matched docs and the active configuration.
4. Active series, ingestion rate and discarded samples stay within agreed limits.
5. Record query, dashboard and alert results separately from write success.

HTTP success alone does not prove usable metrics. Missing docs or unknown mapping
blocks the dependent configuration/query recommendation, not unrelated inventory.
