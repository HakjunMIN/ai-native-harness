---
name: sdlc-setup
description: Use when onboarding an observability monorepo to ai-native-sdlc or when repository paths, tooling, models, or optional Jira mappings have changed.
---

# Repository setup

Read [protocol](../sdlc/references/protocol.md). No deployment or global config edits.

1. Inspect AGENTS.md, Gradle wrapper/settings, package manifests/lockfiles,
   plugin.json files, CI and Helm/ArgoCD layout. Confirm Java, Node, Grafana and
   pinned SigNoz versions from files. Do not assume sample module paths.
   Use `signoz-oss` for the component/edition/metadata inventory. Load `clickstack`
   only for explicit evaluation or an existing in-scope ClickStack/HyperDX deployment;
   ClickHouse presence alone is not a trigger. Do not install upstream plugins/MCP.
2. Copy the plugin's `templates/ai-native-sdlc.config.json` to the repo root only
   when absent. Preserve existing settings on reruns; propose a diff.
3. Populate `modules` with actual paths for BFF, React, each datasource/panel/app,
   query-service patches and deployment. Populate `commands` with records
   `{cwd, argv, purpose}` for unit, integration, API, typecheck, lint, BDD generation,
   E2E, axe, screenshots, build and chart validation where applicable. Missing
   required commands block their checks, not unrelated work. Reuse repository tools.
4. For Jira work, discover available Atlassian MCP schemas; verify authorized read access and
   project/status transition IDs without changing an issue. Store mappings,
   never tokens. Missing MCP is an explicit capability limitation.
   Discover `jira.tickets` creation issue type, required fields, parent relationship
   and blocking-link mappings. Require explicit operator choices where the project
   allows multiple hierarchies. Do not create probe issues; missing mappings block
   later Jira publication, not local intake, public-doc research or local drafts.
   Local work requires no Jira project, MCP credentials or child-issue mapping.
5. Ask for allowed local role models; inspect runtime availability. Set `models`
   entries only for confirmed IDs with family, and verify actual dispatch support.
   Preserve host defaults otherwise. Record review capabilities, not a global
   setup failure: new light and strict policies recommend different-family review
   but default `requireDifferentFamily` to false. A same-model independent session
   or evidenced human review is eligible as policy permits. Missing cross-family
   routing blocks only explicit true or legacy requirements, not a recommendation.
   A named security agent is not mandatory. Explain `workflow.boundedProfile`
   and review flags; preserve existing config and approved snapshots.
6. Record capabilities for local subagents, browser and hooks. Read
   [compatibility](../../docs/compatibility.md); a manifest is not a capability test.
   Check each assigned role's actual read/search/edit/execute tools. Claude native
   names and Copilot aliases do not register Codex agents or enforce Codex tool
   permissions. On Codex use an explicitly scoped local role prompt; report
   unverified restrictions. Without native Skill/MCP/browser tools, read exact
   skill files and request scoped external evidence from the conductor.
   Read-only reviewers must not execute shell commands to obtain missing evidence.
7. Configure production paths/application identities from GitOps files; keep
   `production: human-only`. Confirm branch protections and prod RBAC with operator.
8. Follow [project governance](../sdlc/references/project-governance.md): discover
   existing architecture, standards and ADR locations and their owners. Preserve
   those conventions; when absent, use `docs/architecture/overview.md`,
   `docs/architecture/adr/` and `docs/standards/` for needed project documents.
   Record locations, index entrypoints and reading rules in the project's AGENTS.md
   through an authorized diff. Do not create empty standards or accepted decisions
   merely to finish setup; missing policy decisions remain explicit questions.
9. Update existing domain context only when useful; use `domain-context` for
   consequential vocabulary gaps, not a mandatory empty glossary. Report setup diff and unresolved
   capabilities in Korean.

Run approved read-only version/build discovery commands. Do not install dependencies
until a relevant manifest changes or execution shows missing dependencies.

Example module mapping: `"bff": {"path":"services/api","kind":"spring-boot-bff"}` is
valid only after finding that actual module. Do not generate a sample app to make
setup pass. Exit ready-for-intake or BLOCKED with exact missing input.
