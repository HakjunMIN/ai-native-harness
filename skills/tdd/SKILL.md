---
name: tdd
description: Use when implementing a feature, changing behavior, fixing a regression, or selecting verification for a non-behavior change.
---

# Test-Driven Development

Read [shared principles](../sdlc/references/principles.md). This technical skill
works standalone; it does not require Jira or initiate SDLC. In an SDLC assignment,
use the supplied approved policy, ACs and allowlist; phase entry is the conductor's job.

## Select verification by actual change

- **Behavior/regression:** write the smallest public-interface test, observe the
  expected assertion fail, implement GREEN, refactor and rerun affected tests.
  Infrastructure/syntax failure and zero discovered tests do not qualify as RED.
- **Refactor:** capture a passing before-baseline and rerun relevant behavior tests
  after editing. Do not fabricate a failure for behavior that must remain unchanged.
- **Documentation/config:** use meaningful link/schema/render/lint or relevant
  runtime checks. Record why RED is inapplicable; behavioral configuration changes
  still need behavioral testing.

Use existing tools: backend JUnit (Spring) or `go test` (Go) unit/integration/API tests, frontend unit tests
or playwright-bdd for relevant E2E behavior. Mock external boundaries, and label
mock coverage separately from live integration. Record commands, cwd, exit codes,
revision and useful output; preserve hashed evidence when the caller requires it.

Light/standalone work may use one author for tests and implementation. Strict SDLC
assigns tests to a test-writer and freezes them for the production implementer.
Never weaken assertions, fixtures, snapshots, tolerances or skips to make GREEN.
Disputed expected behavior needs contract evidence and review, not silent edits.

For approved G3 revalidation, historical RED can establish unchanged test-first
provenance after inspection, not current success. Always run fresh GREEN/review;
new regression tests require new RED. Obtain the caller's independent review
(combined in light SDLC, separate axes in strict); never claim self-review as
independent. After three failed attempts use bounded diagnosis, then escalate if
no supported next step emerges.
