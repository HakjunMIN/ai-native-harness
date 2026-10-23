---
name: grilling
description: Use when a Jira ticket or local request leaves behavior, scope, acceptance criteria, or design choices ambiguous.
---

# Grilling

Turn uncertainty into explicit decisions before implementation.

Read [shared principles](../sdlc/references/principles.md). An interview is not
approval. Standalone clarification needs no Jira ticket or gate record.
Use [discovery review](../sdlc/references/discovery-review.md) to classify decisions
as `now`, `g1` or `record`. Outside SDLC, use the caller's review point rather
than inventing G1; ask before dependent work if no later review is available.

## Procedure

1. Read the intake snapshot, acceptance criteria, affected modules, existing
   answers and project rules. Investigate actors, permissions, behavior, errors,
   limits and exclusions; these are research prompts, not a question checklist.
2. Ask only `now` decisions after bounded investigation. Aim for one batch with
   predictable conditional follow-ups. More than three `now` choices signals a
   scope/spike discussion, not permission to hide a blocker. Prepare disclosed
   `g1` recommendations without a separate interview; record reversible
   low-risk assumptions and existing decisions without asking again.
3. Explain the consequence of each choice without steering the person toward the easiest implementation. For visual choices, load this plugin's `visual-companion` skill through the native skill tool, or read its exact `SKILL.md` under `<PLUGIN_ROOT>/skills/visual-companion/`.
4. Record consequential answers, owners, sources and classification in the
   caller's artifact (SDLC: `01-discovery.md`). Distinguish recommendations,
   confirmed answers and assumptions. Reuse stable decision IDs across intake,
   discovery and the approval summary.
5. Stop questioning once decisions needed for the authorized task are clear.
   Deferred questions block only dependent work; never invent customer decisions.

## Bounded example

“When a service has no requests in the selected interval, should its error-rate badge show (A) No data, (B) 0%, or (C) another state?”

Record the selected meaning and its accessibility wording, not merely “badge approved.”
If authorization is unresolved, use a distinct decision field in the same batch
when possible, not an automatic second interview.

## Stop and output

Return the decision records, acceptance-criteria changes and next required human
action, which may be G1 review rather than another question. Under deadline
pressure, do not invent answers or convert silence into consent. If a `now`
decision-maker is unavailable, return `NEEDS_HUMAN` with the highest-impact
blocker and its dependent work.

In an SDLC run, return decisions to the conductor; it owns intake validation and
human gate records. Standalone clarification does not create an SDLC run.
