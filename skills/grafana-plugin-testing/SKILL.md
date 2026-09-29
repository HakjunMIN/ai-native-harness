---
name: grafana-plugin-testing
description: Use when Grafana plugin behavior, frontend Gherkin, accessibility, screenshots, or real BFF integration need verification.
---

# Grafana Plugin Testing

Test both isolated UI behavior and its actual Grafana environment.

Read the [shared principles](../sdlc/references/principles.md). Import `bdd-gherkin` natively or from `<PLUGIN_ROOT>/skills/bdd-gherkin/SKILL.md` as a reference only; reuse an already-active reference without recursive dispatch.

## Select the caller's mode

- **Discovery drafting:** review scenario clarity, AC coverage, and planned test boundaries. No production implementation, approved contract, steps, generated tests, RED, or live BFF is required. Return a coverage draft and open questions; do not provision services or install tooling.
- **Prototype-only review:** inspect the assigned throwaway Grafana sandbox with mock data, actual `@grafana/ui`, and the UX checks below. No production implementation, approved API contract, executable Gherkin, RED, or real BFF integration is required. Return sandbox/UX evidence and limitations, not G4 claims.
- **Implementation after G2 / verification:** follow the executable procedure below within the assigned test scope. RED belongs to test-writing before production implementation; verification reruns the implemented candidate.

Reference loading never starts setup or a later phase. Missing infrastructure blocks only a check required by the active mode.

## Executable procedure

1. Inspect pinned versions, existing Jest/RTL and Playwright configuration, provisioning files, Grafana image, and package scripts. Use the repository's commands rather than assumed CLI flags.
2. Use Jest and React Testing Library for component behavior, accessible roles, state transitions, and DataFrame transformations. Mock external boundaries, not the behavior being asserted.
3. Run frontend Gherkin with playwright-bdd. **Reuse the `@grafana/plugin-e2e` fixture**: where installed versions support it, compose its exported test with playwright-bdd `test.extend`, then use the same extended test for step definitions and generation/configuration.
4. Confirm generated scenarios use that fixture and the provisioned plugin/datasource. Do not replace it with a bare Playwright page fixture or silently skip unsupported scenarios. Check actual test discovery; capture RED in implementation mode.
5. Execute in local Grafana with controlled provisioning. Label mocked datasource/BFF tests as mock E2E. Separately exercise Grafana → real Spring BFF → real query-service for required integration evidence.

## UX checks: sandbox or implemented plugin

Run `@axe-core/playwright` on relevant states, then manually verify keyboard navigation, focus visibility/order, dismissal, and non-color cues. Axe alone cannot establish accessibility. Check light/dark themes, responsive layout, and empty/error/loading/populated states. Require **human approval** of screenshot baselines; never auto-accept diffs.

## Bounded example

A pre-G1 sandbox has no BFF implementation. Review its mock-driven UX without demanding live E2E. After G2, a generated test using bare Playwright must regain the Grafana fixture and be executed; a generated file is not execution evidence.

## Stop and output

Return the mode, its scoped outputs, evidence, mock/live labels, and blockers. For executed checks include version/fixture provenance, commands/counts, UX findings, screenshots, and human baseline approval.

Unsupported fixtures or missing required infrastructure are `BLOCKED` only for applicable executable checks. A missing sandbox blocks sandbox review; a missing real BFF does not. Mock success cannot satisfy required live integration.

In an SDLC run, return evidence to the conductor for state validation; standalone use needs no run state.
