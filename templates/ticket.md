# Ticket document view

This is a field guide, not a second authoring template. Write the canonical
[ticket definition](ticket-plan.json); the conductor runs `scripts/tickets.mjs
prepare STATE CONFIG DRAFT`. Strict detailed Markdown is generated from that
same definition. Light uses the canonical outcome on the parent without a child
Markdown requirement. Never manually synchronize or edit generated AC copies.

- `id`, `title`, `goal`: stable identity and one independently verifiable outcome.
- `scope`, `nonGoals`: included behavior and explicit exclusions.
- `acceptanceCriteria`: local ID, parent requirement, observable result, check kinds.
- `blockedBy`: only necessary dependencies on other local outcome IDs.
- `details`: contract/UX references, fixture/environment rationale and completion
  criteria. Reference AC IDs instead of repeating their text.

Verification follows the approved change kind: behavior RED/GREEN, refactor
before/GREEN, documentation/config meaningful checks. Independent review follows
policy; implementation complete does not mean Jira Done or production release.
Exact edit paths/commands belong in the current handoff. Publication keys and
execution logs belong in their ledgers, not approved generated documents.

Legacy manifests remain strict and keep their existing document/hash semantics
until explicitly invalidated, regenerated and reapproved under the
[ticket contract](../skills/sdlc-tickets/references/ticket-contract.md).
