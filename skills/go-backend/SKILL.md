---
name: go-backend
description: Use when Go backend or BFF handlers, gRPC services, upstream clients, persistence, concurrency, or go.mod dependencies change.
---

# Go Backend

## Required live documentation

Before technical advice, code, configuration or queries, follow the
[live-documentation protocol](../sdlc/references/live-documentation.md) and
**fetch the relevant official URLs** in [sources](references/sources.md) during
this task. Local guidance below defines project policy and verification questions,
not current upstream facts. Record fetched URL/section/date and matching version;
failed retrieval blocks dependent guidance rather than falling back to memory.

When a Go module serves as the BFF, the supported path is Grafana plugin → BFF → SigNoz query-service. **The BFF never accesses ClickHouse directly**, in any language.

Read the [shared principles](../sdlc/references/principles.md). Load this plugin's `api-contract`, `go-testing`, and `signoz-query-service` skills natively or from their exact `<PLUGIN_ROOT>/skills/<name>/SKILL.md` files; add `prometheus-query-api` for Prometheus-compatible metrics and `otel-observability` for telemetry changes.

## Procedure

1. Pin the module's `go`/`toolchain` directives, `go.work`, CI Go version source, framework, logger, driver, lint configuration and approved OpenAPI/protobuf. Use only features and standard-library APIs available at the module's `go` version per fetched release notes; a newer local toolchain compiling the code is not proof.
2. Follow the repository's stack. A new or upgraded module (including `golang.org/x/...`), a raised `go` directive, or a replaced router, logger, DI, ORM or test library needs explicit scope. Report unrelated `go.mod`/`go.sum` edits; do not commit or discard them.
3. Keep decoding, validation and error mapping in handlers, orchestration in services, and upstream/database adapters in `internal/` packages behind small consumer-side interfaces.
4. Propagate the request context everywhere and derive deadlines from the approved budget; never start `context.Background()` mid-request. Every goroutine has an owner, stop signal and wait; bound fan-out. Use a configured client with timeouts, encode parameters, check status, and bound and close bodies. Retry only transient failures of idempotent operations within the remaining budget.
5. Wrap errors with context, classify with `errors.Is`/`errors.As` and handle each once. Map them at the transport boundary to the approved contract without exposing `err.Error()`, upstream bodies, SQL, hosts or credentials. Caller cancellation is not a server failure. Empty, zero and non-finite results need contract-defined encodings.
6. Derive user and tenant identity from verified authentication; reject or overwrite client-supplied identity headers. Keep secrets out of logs, metric labels and errors. Configure server timeouts, body limits and graceful shutdown; for databases use parameter binding, context-aware calls, checked row iteration and deferred rollback.
7. Run the repository's format, vet, lint and build commands plus `go-testing` evidence. Behavior changes need observed RED/GREEN; refactors use before/after checks. Preserve strict test-writer ownership.
8. Before handoff, review the diff against the matching community checklist pages in [sources](references/sources.md). Confirm each finding against official documentation; checklist advice never authorizes a new dependency or `go` directive change.

## Bounded example

A dashboard handler misses its latency budget because two query-service calls run serially. Run them concurrently under the request context with a bounded wait and per-call deadline, then measure. **Detached `context.Background()` goroutines, a zero-timeout client, an unscoped dependency or a direct ClickHouse connection are not latency fixes.**

## Stop and output

Output changed paths, Go version/toolchain evidence, dependency diff (or none), operation-to-upstream mapping, deadline budget, goroutine ownership, error-to-contract mapping, test evidence bound to base/HEAD and hashes, and the checklist pages/commit consulted with confirmed findings.

An unknown module Go version or upstream schema, an unapproved dependency or stack change, or unverifiable tenant context is `BLOCKED`. If contract expectations appear wrong, return the discrepancy to the test-writer/architect; do not edit assertions.

In an SDLC run, return evidence to the conductor for state validation; standalone use needs no run state.
