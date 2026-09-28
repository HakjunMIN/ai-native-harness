---
name: verification-gate
description: Use when claiming completion, recording a gate result, resuming ticket state, or evaluating test and review evidence.
---

# Verification Gate

A claim is only as current as its evidence and tested subject.

Read the [shared protocol](../sdlc/references/protocol.md), including its evidence schema and human-approval rules. Use this plugin's exact skill files when native discovery is ambiguous.

## Procedure

1. Run `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>` before phase progression. Treat JSON state as an assertion to verify, not authority. Stop if evidence files, SHA256 hashes, subject HEAD, approvals, or prerequisites fail validation.
2. Build a requirement-to-evidence matrix from the approved plan and repository configuration. Include applicable Gradle/JUnit unit, integration and API tests; Jest/RTL; playwright-bdd in Grafana; axe; manual keyboard checks; light/dark screenshots; and required reviews.
3. Run actual repository commands against the intended revision. Record command, working directory, exit code, timestamps, relevant output, environment, base/HEAD, and evidence-file SHA256. Distinguish a failed assertion from startup failure, skipped tests, and zero discovered tests.
4. Label mocks and stubs explicitly. Real BFF integration must exercise the real Grafana → BFF → query-service path in the required environment; mock-only E2E cannot satisfy it.
5. Inspect screenshot differences and obtain human baseline approval. Require genuine G1/G2/G5b human records and actual different-family review identity where required; do not self-approve or silently substitute.
6. Write the Korean report in `docs/sdlc/<KEY>/04-verify-report.md`. The conductor alone applies protocol-supported state updates after auditing returned diffs/evidence, then reruns the checker. Later subject changes invalidate affected evidence.

## Bounded example

`state.json` says G4 passed, but the screenshot artifact changed and Grafana cannot start. Report the hash mismatch and failed startup separately. Restore trustworthy evidence and rerun verification; neither the state flag nor a passing mocked test authorizes release.

## Stop and output

Return the evidence matrix with passed/failed/blocked/not-applicable reasons, command excerpts, hashes, review identities, and blockers. Infrastructure unavailability is `BLOCKED`, not pass; keep the gate unpassed.

Missing human decisions are `NEEDS_HUMAN`. Never claim “will pass,” equate PR existence with completion, or mark Done before production application and health are verified under the release protocol.
