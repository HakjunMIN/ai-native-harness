---
name: verification-gate
description: Use when claiming completion, recording a gate result, resuming SDLC run state, or evaluating test and review evidence.
---

# Verification Gate

A claim is only as current as its evidence and tested subject.

Read [shared principles](../sdlc/references/principles.md). Use the caller's policy
and evidence requirements; standalone verification does not require SDLC run state.

## Procedure

1. Establish the actual subject and expected checks. For SDLC gate progression the
   conductor runs `state.mjs check`; specialists validate assigned evidence, not
   the entire workflow. State claims do not override stale hashes or changed source.
2. Build a requirement-to-evidence matrix from the approved plan and repository configuration. Include applicable Gradle/JUnit unit, integration and API tests; Jest/RTL; playwright-bdd in Grafana; axe; manual keyboard checks; light/dark screenshots; and required reviews.
3. Run actual repository commands against the intended revision. Record command, working directory, exit code, timestamps, relevant output, environment, base/HEAD, and evidence-file SHA256. Distinguish a failed assertion from startup failure, skipped tests, and zero discovered tests.
4. Label mocks and stubs explicitly. Real BFF integration must exercise the real Grafana → BFF → query-service path in the required environment; mock-only E2E cannot satisfy it.
5. For UI changes inspect screenshot differences and obtain baseline approval.
   In SDLC require genuine G1/G2/G5b records and policy-compliant review provenance;
   standalone verification does not invent gate requirements or self-approve.
6. Return the requested report (SDLC: `04-verify-report.md`). The conductor alone
   updates SDLC state. Later subject changes invalidate affected evidence; scope
   revalidation by impact, but rerun final integrated checks before G3/G4.

## Bounded example

`state.json` says G4 passed, but the screenshot artifact changed and Grafana cannot start. Report the hash mismatch and failed startup separately. Restore trustworthy evidence and rerun verification; neither the state flag nor a passing mocked test authorizes release.

## Stop and output

Return the evidence matrix with passed/failed/blocked/not-applicable reasons, command excerpts, hashes, review identities, and blockers. Infrastructure unavailability is `BLOCKED`, not pass; keep the gate unpassed.

Missing human decisions are `NEEDS_HUMAN`. Never claim “will pass,” equate PR existence with completion, or mark Done before production application and health are verified under the release protocol.
