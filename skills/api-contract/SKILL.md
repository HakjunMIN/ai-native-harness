---
name: api-contract
description: Use when a Grafana plugin and Spring BFF interface is new, changing, or inconsistent with consumer types and tests.
---

# API Contract

Agree on the plugin-to-BFF boundary before implementing either side.

Read the [shared protocol](../sdlc/references/protocol.md). Load this plugin's `spring-boot-bff` and `signoz-query-service` skills through the native tool or exact `<PLUGIN_ROOT>/skills/<name>/SKILL.md` paths.

## Procedure

1. Read the approved acceptance criteria, existing OpenAPI source, consumers, and current query-service mapping. Identify compatibility impact and authoritative contract ownership.
2. Draft `docs/sdlc/<KEY>/openapi.yaml`: operation IDs, request/response schemas, units, nullability, time ranges, pagination, query limits, authorization, and ProblemDetail error responses.
3. Define tenant/user context from verified authentication. Browser-supplied tenant headers are not identity evidence; authorization must enforce the authenticated principal's permitted scope.
4. Specify how each BFF operation maps to the **pinned** query-service API. Discover its version and schema from the repository/OpenAPI; never assume a Query Builder version. Do not expose arbitrary browser SQL or direct ClickHouse access.
5. Run the repository's OpenAPI validation and consumer type-generation commands. Review generated diffs and compatibility. Generated types do not replace runtime validation.
6. Hand the agreed contract to the test-writer for JUnit 5 provider/API tests and plugin consumer tests. Include success, invalid input, forbidden scope, no data, timeout, and upstream-error cases. Contract approval precedes implementation.

## Bounded example

A duration changes from milliseconds to seconds. Make the unit explicit in the schema and migration decision; regenerate TypeScript types and assert a known duration at the boundary. A compiling consumer alone cannot prove the numeric semantics remain correct.

## Stop and output

Output contract hash, compatibility decision, generated-file list, API-to-query-service mapping, and validation/test evidence. Preserve the production/test division: an implementer cannot modify contract tests to fit implementation.

Unknown upstream schema, missing identity verification, or incompatible generation tooling is `BLOCKED`. A breaking semantic change without the required human decision is `NEEDS_HUMAN`; do not quietly reuse stale G2 approval.

Before phase progression, run `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>`.
