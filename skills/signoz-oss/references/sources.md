# SigNoz primary-source map

Reviewed: 2026-09-28. Links to `main` and current docs are discovery entrypoints,
not proof of compatibility with a deployed fork. For a ticket, record fetched
URL, heading, access date, resolved upstream commit/tag, deployed version and
what claim the source supports. Replace branch links with commit permalinks in
the final handoff when code behavior matters. Inspect only relevant files.

## Official skills already exist

The [official catalog](https://signoz.io/docs/ai/agent-skills/) and
[SigNoz/agent-skills](https://github.com/SigNoz/agent-skills) cover docs discovery,
MCP setup, queries, alerts, dashboards, saved views and post-ingestion operations.
They are not a substitute for this platform's OSS fork/migration approval gates.
This package does not vendor, install, or silently update that plugin.

| Official skill/source | Reuse | Compatibility boundary |
|---|---|---|
| [signoz-searching-docs](https://github.com/SigNoz/agent-skills/blob/main/plugins/signoz/skills/signoz-searching-docs/SKILL.md) | Canonical documentation discovery, narrow fetch, truncation handling | Discover live MCP tool schemas first; otherwise fetch public docs directly |
| [signoz-generating-queries](https://github.com/SigNoz/agent-skills/blob/main/plugins/signoz/skills/signoz-generating-queries/SKILL.md) | Ad-hoc metrics/logs/traces queries, not dashboard panels | Requires compatible live MCP tools; missing access blocks execution, not permission to auto-setup |
| [signoz-writing-clickhouse-queries](https://github.com/SigNoz/agent-skills/blob/main/plugins/signoz/skills/signoz-writing-clickhouse-queries/SKILL.md) | Signal-specific SQL reference and result shapes | Targets SigNoz dashboard panels; its table names/macros are versioned, not universal Grafana/BFF syntax |
| [Alert/dashboard/view skills](https://signoz.io/docs/ai/agent-skills/) | Product operations when explicitly requested and authorized | Do not expose SigNoz UI or create hidden product dashboards for a Grafana ticket |
| [SigNoz MCP server](https://signoz.io/docs/ai/signoz-mcp-server/) | Self-hosted stdio/HTTP and access requirements | Self-hosted MCP is separately operated; never send private instance data to a Cloud MCP endpoint by default |

Prefer the existing qualified upstream skill if installed, scope-compatible and
authorized. Otherwise use its public material as a reference; state that live
tool operations were not run. Upstream examples are not authority to disable
permission prompts, create service accounts, use `latest`, or widen this workflow.

The inspected query skill uses different timestamp representations and tables
for logs and traces. Treat those as **examples from that upstream revision**.
Verify the actual schema and server-side macro expansion before adapting SQL.
Do not copy `always use table X` rules into a version-agnostic BFF.

## Architecture and implementation

| Source | What to verify |
|---|---|
| [Technical architecture](https://signoz.io/docs/architecture/) | Collector -> ClickHouse and bundled SigNoz services; distinguish current binary layout from legacy query-service deployments |
| [SigNoz source](https://github.com/SigNoz/signoz) | Matching tag's entrypoints, routes, auth, application metadata configuration, feature/license boundaries |
| [Collector source](https://github.com/SigNoz/signoz-otel-collector) | Distribution-specific receivers/processors/exporters, static vs OpAMP config, migration entrypoints |
| [Collector component registry](https://github.com/SigNoz/signoz-otel-collector/blob/main/components/components.go) | Which components are compiled into the pinned distribution |
| [Collector configuration example](https://github.com/SigNoz/signoz-otel-collector/blob/main/example/example-config.yaml) | Pipeline wiring to compare against active config, not an automatic replacement |
| [Contributing](https://github.com/SigNoz/signoz/blob/main/CONTRIBUTING.md) | Upstream change/reproduction/contribution requirements; check the target repo's own test/build instructions |

The main repository explicitly marks Noz as Cloud-only. This is distinct from
MCP connectivity, which has a self-hosted path. Do not infer RBAC, SSO, retention
controls or entitlement from a shared Cloud/Self-Host docs tag alone.

## Installation and upgrades

| Source | Use |
|---|---|
| [Self-hosted installation index](https://signoz.io/docs/install/self-host/) | Select the existing deployment method; ArgoCD/Kubernetes are not Cloud mandates |
| [Upgrade guide](https://signoz.io/docs/operate/upgrade/) | Required intermediate stops, version-pinned upgrade sequence, wait for migrations |
| [Upgrade path tool](https://signoz.io/upgrade-path/) | Resolve current-to-target hops before proposing changes |
| [Version-specific releases](https://github.com/SigNoz/signoz/releases) | Breaking changes and migration warnings for each actual target |

If documentation and deployed code disagree, record the conflict and investigate
the pinned version. Do not "fix" production to match newest documentation.
Search-result summaries and third-party blogs are leads, not authoritative evidence.
