---
name: sdlc-setup
description: Use when onboarding an observability monorepo to ai-native-sdlc or when repository paths, tooling, models, or Jira mappings have changed.
---

# Repository setup

Read [protocol](../sdlc/references/protocol.md). No deployment or global config edits.

1. Inspect AGENTS.md, Gradle wrapper/settings, package manifests/lockfiles,
   plugin.json files, CI and Helm/ArgoCD layout. Confirm Java, Node, Grafana and
   pinned SigNoz versions from files. Do not assume sample module paths.
2. Copy the plugin's `templates/ai-native-sdlc.config.json` to the repo root only
   when absent. Preserve existing settings on reruns; propose a diff.
3. Populate `modules` with actual paths for BFF, React, each datasource/panel/app,
   query-service patches and deployment. Populate `commands` with records
   `{cwd, argv, purpose}` for unit, integration, API, typecheck, lint, BDD generation,
   E2E, axe, screenshots, build and chart validation. Missing commands are blockers,
   not empty success. Reuse the repository's tools.
4. Discover available Atlassian MCP schemas; verify authorized read access and
   project/status transition IDs without changing an issue. Store mappings,
   never tokens. Missing MCP is an explicit capability limitation.
5. Ask for allowed local role models; inspect runtime availability. Set `models`
   entries only for confirmed IDs with family, and verify actual dispatch support.
   Preserve host defaults otherwise. Cross-family unavailability blocks reviews.
6. Record capabilities for local subagents, browser and hooks. Read
   [compatibility](../../docs/compatibility.md); a manifest is not a capability test.
7. Configure production paths/application identities from GitOps files; keep
   `production: human-only`. Confirm branch protections and prod RBAC with operator.
8. Establish `CONTEXT.md` via `domain-context`; report setup diff and unresolved
   capabilities in Korean.

Run approved read-only version/build discovery commands. Do not install dependencies
until a relevant manifest changes or execution shows missing dependencies.

Example module mapping: `"bff": {"path":"services/api","kind":"spring-boot-bff"}` is
valid only after finding that actual module. Do not generate a sample app to make
setup pass. Exit ready-for-intake or BLOCKED with exact missing input.
