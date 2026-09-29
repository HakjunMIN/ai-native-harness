---
name: diagnosing-bugs
description: Use when a defect is reproducible, behavior differs across environments, or a slice has failed three implementation attempts.
---

# Diagnosing Bugs

Establish a falsifiable feedback loop before choosing a fix.

Read the [shared principles](../sdlc/references/principles.md) and load this plugin's `tdd` skill natively or from `<PLUGIN_ROOT>/skills/tdd/SKILL.md`.

## Procedure

1. Capture expected/actual behavior, exact revision, environment, input, and the shortest reproduction command. Redact credentials and customer data. Separate missing infrastructure from application failure.
2. Encode the defect at the closest useful boundary (strict SDLC: assigned
   test-writer). Observe the intended assertion failure; use applicable repo tests.
3. Minimize inputs and compare one working/failing case. Trace Grafana → BFF → query-service using correlation IDs and bounded logs. Inspect the pinned upstream contract instead of assuming API versions.
4. Write one hypothesis, a discriminating observation, and a falsification condition. Add narrowly scoped instrumentation or tests through the owning role; run the experiment and record whether the prediction held.
5. Fix the supported cause within the assignment. Strict SDLC preserves separate
   test ownership; light/standalone may use one author. Never weaken expectations.
   Run the regression test, affected suites and required reviews.
6. Return the causal explanation, evidence and remaining risks; SDLC records them
   in `03-impl-log.md`, standalone work uses the requested report.

## Bounded example

A trace panel intermittently times out. Compare BFF and query-service latency for the same request before changing retries. If BFF attempts multiply a slow upstream query, test the retry budget and deadline behavior; do not bypass query-service with direct ClickHouse access.

## Stop and output

Return reproduction, hypothesis table, observed evidence, hashes/base/HEAD, proposed or verified fix, and blockers. If the environment cannot reproduce the required path, return `BLOCKED`; mocks may narrow a hypothesis but cannot prove real integration.

After the three-attempt escalation, perform a bounded diagnostic pass. If no supported cause or safe next experiment emerges, return `NEEDS_HUMAN` rather than repeating speculative patches.

Never weaken tests to end the loop or apply emergency `kubectl patch`, direct production edits, merge, or deploy commands. Escalate operational remediation to a human through the release procedure.

In an SDLC run, return evidence to the conductor for state validation; standalone use needs no ticket state.
