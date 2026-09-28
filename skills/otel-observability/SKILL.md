---
name: otel-observability
description: Use when BFF tracing, telemetry semantics, log correlation, or observability acceptance evidence changes.
---

# OTel Observability

Trace the supported request path without leaking sensitive data or duplicating instrumentation.

Read the [shared protocol](../sdlc/references/protocol.md) and this plugin's `spring-boot-bff` and `signoz-query-service` skills through native invocation or exact plugin-root files.

## Procedure

1. Inspect installed OTel instrumentation, SDK/agent versions, collector configuration, semantic-convention versions, and existing service/resource naming. Identify automatic spans before adding manual ones.
2. Map the request path: Grafana/proxy → Spring BFF → query-service. Use supported context propagation through the WebClient boundary and asynchronous work; telemetry context is not authentication.
3. Add manual spans only for meaningful application operations not already covered. Set bounded attributes, correct status, and exception events according to the pinned conventions.
4. Correlate application logs with trace/span IDs. Exclude tokens, raw SQL, request bodies, personal data, and unbounded identifiers from logs and metric labels. Never trust a propagated tenant label as authorization.
5. Measure latency, error outcomes, and saturation using bounded-cardinality dimensions. Document sampling and redaction behavior; do not disable them broadly to make a demo visible.
6. Validate propagation and semantic attributes with existing tests or a controlled exporter. Separately observe a sanitized request in the configured real telemetry pipeline when required by the plan.
7. Record service names, signal ownership, dashboard/query references, expected failure signals, and operational follow-up in the ticket's Korean verification artifacts.

## Bounded example

A BFF request creates a server span but its query-service call starts an unrelated trace. Use the installed WebClient instrumentation's context propagation and verify parent linkage. Do not add a second client span if automatic instrumentation already emits one.

## Stop and output

Output instrumentation scope, pinned convention references, redaction/cardinality decisions, test evidence, and observed correlation references.

An in-memory exporter test proves instrumentation behavior, not collector delivery. If the required collector/query-service is unavailable, report `BLOCKED` for live evidence rather than claiming observability is operational. Avoid exposing sensitive spans in artifacts; preserve only sanitized evidence and hashes.

Before phase progression, run `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>`.
