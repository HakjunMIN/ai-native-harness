---
name: tdd
description: Use when implementing a feature, changing behavior, fixing a regression, or encountering pressure to code before tests.
---

# Test-Driven Development

Each vertical slice must have observed RED, GREEN, and reviewed evidence.

Read the [shared protocol](../sdlc/references/protocol.md). Resolve this plugin's skills by native invocation or exact plugin-root `SKILL.md` paths to avoid same-name collisions.

## Procedure

1. Read the approved slice, acceptance criteria, contract, and handoff. Fix the production/test path allowlists and record input hashes plus base/HEAD.
2. **Test-writer:** write the smallest behavioral test at a public interface. Mock only external boundaries. Use JUnit 5 for backend unit/integration/API tests; use playwright-bdd Gherkin only for frontend E2E.
3. Run the selected test and inspect its failure. Record command, exit code, relevant output, timestamp, tested revision, and test-file hashes. RED must demonstrate the missing behavior—not a syntax error, unavailable container, or zero tests.
4. **Implementer:** verify the RED evidence and frozen test hashes; edit production paths only until the same test passes. Then refactor production code while preserving behavior and rerun the affected tests.
5. Obtain separate spec and standards findings under this plugin's `code-review` skill. The parent audits the diff against both allowlists and verifies tests/fixtures/assertions remained unchanged by the implementer.

## Bounded example

A new BFF timeout test expects a stable gateway error. The implementer sees a different status and wants to change the assertion. Return `BLOCKED` with actual versus expected behavior and contract evidence; route the test question to the test-writer or human. Do not edit the assertion, fixture, snapshot, test configuration, or skips to make GREEN.

## Stop and output

Output RED/GREEN command evidence, artifact hashes, changed paths, slice status, actual author/reviewer model and family, and unresolved findings.

Deadline pressure does not allow tests-after or self-review. Production code written prematurely is not RED evidence; isolate unverified work and re-establish the test-first handoff without deleting others' changes.

After three failed slice attempts, use this plugin's `diagnosing-bugs` skill. If diagnosis cannot establish a safe next step, return `NEEDS_HUMAN`; do not loop indefinitely. Infrastructure failure is `BLOCKED`, never GREEN.

Before phase progression, run `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>`; stale evidence must be regenerated.
