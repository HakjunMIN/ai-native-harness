---
name: sdlc-verify
description: Use when implementation is complete and a Jira ticket or local run needs integrated test, UX, review, and release-readiness evidence.
---

# Verify

Read [protocol](../sdlc/references/protocol.md). Require `next=verify` with valid G3.
Invoke `verification-gate`; dispatch `sdlc-verifier` with the approved test matrix.

Include the Project baseline and approved exceptions in the verifier handoff.
Apply [project governance](../sdlc/references/project-governance.md): compare
applicable standards, ADRs and indexes with the reviewed baseline. Record rule
compliance, drift impact, shared-policy approvals and exception validity in
`04-verify-report.md`; missing comparison evidence remains unverified. Material
requirement or plan changes return to G1/G2. Use run-local reports as gate evidence,
not repository-relative project-document paths or parent traversal.

Run only applicable approved checks: Gradle unit/integration/API, FE Jest/RTL,
lint/typecheck, build, Gherkin generation or Playwright. Documentation/config can
use justified static/schema checks; do not require unrelated stack infrastructure.
Do not assume `gradlew test` runs
custom integration tasks. Verify real plugin -> BFF -> query-service behavior for
impacted integration AC; label mock tests separately.

For UI changes invoke `grafana-plugin-testing`: light/dark screenshot comparison,
axe, keyboard/manual accessibility, Grafana design-system and heuristic review by
`sdlc-ux-designer`. Screenshot baseline updates need explicit human approval of the
diff, not an automatic `--update-snapshots`. Backend-only checks may mark UI N/A
with a scope reason; blocked UI infrastructure is not N/A.

Review the complete base-to-head diff under the approved policy. Strict/legacy
requires independent final review; light uses independent combined review.
Both cover spec, standards and security. Different-family review is recommended
for new policies, not required when `requireDifferentFamily` is false; same-model
independent sessions qualify. Enforce explicit true or legacy family requirements
and the approved human-review flag. Reuse light slice review only when its
revision, scope, coverage and findings remain current. The host security agent is
optional: a capable independent reviewer may inspect security directly. Missing
necessary expertise blocks that review, not unrelated checks. No cloud delegation.

Write `04-verify-report.md`: AC matrix, commands/cwd/exit codes/timestamps,
subject SHA, output hashes, environment versions, UX artifacts, model provenance,
review findings/dispositions, untested paths and limitations. All required checks
must actually pass. Tests unavailable due to Docker/Grafana/MCP are BLOCKED.

Code fixes invalidate G3 and downstream gates; use impacted slices plus transitive
dependents only with a hashed impact analysis, otherwise invalidate all slices.
Contract/requirements gaps return
to G2/G1 and require renewed human approval. Rerun after the final fix/refactor.
Only then record G4 evidence and final review. Update Jira to Ready for Release
only for Jira-originated work, and return the release handoff. Never replace
measured output with “should work.”
