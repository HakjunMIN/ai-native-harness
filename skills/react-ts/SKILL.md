---
name: react-ts
description: Use when React and TypeScript state, hooks, typing, or large Grafana DataFrame rendering need changes.
---

# React and TypeScript

Keep UI state explicit and transformations predictable before optimizing.

Read the [shared protocol](../sdlc/references/protocol.md). Use this plugin's `grafana-plugin-dev` and `tdd` skills through native invocation or exact plugin-root skill files.

## Procedure

1. Inspect strict TypeScript settings, existing components/hooks, generated API types, and approved behavior. Preserve strictness; narrow unknown input instead of hiding it with `any` or unchecked casts.
2. Keep state at the lowest shared owner. Separate durable query/options state from ephemeral interaction state; derive values instead of synchronizing duplicate state.
3. Call hooks unconditionally. Make effect dependencies accurate and clean up subscriptions, timers, and requests. Guard against stale responses when query inputs change; do not suppress dependency lint to conceal a race.
4. Represent loading, error, empty, and ready states explicitly. Render errors safely and use accessible Grafana controls with theme tokens.
5. Treat DataFrames and props as immutable. Confirm field types, units, nulls, and stable row/series identities. Use measured virtualization/windowing for large lists and avoid repeatedly materializing entire frames during render.
6. Add memoization only for measured work or required referential stability; preserve correctness without relying on cache persistence. Use stable keys and avoid mutating shared frame values.
7. Implement against frozen test-writer assertions. Run existing typecheck, lint, and affected Jest/RTL tests; use the Grafana E2E skill for user-visible interactions.

## Bounded example

Changing the time range starts a second request before the first completes. An older response must not replace the newer result. Specify the race in a test, then use cancellation or request identity to ignore stale completion; adding `useMemo` to the render path does not solve it.

## Stop and output

Output state ownership, boundary types, race/large-data decisions, production diff, and command evidence with hashes/base/HEAD.

Ambiguous API semantics or missing regression coverage is `BLOCKED`; return to the contract owner/test-writer rather than weakening assertions. Never promote throwaway prototype code, store credentials in browser state, or treat browser tenant claims as verified identity.

Before phase progression, run `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>`.
