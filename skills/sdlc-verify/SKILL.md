---
name: sdlc-verify
description: Use when implementation is complete and a ticket needs integrated test, UX, review, and release-readiness evidence.
---

# Verify

Read [protocol](../sdlc/references/protocol.md). Require `next=verify` with valid G3.
Invoke `verification-gate`; dispatch `sdlc-verifier` with the approved test matrix.

Run the configured Gradle unit/integration/API tasks, FE Jest/RTL, lint/typecheck,
build, Gherkin generation and Playwright suites. Do not assume `gradlew test` runs
custom integration tasks. Verify real plugin -> BFF -> query-service behavior for
impacted integration AC; label mock tests separately.

For UI changes invoke `grafana-plugin-testing`: light/dark screenshot comparison,
axe, keyboard/manual accessibility, Grafana design-system and heuristic review by
`sdlc-ux-designer`. Screenshot baseline updates need explicit human approval of the
diff, not an automatic `--update-snapshots`. Backend-only checks may mark UI N/A
with a scope reason; blocked UI infrastructure is not N/A.

Review the complete base-to-head diff with `sdlc-cross-reviewer`, using a confirmed
different model family for every author scope. Invoke the host's security-review
agent when available; otherwise record the missing capability as BLOCKED, not a
clean security result. Do not run cloud delegation.

Write `04-verify-report.md`: AC matrix, commands/cwd/exit codes/timestamps,
subject SHA, output hashes, environment versions, UX artifacts, model provenance,
review findings/dispositions, untested paths and limitations. All required checks
must actually pass. Tests unavailable due to Docker/Grafana/MCP are BLOCKED.

Code fixes invalidate G3 and downstream gates; contract/requirements gaps return
to G2/G1 and require renewed human approval. Rerun after the final fix/refactor.
Only then record G4 evidence and final review, update Jira to Ready for Release,
and return the release handoff. Never replace measured output with “should work.”
