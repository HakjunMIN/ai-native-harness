# Mimir operations checklist

First fetch task-relevant official URLs from [sources](sources.md) under the
[live-documentation protocol](../../sdlc/references/live-documentation.md).
This checklist does not supply upstream defaults or version-specific behavior.

This is a decision checklist, not an installer. Use version-matched sources from
the [source map](sources.md). Deployment inspection requires authorized read-only
access and must not expose secrets.

## Inventory

Record:

* Mimir version, image digests, deployment mode and enabled targets
* Classic or ingest-storage architecture, Kafka system, topic, partitions and
  replication when used
* Helm chart or Jsonnet revision, rendered values and runtime override source
* Object storage backend, bucket ownership, encryption, lifecycle and retention
* Gateway, network exposure, authentication, tenant mapping and federation;
  fetch Mimir configuration keys for the deployed version rather than copying
  similarly named Cortex or Loki settings
* Ruler, Alertmanager, recording rules and dashboard ownership
* Caches, persistent volumes, zone awareness and capacity owners

Do not copy chart examples into production values. Values keys and components
change between chart versions. Render and diff against the pinned chart.

## Tenant limits and cardinality

Set limits per tenant through the deployed runtime override mechanism. Base them
on measured active series, ingestion rate, query load and customer contracts.
Defaults are version-specific and may not fit production.

Before promoting labels, list each label's owner, expected values, cardinality
budget and query use. User IDs, request IDs, raw URLs, session IDs and other
unbounded values are not metric labels. Cardinality APIs may be disabled; enable
them only through an approved configuration change.

## Upgrade and change plan

| Step | Evidence |
|---|---|
| Resolve hop | Current and target tuple, release notes and deprecated flags for every hop |
| Render config | Chart/Jsonnet diff, removed or renamed values and effective runtime limits |
| Rehearse | Isolated environment with representative tenants, writes, queries, rules and compaction |
| Promote | Human-owned GitOps change with source revision, digest and observed health recorded separately |
| Recover | Restore or forward-fix procedure, including object storage, rules, Alertmanager state and Kafka when used |

Never enable ingest storage, change replication, delete blocks, rewrite bucket
contents or change retention as an automatic troubleshooting step. An image
rollback does not reverse storage or architecture migration.

## Security and resilience

Expose writes and reads only through authenticated routes. Separate write and
query identities when possible. Do not expose Mimir components, Kafka or object
storage directly to browsers or customer networks. Test wrong-tenant writes and
reads, overload behavior, rate limiting and restore of both metrics and
alerting configuration.
