---
name: grafana-plugin-dev
description: Use when building or changing Grafana datasource, panel, or app plugins with React and TypeScript.
---

# Grafana Plugin Development

Implement native Grafana behavior against approved tests and contracts.

Read the [shared principles](../sdlc/references/principles.md). Import this plugin's `react-ts`, `api-contract`, and `grafana-plugin-testing` references natively or via their exact plugin-root skill files. Reuse active references; loading guidance does not execute their workflows.

## Scope

When imported for discovery/prototyping, apply only installed Grafana API, component, theme, and sandbox guidance. A throwaway mock-data sandbox does not require approved production contracts, production implementation, executable Gherkin, or RED. Use prototype-only testing; do not trigger setup, dependency installation, or production work from a reference import.

The production procedure applies to authorized implementation, not discovery.
In SDLC the conductor supplies G2/policy; standalone work needs no Jira/state.

## Production procedure

1. Inspect the plugin type, `plugin.json`, installed Grafana packages, existing `@grafana/create-plugin` structure, and supported Grafana versions. Reuse project tooling; do not re-scaffold an established plugin.
2. Confirm approved UI behavior. A selected HTML sketch must first be validated in a separate local Grafana sandbox using actual `@grafana/ui`. Never copy or translate prototype code into production; write fresh implementation from approved behavior and RED tests.
3. Follow the plugin's boundary:
   - **Datasource:** implement its existing `DataSourceApi`, query editor, query model, health check, and typed DataFrames with correct field units/time values.
   - **Panel:** use `PanelProps`, options builder, resize behavior, and accessible empty/loading/error states.
   - **App:** use supported pages/routing, navigation, and permissions without exposing the SigNoz UI.
4. Use `@grafana/ui`, `useStyles2`, and Grafana theme tokens for light/dark layouts. Avoid global CSS, hardcoded theme colors, and bespoke copies of Grafana controls.
5. For a backend-less datasource, call the Spring BFF through configured Grafana proxy/resource access supported by the installed version. Store credentials in `secureJsonData`/server-managed secrets and proxy configuration; never expose them in browser bundles, `jsonData`, logs, or localStorage.
6. Treat authenticated server context as identity authority. Browser-forged tenant headers must not choose another tenant. Query-service and ClickHouse are not direct browser targets.
7. Keep changes inside production allowlists; run existing typecheck/build and affected tests without modifying test expectations.

## Bounded example

A query editor needs a bearer token. Configure the supported secure field and proxy route; the editor stores query intent, not the token value. Validate through a sanitized proxy request rather than printing credentials.

## Stop and output

Return the plugin boundary, changed paths, approved-design references, contract/DataFrame mapping, and test evidence. Missing sandbox approval, incompatible Grafana APIs, or unresolved authentication is `BLOCKED` or `NEEDS_HUMAN` as appropriate.

In an SDLC run, return evidence to the conductor for state validation; standalone use needs no ticket state.
