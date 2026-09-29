---
name: grilling
description: Use when a ticket leaves behavior, scope, acceptance criteria, or design choices ambiguous.
---

# Grilling

Turn uncertainty into explicit decisions before implementation.

Read [shared principles](../sdlc/references/principles.md). An interview is not
approval. Standalone clarification needs no Jira ticket or gate record.

## Procedure

1. Read the intake snapshot, acceptance criteria, affected modules, and existing discovery decisions. List unresolved branches: actor, permissions, happy path, empty/error states, limits, and exclusions.
2. Ask only material unresolved questions; prioritize those changing correctness,
   scope, authority or architecture. Group related questions when clearer. Do not
   force an interview for settled intent; record reversible low-risk assumptions.
3. Explain the consequence of each choice without steering the person toward the easiest implementation. For visual choices, load this plugin's `visual-companion` skill through the native skill tool, or read its exact `SKILL.md` under `<PLUGIN_ROOT>/skills/visual-companion/`.
4. Record consequential answers and sources in the caller's artifact (SDLC:
   `01-discovery.md`). Keep the ledger proportional to the decision.
5. Stop questioning once decisions needed for the authorized task are clear.
   Deferred questions block only dependent work; never invent customer decisions.

## Bounded example

“When a service has no requests in the selected interval, should its error-rate badge show (A) No data, (B) 0%, or (C) another state?”

Record the selected meaning and its accessibility wording, not merely “badge approved.” Then ask about authorization separately.

## Stop and output

Return a decision ledger, acceptance-criteria changes, and the next unresolved question. Under deadline pressure, do not invent answers or convert silence into consent. If the decision-maker is unavailable, return `NEEDS_HUMAN` with the single highest-impact question.

In an SDLC run, return decisions to the conductor; it owns intake validation and
human gate records. Standalone clarification does not create an SDLC run.
