---
description: "Project-wide standards and architecture decisions shared across SDLC runs"
---

# Project standards and decisions

Keep project-wide rules separate from feature execution history. Use the target
repository's existing documentation locations first. When no convention exists,
use this layout in the target project, not inside the installed harness:

```text
AGENTS.md
docs/
  architecture/
    overview.md
    adr/
      README.md
      ADR-0001-<decision>.md
  standards/
    README.md
    <topic>.md
  sdlc/
    <ID>/
      01-discovery.md
      02-plan.md
      adr/
        <feature-decision>.md
```

Create only documents needed by the authorized work. Do not scaffold empty topic
files, invent accepted policies, move historical run artifacts, or replace an
existing convention. Record existing locations and reading rules in the project's
AGENTS.md; do not add unsupported fields to the SDLC configuration or state.
An existing `CODING_STANDARDS.md` or `CONTRIBUTING.md` is a standards source:
register it in the standards index instead of creating a parallel document.

## Document responsibilities

| Document | Responsibility |
|---|---|
| Architecture overview | Current system boundaries and allowed dependencies, linked to their decisions |
| Standards | Current actionable rules, applicability, owner, verification method and decision sources |
| Project ADR | Durable rationale for cross-feature choices: context, alternatives, decision, consequences and migration impact |
| Feature plan or ADR | Application of shared rules and decisions limited to this feature |
| Indexes | Document IDs or paths, status, scope and owners; ADR replacement relationships |

Classify by impact, not by how many features have already used a choice. Shared
API, authentication, tenancy, data ownership and dependency boundaries belong at
project scope even when introduced by the first feature. Routine implementation
choices stay in the feature plan; an ADR is not mandatory for every task.

Keep one canonical source for each rule. Standards describe what applies now;
ADRs explain why. Link standards to their decision sources instead of copying
ADR narratives. Feature plans reference applicable sections instead of duplicating
the standards. Read the indexes and relevant documents, not every historical ADR.

## Standard rule record

Record each actionable rule with these fields, adapting to an existing format:

| Field | Content |
|---|---|
| ID / rule | Stable identifier and the rule in one or two sentences |
| Applicability | Paths, modules or change types it governs |
| Enforcement | `check: <lint rule, test, hook or CI job>` or `review` for judgement calls |
| Status / owner | `proposed`, `accepted` or `retired`, and the designated owner |
| Origin / decision source | Originating run ID and artifact, retro finding or ADR |

Mechanical rules (banned APIs, import shapes, file locations, fixed syntax) use
`check`: the check is canonical and the standard only points to it. Prose rules
are reserved for judgement calls enforced by independent review. Implementers
follow the sections their plan references; reviewers enforce `review` rules and
confirm that named checks ran on the subject revision. A `proposed` rule is not
active. Retire rules whose cause is gone or that keep firing on good code
through the same approval process, preserving history.

`retro` feeds this loop: it proposes checks and rules from traced session or run
friction. Its selection authorizes drafting only; owner approval still applies.

## Decisions, approval and exceptions

For each ADR record its ID, scope, status, owner, context, alternatives, decision,
consequences, originating work and approval evidence when accepted. Use
`proposed`, `accepted`, `rejected` and `superseded`, or map to existing repository
statuses. A proposal is not an active rule. If acceptance evidence is unavailable,
report it as unconfirmed rather than inventing approval.

Project-wide changes require explicit approval from the designated project or
domain owner. Feature G2 approval alone does not imply project-policy approval.
Both may be recorded in the same review if the person's authority and both scopes
are explicit. Missing ownership or unresolved rule conflicts are `NEEDS_HUMAN` for
dependent work; do not silently let a feature-local decision override a standard.

When a feature decision becomes shared, create a project ADR, link the originating
feature record, obtain project approval and update the affected standard or
overview. Leave a forward reference in the original record; preserve its history.
Do not mutate approval-bound run artifacts in place: use the existing invalidation
and reapproval procedure for active runs, and a new run for closed-run follow-up.
Keep closed-run evidence unchanged and link it from the new project ADR.

Replace an accepted decision with a new ADR when its substance changes. Mark the
old ADR `superseded` and link both directions. Update the current standard and
index in the same change. Preserve the old rationale and approval record.

Record a temporary exception in the feature plan or ADR with the exact rule,
reason, affected scope, risk, compensating checks, owner, expiry or exit condition,
and explicit approval from the rule owner. An exception does not change the
project-wide rule. Expired or unapproved exceptions block dependent work.

## SDLC integration

| Stage | Required action |
|---|---|
| Setup | Discover existing standards and ADRs, map owners and locations, and establish project AGENTS.md reading rules |
| Discovery | Identify applicable rules, conflicts, exceptions and decisions requiring project scope |
| Plan | Record the project baseline below, classify new decisions and obtain required shared-policy approvals |
| Implement | Follow the approved baseline; report drift and avoid unapproved shared-file edits |
| Review and verify | Check applicable rules, exception validity, decision status and changes since the baseline |
| Release and handoff | Carry approved shared changes and remaining migration or exception obligations into the handoff |
| Retrospective | User-invoked `retro` proposes checks, standards or pointers from the run record; accepted rules use the record above |

In `02-plan.md`, include a Project baseline section with these columns:

| Document ID / repository-relative path | Section / applicability | Baseline commit | Status / owner | Exception or proposed change |
|---|---|---|---|---|
| Actual project document | Applicable rule and affected scope | Actual commit containing the reviewed content | Confirmed status and owner | Reference or none |

Record when no applicable shared documents exist; do not fabricate references.
For uncommitted documents, record their actual content SHA256 and pending commit
status rather than attributing them to HEAD. Before G2, shared-policy proposals
needed by the plan must have explicit approval; otherwise keep dependent work
blocked. Referencing an accepted ADR does not require approving it again.

At review, verification and resume, compare the applicable documents with the
recorded baseline. Record changed paths and assess impact, including newly
applicable rules found through the indexes. A material requirement change
invalidates G1; a plan or policy change invalidates G2 and downstream evidence.
Unrelated changes do not invalidate every run. Record the no-impact rationale.

For existing approved runs without a Project baseline, record the applicable
documents and comparison in a new run-local report. Reconstruct historical inputs
only from available evidence; never invent a past baseline or rewrite an approved
plan just to add this convention. If the old baseline cannot be established,
record that limitation and assess current compliance. Unresolved material policy
conflicts block dependent work and require the normal reapproval procedure.

The v1 gate validator accepts evidence only inside the run directory. Project
document links and baseline commits are review inputs, not gate evidence paths.
Keep the baseline and comparison results in the run's plan or review report and
hash those local artifacts using the existing evidence contract. Never use parent
traversal or symlinks to bypass it. The validator does not automatically detect
project-document drift; a reviewer or conductor must perform and record the
comparison. This convention adds no new state fields or automatic hash tracking.