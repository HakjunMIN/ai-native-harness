# OSS investigation and change checklist

First fetch task-relevant official URLs from [sources](sources.md) under the
[live-documentation protocol](../../sdlc/references/live-documentation.md).
This checklist does not supply upstream defaults or version-specific behavior.

Use the [source map](sources.md) to choose version-matched material. This is a
decision checklist, not an installation script or permission to run migrations.

## Inventory before changing anything

Record the application/fork SHA and image digest; collector image/config;
migrator job/binary and completion state; chart/values revision; ClickHouse
version/topology/volumes; application metadata store and volumes; auth and
network boundaries; enabled/licensed features; and the operator responsible.
Do not assume metadata is inside ClickHouse or MongoDB just because another stack
uses it. Read the deployed configuration. Never put connection secrets in reports.

Bounded source inspection on an already-authorized checkout:

```bash
git rev-parse HEAD
git describe --tags --always
git status --short
```

Then locate the pinned manifests, module declarations and entrypoints. Infer
build/test commands from the repository's Makefile/CI rather than guessed paths.
Deployment inspection is read-only and requires access; no automatic clone,
installer, cloud provisioning or credentials acquisition.

## Trace one signal through the data path

1. Create an approved synthetic fixture with service/resource attributes and
   recognizable trace/span IDs; no production payload replay by default.
2. Confirm actual endpoint/protocol and receiver authentication. OTLP HTTP and
   gRPC are different; documented defaults do not prove deployment bindings.
3. Inspect pipeline routing, transform/filter/sampling, memory/batch controls,
   exporter queue/retry failure and any OpAMP-managed overrides.
4. Verify the pinned exporter and migration create/write the schema the pinned
   API expects. An upstream generic ClickHouse exporter is not automatically
   interchangeable with the SigNoz distribution.
5. Query via the supported SigNoz API through the existing BFF test path. Check
   empty vs zero, timestamp precision/timezone, units, temporality, counts,
   correlation IDs, tenant isolation, and timeout/cancellation.
6. Keep receiver health, storage observation, API response and Grafana rendering
   evidence separate. A missing stage blocks claims about that stage.

For storage diagnosis, use an explicitly authorized read-only administrative
inspection on a bounded dataset. This does not add database access to BFF or
browser code. No DDL, data deletion, TTL change, `OPTIMIZE FINAL`, or broad mutation
is an automatic troubleshooting step.

## Upgrade/recovery plan

| Step | Acceptance evidence |
|---|---|
| Resolve versions | Current/target tuple plus every required stop, with official guide links |
| Review migration | Pinned runner, sync/async sequencing where applicable, required permissions, disk/time budget, completion/error conditions |
| Backup | Telemetry and metadata coverage, values/config, retention impact, consistent capture procedure and tested restoration |
| Rehearse | Representative isolated data, concurrent ingest/query behavior, old/new API compatibility and migration success |
| Promote | Human-owned GitOps execution; record source candidate, promotion revision, digest and observed health separately |
| Recover | Distinguish application downgrade from schema recovery; specify restore/forward-fix and lost/duplicated data handling |

Do not assume sync/async job names or the location of the migration binary: these
have changed across releases. Do not remove a failed migration marker or rerun a
job blindly. Follow the matching recovery guide and get an operator decision when
state is ambiguous. Backups without a restore rehearsal are incomplete evidence.

## Fork hygiene and handoff

For each patch, record upstream base, exact changed subsystem, expected behavior,
minimal regression test and final result, interaction with schema/collector/API,
rebase conflicts, upstream issue/PR if one exists, and removal criteria.
Preserve notices and check actual component licenses; do not equate self-hosted
access to unrestricted redistribution or enterprise entitlement.

Keep upstream SigNoz frontend code out of this platform's user-facing scope.
Grafana datasource/panel/app changes stay in their existing skills. Report
Korean findings with source provenance, changed paths, evidence hashes and
`DONE`/`BLOCKED`/`NEEDS_HUMAN` for the assignment, not an invented gate approval.
