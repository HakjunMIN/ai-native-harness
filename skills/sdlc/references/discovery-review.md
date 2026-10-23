---
description: "Decision-focused discovery questions, approval summaries and G1 checks"
---

# Discovery review contract

Use this contract for intake, discovery and requirements clarification. It does
not start an SDLC run or grant authority to implement. Read the existing request,
confirmed answers, repository behavior and applicable standards before questioning.

## Classify before asking

Ask only when investigation and existing decisions cannot resolve an uncertainty,
the choice exceeds delegated authority, and its answer is needed now.

| Timing | Use when | Action |
|--------|----------|--------|
| `now` | The answer changes the investigation direction, safe boundary or viable scope | Ask before dependent work, with a recommendation, alternatives and consequences |
| `g1` | A human owns the choice, but a meaningful draft can be prepared without the answer | Present a clearly marked recommendation in the G1 summary and confirmation form |
| `record` | A fact, an existing decision or a reversible low-risk choice within delegated authority | Investigate or decide, record the basis, and do not interrupt the person |

Do not turn actors, permissions, errors, limits or exclusions into a mandatory
questionnaire. They are investigation prompts. Do not re-ask answers from intake
or policy. Low confidence alone does not justify a question: try bounded research
first. Unknown material risk remains `now` or strict policy, not a low-risk default.

Aim for one pre-draft question batch, including predictable conditional follow-ups.
Keep unrelated choices in distinct fields, not a single bundled answer. More than
three `now` decisions is a signal to propose narrower scope or a spike, not a hard
cap that permits hiding decisions. New evidence may justify another batch; explain
what changed. Zero questions is valid when no `now` decision remains.

Product meaning can require a human even without security impact. For example,
"no requests" versus "0% errors" changes the meaning of a metric. Put it at G1
when a draft is possible. Routine implementation details belong in planning.
Deferred decisions exclude their dependent work; continue unrelated authorized work.

## One document, two reading depths

Use [the discovery template](../../../templates/discovery.md) for
`01-discovery.md`. The approval summary is the human-facing view; the remaining
tables and context are the canonical detailed record. Do not create a separate
JSON ledger or independently maintained summary file. Preserve existing AC IDs
such as `AC-1`, `AC-FE-03` or `local-AC-1`; add `D-1` and `R-1` namespaces only
for decisions and risks.

Keep the template's English headings and table headers for machine validation.
Write the contents in the user's language. Tables use one physical line per row;
escape a literal pipe as `\|`. Empty decisions/risks tables are valid; keep their
headers and delimiter rows. Use `-` only for inapplicable fields.

The `Approval summary` has Goal, Scope, Non-goals, Behavior, Review and Approval
subsections. Include every AC, every human decision, every deferred decision and
every risk in its Review table. Routine record-only decisions may remain below.
Each summary row has its canonical ID and status, plus a short description that
preserves conditions, trade-offs, owner and impact. Do not hide an important
decision in context or claim that an ID mention proves semantic equivalence.

### Decision records

| Field | Values and meaning |
|-------|--------------------|
| ID | Stable `D-<positive integer>` |
| Timing | `now`, `g1`, `record` |
| Impact | `standard` or `high`; authority/policy exceptions, auth/tenant changes, destructive data changes and public contract breaks are high |
| Status | `open`, `recommended`, `confirmed`, `assumed`, `deferred` |
| Choice | Exact recommended or confirmed behavior; for deferral, the excluded dependent work |
| Owner | Actual decision-making role/person, or AI for delegated record-only choices |
| Evidence | Observed answer or existing source for confirmed decisions; basis and reversibility for assumptions; otherwise `-` |

`recommended` requires `g1` timing. It is a proposal, not a confirmed customer
answer. `assumed` requires `record` timing and standard impact. High-impact choices
cannot be record-only. `confirmed` needs real provenance; never invent it.
`deferred` requires a visible `@D-ID` exclusion in Non-goals and a summary row.
In-scope ACs cannot depend on deferred decisions. Keep related work out of Scope;
do not relabel a blocker as deferred while retaining its dependent requirement.

AC table rows have status `defined` in the summary: defined does not mean
approved. Risk rows have status `noted`. Risks include their mitigation/boundary
and a decision ID when a choice is needed, otherwise `-`. Record material
uncertainty as a risk, not as an invisible AI assumption.

### Diagrams and text fallback

Use a small Mermaid flowchart for proposed behavior and a decision tree only for
actual alternatives. Keep human decisions visually distinct from runtime branches.
Use `@ID` in traceable diagram labels and prose, for example
`choice{{"@D-1 Recommendation"}}`; other node names are presentation-only.
Keep labels short; use `<br/>` at deliberate word boundaries. Aim for about 5-10
nodes per diagram and split complex flows rather than omitting critical decisions.
Label status/impact in text as well as color. Diagrams are views, not sole specs.

The Review table must communicate the same decision-relevant behavior without
rendering. The CLI checks IDs and table structure, not Mermaid syntax or prose
equivalence. Check diagram rendering in an available renderer and review the
summary against the detailed record. Never infer that a terminal or question form
renders Mermaid because a Markdown preview does.

Resolve the run's locked harness, then run:

```bash
node "$PLUGIN_ROOT/scripts/state.mjs" discovery STATE
node "$PLUGIN_ROOT/scripts/state.mjs" discovery STATE --text
```

Both commands are read-only and validate the summary. Paste the summary into
chat before the approval form, not just a filename, raw hash list or tool result.
Use the text version when the host cannot render Mermaid. Link the same document
for a Mermaid-capable Markdown preview; a browser/server requires consent through
`visual-companion`. Do not install a renderer merely to display a question.

## Obtain G1 approval once

1. Resolve `now` blockers. Show the validated summary, its revision/evidence
   reference and relevant FE/BE/prototype inputs; retain full hashes in state,
   not as the primary human-facing content.
2. In one host form, offer ordinary recommended choices with their defaults and
   a separate explicit G1 approve/change decision. Offer each high-impact
   recommendation as its own field, with no preselected consent. Confirm the
   designated owner's authority; the current user is not automatically that owner.
3. With unchanged choices and explicit G1 approval, bind the entire discovery
   file and other approval inputs in G1 evidence. Ordinary `recommended` choices
   are accepted by this scoped approval; their snapshot status stays unchanged.
   Do not rewrite the document to mark them confirmed after hashing/approval.
4. Record individual high-impact confirmations under `G1.approval.decisions` as
   `{id, reference}`, pointing to the observed owner response accepting that exact
   recommendation. This is not a general permission or an override of the document.
5. If a choice changes, update affected requirements/scenarios and the summary,
   show the delta and obtain approval of the resulting revision. Previously
   unchanged choices need not be re-interviewed, but the final approval must cover
   the updated full artifact. Scope changes may require new owner decisions.
   Silence, a choice without gate approval, and a preview click never pass G1.

`open` decisions block G1. Missing/duplicate/unknown IDs, summary status mismatch,
hidden human decisions or risks, and missing individual high-impact confirmation
also block it. Only the conductor records approval and updates state.

New revision-locked runs require the exact hashed `01-discovery.md` in G1
evidence. Older pinned runs keep their validator and workflow; do not auto-upgrade.
Legacy unpinned state validation keeps its old contract until explicit harness
adoption. An existing `01-discovery.md` filename does not adopt the new contract.
The `discovery` command itself always validates this format. See
[revision management](harness-revisions.md) for adoption/upgrades and renewed gates.

## Verify the interaction, not only the template

Package tests check shared guidance and runtime tests check summary/gate behavior.
Neither proves that a model asks fewer questions or that a host renders a diagram.
For 2-3 real, authorized host runs, record pre-G1 question batches, fields per batch,
repeat questions, review time from summary display to response, and missing
decisions found during approval. Include zero-question bounded work, an ordinary
product choice and a high-impact owner decision when available. Keep observations
in the run's context; never fabricate approvals or durations for a test.
