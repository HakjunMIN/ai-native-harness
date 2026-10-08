---
name: domain-context
description: Use when domain terms are new or conflicting, names drift across modules, or a design decision needs a durable rationale.
---

# Domain Context

Use one agreed vocabulary across sub tasks, contracts, tests, and code.

Read the [shared principles](../sdlc/references/principles.md) before changing task artifacts. Load related skills with the native tool when available; otherwise read this plugin's exact skill file, not a same-name external skill.

## Procedure

1. Read existing `CONTEXT.md`, relevant ADRs and affected names as needed.
   Standalone work needs no intake snapshot. Separate observed usage from agreed meaning.
2. For each new or conflicting term, propose a definition, scope, example, counterexample, and aliases. Ask the domain owner to resolve competing meanings before treating a proposal as canonical.
3. Record confirmed definitions and their decision sources in `CONTEXT.md`; label unresolved definitions as proposals. Use Korean explanations while preserving exact code identifiers.
4. Map canonical terms to API fields, UI labels, Gherkin steps, and Java/Go/TypeScript identifiers. Identify migration impact before renaming public fields; use this plugin's `api-contract` skill for contract changes.
5. Follow [project governance](../sdlc/references/project-governance.md) for
   consequential, durable choices. Put cross-feature decisions in project ADRs
   and current rules in project standards; keep feature-only decisions in the
   plan or a run-local ADR. Classify by impact, not reuse count. Preserve
   superseded history and require explicit project-owner approval for shared
   changes or exceptions; feature approval alone does not grant that authority.

## Bounded example

“Service” might mean an OTel `service.name` or a Kubernetes Service. Record distinct definitions and examples; do not silently rename both to `serviceId`. Document how the BFF's identifier maps to the chosen domain concept.

## Stop and output

Output the glossary delta, unresolved terms and owners, naming map, and ADR status. Conflicting ownership or a contract-breaking interpretation is `NEEDS_HUMAN`; do not mass-rename code to force agreement.

Keep edits within the assigned paths; request a separate implementation handoff for code changes. Record artifact hashes and decision sources. In an SDLC run, return evidence to the conductor for state validation; standalone use needs no run state.
