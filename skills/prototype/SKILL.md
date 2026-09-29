---
name: prototype
description: Use when a UI design question needs visual comparison or validation inside a real Grafana plugin.
---

# Prototype

Prototypes answer design questions; they are never production implementation.

This skill applies only to product UI decisions. For an architecture diagram or
non-UI comparison, return to `visual-companion` diagram/comparison mode without
starting a Grafana sandbox or treating missing Grafana/Docker as a blocker.

Read the [shared principles](../sdlc/references/principles.md). Import this plugin's `visual-companion`, `grafana-plugin-dev`, and `grafana-plugin-testing` references using the native tool or exact `<PLUGIN_ROOT>/skills/<name>/SKILL.md` files. Reuse already-active references; if `visual-companion` invoked this skill, reuse its current session and selection channel. Never dispatch it recursively.

Imports supply guidance, not permission to execute another workflow. Use only sandbox API/theme guidance and prototype-only testing here; approved production contracts, production implementation, step generation, and RED evidence are not prerequisites. Do not run setup or provisioning merely because a reference was loaded.

## Procedure

1. State the question, target users, compared alternatives, and decision criteria in Korean under `docs/sdlc/<KEY>/prototype/`. Confirm allowed sandbox paths before writing code.
2. Build two or three **throwaway** single-HTML alternatives with representative data and light/dark approximations. Make variant selection explicit; record the human's choice and reasons.
3. Re-create the chosen interaction in a **separate throwaway sandbox plugin using actual `@grafana/ui`** and the repository's installed Grafana APIs. Run it in local Grafana using the repository's Docker Compose/provisioning configuration and mock data.
4. Check loading, empty, error, populated, and large-result states. Exercise real Grafana layout, theme, and plugin context; record screenshots, axe results, manual keyboard checks, and UX findings.
5. Request human approval of the selected design and screenshot baselines. Record identity, timestamp, artifact hashes, and remaining limitations; a selection click alone is not G1.

## Bounded example

A human selects a threshold badge in an already-active visual companion. Reuse that session, then validate real Grafana theme tokens and keyboard focus in the sandbox without demanding a BFF implementation. Deliver the interaction specification and approved screenshots to the test-writer; implement production behavior afresh from approved tests.

## Stop and output

Output the comparison, selection record, sandbox evidence, UX issues, and approved behavior specification. **Never copy, translate, or promote HTML or sandbox prototype code into production**, even when it appears complete. Screenshots and decisions are inputs, not reusable implementation.

Mock sandbox success does not prove real BFF integration. If Grafana/Docker is unavailable, return `BLOCKED` with the failed command and recovery prerequisite; HTML alone does not complete sandbox validation. Missing human approval is `NEEDS_HUMAN`. In an SDLC run, return evidence to the conductor for state validation; standalone use needs no run state.
