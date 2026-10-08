---
name: spring-testing
description: Use when backend unit, Spring integration, or BFF API tests need new coverage or investigation.
---

# Spring Testing

## Required live documentation

Before technical advice, code, configuration or queries, follow the
[live-documentation protocol](../sdlc/references/live-documentation.md) and
**fetch the relevant official URLs** in [sources](references/sources.md) during
this task. Local guidance below defines project policy and verification questions,
not current upstream facts. Record fetched URL/section/date and matching version;
failed retrieval blocks dependent guidance rather than falling back to memory.

Backend acceptance criteria are tested with **JUnit 5**, not Gherkin or Cucumber.

Read the [shared principles](../sdlc/references/principles.md) and this plugin's `tdd` and `api-contract` skills through native invocation or exact plugin-root skill files.

## Test selection

| Boundary | Preferred test |
|---|---|
| Domain/service rule | Plain JUnit 5 with real domain objects |
| MVC validation/auth/error mapping | `@WebMvcTest` and existing security fixtures |
| Application wiring | `@SpringBootTest` with controlled dependencies |
| Query-service client HTTP behavior | WireMock response/error/latency stubs |
| Required container dependency | Testcontainers with pinned images |
| BFF HTTP contract | REST Assured against a running test application |

Use the repository's existing Gradle tasks and libraries; confirm versions before adding configuration.

## Procedure

1. Map approved backend AC and OpenAPI operations to the smallest meaningful boundary. Include invalid inputs, forbidden tenant scope, empty results, timeout budgets, and upstream errors.
2. Build deterministic fixtures with test-data builders. Use fixed clocks and isolated data; mock external systems only, not the logic being asserted.
3. As test-writer, write the behavior assertion first and execute its selected Gradle test. Capture expected RED separately from compilation, startup, or container failures.
4. Strict SDLC freezes tests/fixtures for a separate implementer. Light/standalone
   may use one author, but no mode permits weakening expectations to manufacture GREEN.
5. After the production change, rerun the selected test and affected unit/integration/API tasks. Confirm tests actually ran and inspect reports for skips or hidden failures.

## Bounded example

A WireMock-delayed upstream response verifies that the BFF maps a timeout to the contracted ProblemDetail. This proves client/error handling under a stubbed dependency. It does **not** prove the real query-service's schema compatibility or end-to-end tenant isolation; collect separate live-integration evidence.

## Stop and output

Output the AC/test matrix, fixture and test hashes, exact Gradle commands, discovered/executed test counts, RED/GREEN excerpts, and dependency labels.

Docker/Testcontainers unavailability is `BLOCKED`, never a passing test. Do not switch backend AC to Cucumber to share frontend steps. Ambiguous expected behavior goes back to the contract owner; do not guess or weaken the assertion.

In an SDLC run, return evidence to the conductor for state validation; standalone use needs no run state.
