---
name: bdd-gherkin
description: Use when frontend acceptance behavior needs Gherkin scenarios or reusable playwright-bdd steps.
---

# BDD Gherkin

Gherkin belongs to frontend E2E behavior only. Backend acceptance criteria become JUnit 5 unit, integration, and API tests—not Cucumber.

Read the [shared principles](../sdlc/references/principles.md). Import `grafana-plugin-testing` as a reference through the native tool or exact `<PLUGIN_ROOT>/skills/grafana-plugin-testing/SKILL.md`; reuse it if already active. Importing a reference does not execute its workflow or recursively dispatch another skill.

## Select the caller's mode

### Discovery/draft mode: before G1 or during planning

1. Read available intake AC, `CONTEXT.md`, and current design answers. Assign stable AC IDs and record unresolved behavior as questions.
2. Draft declarative scenarios in `docs/sdlc/<KEY>/features/*.feature`, with an AC tag/map, one behavior each, domain vocabulary, minimal Background, and explicit outcomes. Write run artifacts in Korean.
3. Reuse existing vocabulary where available; keep selectors and HTTP plumbing out of scenarios. Review the drafts with the human as G1 inputs.

**No approved discovery, approved BFF contract, step implementations, generated tests, or executed RED is required in draft mode.** Missing future implementation is not a blocker. Do not install tools, provision services, or execute E2E merely to draft scenarios.

### Implementation mode: authorized test implementation

1. Use agreed behavior/contracts and assigned test scope. In SDLC the conductor
   supplies valid G2, manifest and policy (light parent, strict published child).
   Standalone use requires no publication or state. Map scenarios to relevant ACs.
2. Inspect pinned versions/configuration. Where supported, extend the exported `@grafana/plugin-e2e` fixture with playwright-bdd `test.extend` and bind steps to that fixture. Never substitute bare Playwright.
3. Implement reusable steps and run configured BDD generation plus selected E2E. Capture the expected behavior failure before production implementation. Broken fixtures, unavailable dependencies, or zero discovered scenarios are not RED.

## Bounded example

```gherkin
@AC-FE-03
Scenario: Identify a service above the error threshold
  Given a service exceeds the selected error threshold
  When the user views the service map
  Then that service shows a high-error-rate status
```

Before G1, return this draft and threshold questions without demanding RED. After
G2 (and strict publication), its step assertion checks the approved accessible state.
For unchanged scenarios under G3 revalidation, use the historical-RED procedure
in `sdlc-tasks`; changed steps/scenarios require new RED.

## Stop and output

Draft output: AC-to-scenario map, feature paths, unresolved decisions, and approval request. Implementation output additionally includes step paths, fixture/version evidence, and generation/RED results. Implementers cannot weaken assertions.

In implementation mode, unsupported fixture integration or unavailable required live dependencies is `BLOCKED`; label mocks. Unresolved human behavior decisions are `NEEDS_HUMAN`. In an SDLC run, return evidence to the conductor for state validation; standalone use needs no run state.
