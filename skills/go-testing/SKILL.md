---
name: go-testing
description: Use when Go backend tests (go test unit, HTTP handler, integration, race or fuzz) need new coverage, RED/GREEN evidence, or investigation.
---

# Go Testing

## Required live documentation

Before technical advice, code, configuration or queries, follow the
[live-documentation protocol](../sdlc/references/live-documentation.md) and
**fetch the relevant official URLs** in [sources](references/sources.md) during
this task. Local guidance below defines project policy and verification questions,
not current upstream facts. Record fetched URL/section/date and matching version;
failed retrieval blocks dependent guidance rather than falling back to memory.

Go backend acceptance criteria are tested with the standard `testing` package through
**`go test` (task check kind `go`)**, not JUnit, Gherkin, Cucumber or godog. Backend
Gherkin from a ticket is AC prose to map onto Go tests; another team's godog use does
not change this.

Read the [shared principles](../sdlc/references/principles.md) and this plugin's `tdd`, `go-backend` and `api-contract` skills through native invocation or exact plugin-root skill files.

## Test selection

| Boundary | Preferred test |
|---|---|
| Domain/service rule | Table-driven test with named `t.Run` subtests |
| HTTP validation/auth/error mapping | `httptest` through the production router and middleware |
| Upstream client status/latency/errors | `httptest.Server` stub; blocking handlers drain the request body, then wait for request cancellation or a test-owned release channel |
| Concurrency or shared state | Deterministic synchronization under `-race` |
| Untrusted input decoding | Native fuzz target seeded with regression inputs |
| Database or container dependency | Existing build-tag/env-gated suite; Testcontainers with pinned images |

Reuse the repository's Make/Task targets, helpers and assertion style; a new test
library, mock generator or `go` directive change needs explicit scope.

## Procedure

1. Map approved AC and contract operations to the smallest boundary, including invalid input, forbidden tenant scope, empty results, timeout/cancellation and upstream errors. Fake external systems only; inject clocks and budgets, and verify shortened production values separately.
2. Write the assertion first, preferably through an existing public boundary such as the router. If it needs a missing API, an author whose allowlist includes production code adds a minimal compiling signature that returns wrong behavior; a separate test-writer never edits production code and returns the needed signature to the conductor instead. `[build failed]`, `[setup failed]`, `[no test files]` and `[no tests to run]` are not RED.
3. Run the exact test with repository flags, e.g. `go test -race -count=1 -v -run '^TestName$' ./pkg` plus required `-tags`/environment. Evidence names the test with `--- FAIL`/`--- PASS`; a bare `ok`, `(cached)` or zero matched tests is not evidence.
4. Skipped required tests, excluded build tags, unavailable Docker or a runner that cannot run `-race` are `BLOCKED` for the affected AC, never a pass obtained by dropping flags or adding skips.
5. Strict SDLC freezes tests/fixtures for a separate implementer; light/standalone may use one author. Failures inside frozen test code return to the test-writer.
6. After the production change, rerun the selected test, affected packages and the full repository target.
7. Before handoff, review new tests against the matching community checklist page in [sources](references/sources.md). Confirm each finding against official documentation; its library advice applies only where the repository already uses that library.

## Bounded example

A blocking `httptest.Server` stub with a 50 ms test budget proves the 504 problem mapping. It does **not** prove the production 2 s budget, the pinned query-service schema or end-to-end tenant isolation; collect those separately.

## Stop and output

Output the AC/test matrix, test file hashes, Go version, cwd, exact `go test` commands with flags/tags/environment, executed/skipped/failed test names and counts from `-v` or `-json`, RED/GREEN excerpts, stub/live labels, and the checklist page/commit consulted with confirmed findings.

Ambiguous expected behavior goes back to the contract owner; do not guess or weaken the assertion.

In an SDLC run, return evidence to the conductor for state validation; standalone use needs no run state.
