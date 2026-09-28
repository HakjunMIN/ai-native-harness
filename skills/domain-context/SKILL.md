---
name: domain-context
description: Use when domain terms are new or conflicting, names drift across modules, or a design decision needs a durable rationale.
---

# Domain Context

Use one agreed vocabulary across tickets, contracts, tests, and code.

Read the [shared protocol](../sdlc/references/protocol.md) before changing ticket artifacts. Load related skills with the native tool when available; otherwise read this plugin's exact skill file, not a same-name external skill.

## Procedure

1. Read `CONTEXT.md`, relevant `docs/adr/`, the intake snapshot, and affected code/contract names. Separate observed usage from agreed meaning.
2. For each new or conflicting term, propose a definition, scope, example, counterexample, and aliases. Ask the domain owner to resolve competing meanings before treating a proposal as canonical.
3. Record confirmed definitions and their decision sources in `CONTEXT.md`; label unresolved definitions as proposals. Use Korean explanations while preserving exact code identifiers.
4. Map canonical terms to API fields, UI labels, Gherkin steps, and Java/TypeScript identifiers. Identify migration impact before renaming public fields; use this plugin's `api-contract` skill for contract changes.
5. For a consequential design choice, write a ticket-local ADR in `docs/sdlc/<KEY>/adr/` with context, alternatives, decision status, consequences, and links. Promote accepted decisions to `docs/adr/` without erasing superseded history.

## Bounded example

“Service” might mean an OTel `service.name` or a Kubernetes Service. Record distinct definitions and examples; do not silently rename both to `serviceId`. Document how the BFF's identifier maps to the chosen domain concept.

## Stop and output

Output the glossary delta, unresolved terms and owners, naming map, and ADR status. Conflicting ownership or a contract-breaking interpretation is `NEEDS_HUMAN`; do not mass-rename code to force agreement.

Keep edits within the assigned paths; request a separate implementation handoff for code changes. Record artifact hashes and decision sources. Before phase progression, run `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>`; stale glossary or ADR evidence must not authorize progression.
