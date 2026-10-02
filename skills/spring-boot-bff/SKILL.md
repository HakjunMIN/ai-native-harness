---
name: spring-boot-bff
description: Use when Spring Boot BFF controllers, services, upstream clients, authentication, or resilience behavior change.
---

# Spring Boot BFF

The supported path is Grafana plugin → Spring BFF → SigNoz query-service. **The BFF never accesses ClickHouse directly.**

Read the [shared principles](../sdlc/references/principles.md). Load this plugin's `api-contract`, `spring-testing`, and `signoz-query-service` skills natively or from their exact `<PLUGIN_ROOT>/skills/<name>/SKILL.md` files. When metrics are served by Mimir or another Prometheus-compatible API, load `prometheus-query-api` for those operations.

## Procedure

1. Inspect Gradle module boundaries, Spring versions, existing configuration, and approved OpenAPI. Follow repository conventions rather than introducing a parallel stack.
2. Keep HTTP validation/ProblemDetail mapping in controllers, domain orchestration in services, and upstream transport/DTO mapping in a dedicated WebClient client.
3. Discover the deployed/pinned query-service version and request schema before implementing mappings. Restrict query shape, time window, result limits, and expensive operations at the server boundary.
4. Derive user and tenant identity from verified authentication and authorized server-side context. Reject or overwrite untrusted identity headers; a browser's claimed tenant is never sufficient. Keep upstream credentials in server configuration/secret storage.
5. Define connect/response deadlines, cancellation, and bounded concurrency. Retry only classified transient failures for safe/idempotent operations within the total request budget; avoid retry multiplication. Follow the existing circuit-breaker policy.
6. Map validation, authorization, upstream timeout/unavailability, and unexpected errors to the agreed ProblemDetail contract without leaking SQL, credentials, or internal endpoints.
7. Use profile-specific endpoints and externalized secrets. Behavior changes need
   observed RED/GREEN; refactors use before/after checks. Preserve test-writer
   ownership when strict policy requires it; run relevant Gradle tasks.

## Bounded example

A dashboard query exceeds its latency budget. Measure the BFF/query-service spans and optimize the supported query or propose a bounded upstream patch. **Benchmarks do not authorize a direct ClickHouse client**, an alternate JDBC path, or browser SQL passthrough.

## Stop and output

Output changed production paths, operation-to-upstream mapping, identity/resilience decisions, and test/evidence references bound to base/HEAD and hashes.

Unknown query-service schema, unverifiable tenant context, or unavailable required integration infrastructure is `BLOCKED`. If contract expectations appear wrong, return the discrepancy to the test-writer/architect; do not edit assertions or bypass validation.

In an SDLC run, return evidence to the conductor for state validation; standalone use needs no run state.
