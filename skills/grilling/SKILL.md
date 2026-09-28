---
name: grilling
description: Use when a ticket leaves behavior, scope, acceptance criteria, or design choices ambiguous.
---

# Grilling

Turn uncertainty into explicit decisions before implementation.

Read the [shared protocol](../sdlc/references/protocol.md). Use its artifact and human-approval records; an interview is not approval.

## Procedure

1. Read the intake snapshot, acceptance criteria, affected modules, and existing discovery decisions. List unresolved branches: actor, permissions, happy path, empty/error states, limits, and exclusions.
2. Ask **one question per turn**, prioritizing the branch that changes scope or architecture most. Offer two or three concrete choices and an “other” option when useful.
3. Explain the consequence of each choice without steering the person toward the easiest implementation. For visual choices, load this plugin's `visual-companion` skill through the native skill tool, or read its exact `SKILL.md` under `<PLUGIN_ROOT>/skills/visual-companion/`.
4. Record the answer, source, affected acceptance criteria, and remaining branches in `docs/sdlc/<KEY>/01-discovery.md`. Use Korean for the artifact.
5. Continue until every material branch is answered or explicitly deferred with an owner and a blocking consequence. Restate the resulting behavior for human confirmation.

## Bounded example

“When a service has no requests in the selected interval, should its error-rate badge show (A) No data, (B) 0%, or (C) another state?”

Record the selected meaning and its accessibility wording, not merely “badge approved.” Then ask about authorization separately.

## Stop and output

Return a decision ledger, acceptance-criteria changes, and the next unresolved question. Under deadline pressure, do not invent answers or convert silence into consent. If the decision-maker is unavailable, return `NEEDS_HUMAN` with the single highest-impact question.

Missing intake evidence is `BLOCKED`; an outbox request does not satisfy G0. G1/G2/G5b require genuine human records. Before phase progression, run `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>`; a recorded `passed` string alone is insufficient.
