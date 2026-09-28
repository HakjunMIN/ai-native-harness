---
name: diagnosing-bugs
description: Use when a defect is reproducible, behavior differs across environments, or a slice has failed three implementation attempts.
---

# Diagnosing Bugs

Establish a falsifiable feedback loop before choosing a fix.

Read the [shared protocol](../sdlc/references/protocol.md) and load this plugin's `tdd` skill natively or from `<PLUGIN_ROOT>/skills/tdd/SKILL.md`.

## Procedure

1. Capture expected/actual behavior, exact revision, environment, input, and the shortest reproduction command. Redact credentials and customer data. Separate missing infrastructure from application failure.
2. Have the test-writer encode the defect at the closest useful boundary: JUnit 5 for backend behavior; frontend unit tests or playwright-bdd for user-visible behavior. Observe the intended assertion failure.
3. Minimize inputs and compare one working/failing case. Trace Grafana → BFF → query-service using correlation IDs and bounded logs. Inspect the pinned upstream contract instead of assuming API versions.
4. Write one hypothesis, a discriminating observation, and a falsification condition. Add narrowly scoped instrumentation or tests through the owning role; run the experiment and record whether the prediction held.
5. Hand a supported cause to the implementer for a production-only fix. Preserve frozen assertions, fixtures, and test configuration. Run the regression test, affected suites, and required reviews.
6. Record the causal explanation, alternative hypotheses ruled out, RED/GREEN evidence, and remaining operational risks in `03-impl-log.md`.

## Bounded example

A trace panel intermittently times out. Compare BFF and query-service latency for the same request before changing retries. If BFF attempts multiply a slow upstream query, test the retry budget and deadline behavior; do not bypass query-service with direct ClickHouse access.

## Stop and output

Return reproduction, hypothesis table, observed evidence, hashes/base/HEAD, proposed or verified fix, and blockers. If the environment cannot reproduce the required path, return `BLOCKED`; mocks may narrow a hypothesis but cannot prove real integration.

After the three-attempt escalation, perform a bounded diagnostic pass. If no supported cause or safe next experiment emerges, return `NEEDS_HUMAN` rather than repeating speculative patches.

Never weaken tests to end the loop or apply emergency `kubectl patch`, direct production edits, merge, or deploy commands. Escalate operational remediation to a human through the release procedure.

Before phase progression, run `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>`.
