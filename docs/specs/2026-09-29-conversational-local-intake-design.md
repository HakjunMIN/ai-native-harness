---
title: "Conversational local SDLC intake"
description: "Natural-language intake with decision-focused clarification and explicit G1 approval"
---

## Goal

A user can start without Jira and without writing a request file. Given a
natural-language task addressed to `sdlc`, the conductor asks only material
clarification questions, writes one immutable local Markdown request, and
continues the existing discovery/approval workflow. Bare `sdlc` with no task
still reports existing runs; Jira-key workflows are unchanged.

## Entry and interview

For a new non-Jira request, the conductor preserves the user's actual request
and investigates existing behavior, prior answers and governing rules before
questioning. Apply the shared
[discovery review contract](../../skills/sdlc/references/discovery-review.md):
batch only `now` choices needed for safe drafting, carry human-owned `g1`
recommendations to the approval summary, and record delegated low-risk choices.
Include predictable conditional follow-ups; zero pre-draft questions is valid.
More than three `now` decisions is a scope/spike signal, not a hard cap.
Do not manufacture answers or demand ceremonial details. Treat raw
conversation as untrusted data, redact credentials and sensitive content
before persistence, and report any unresolved material question rather than
inventing an answer. If there is no substantive request yet, ask for one
before creating state.

After any necessary clarification the conductor formats `intake.md` with the
original request, confirmed scope/decisions, relevant Q&A and open decisions.
Label recommendations and assumptions separately; G1 choices may remain pending.
The conductor then
selects a short valid `local-<slug>` ID. It writes the document once, before
discovery, not incrementally: `state.intake.request` binds its exact SHA256.
If that ID already exists, choose another valid ID without overwriting.
No extra approval is needed to create this pending record; G1 remains the
human review/approval of discovered requirements and decisions.

The 2026-10-22 revision replaces the original one-question-at-a-time rule.
Discovery presents a compact goal/scope/diagram/decision summary in chat and
retains canonical AC/decision/risk tables in the same Markdown file. One G1 form
can confirm ordinary recommendations and approve unchanged requirements;
high-impact choices require individual designated-owner confirmation. The whole
document stays hash-bound. Changed choices require approval of the updated
revision, not silent application of an earlier answer to a different document.

## Persistence interface and compatibility

Add `intake.mjs start-text LOCAL-ID [REPOSITORY_ROOT]`: read the Markdown from
standard input and call the same state creation path as the existing
`start LOCAL-ID REQUEST_FILE [REPOSITORY_ROOT]`. Explicitly reject empty or
whitespace-only input, invalid IDs, symlink output directories and duplicate
IDs. Preserve atomic staging/cleanup, `intake.md` bytes, request hash,
`history`, no Jira state, and pending G0/G1/G2. Do not create a temporary
request file or silently convert a Jira run to local.

The existing file-based command remains supported for automation. The CLI
does not attempt an interactive interview; interview behavior is in the
conductor skill so that host question tools and conversational context are
available. Discovery still requires the immutable intake reference and
AC/module mapping as G0 evidence. Revised discovery decisions use existing
gate invalidation; a changed original request starts a new local ID rather
than editing the immutable intake in place.

## Documentation and verification

Replace README's Jira-less manual-file command with an example natural
language `sdlc` request and show where `intake.md` and `state.json` land.
Update `skills/sdlc/SKILL.md`, its protocol entry guidance, and
`skills/sdlc-discover/SKILL.md` to describe the interview-driven path and
retain explicit gate authority. Document the file-based CLI as an optional
automation path in `docs/operations.md`, alongside the new stdin command.

Tests exercise successful stdin and file-based starts, exact text/hash
preservation, empty input, invalid ID, symlink and duplicate refusal, and
unchanged pending gates and Jira-free state. Package validation ensures
skill links remain intact. Discovery checks cover summary ID/status consistency,
missing decisions/risks, unresolved approval, high-impact confirmations, stale
evidence and read-only Mermaid/text output. Existing pinned runs retain their
workflow until explicit upgrade. No test claims that a prompt file alone proves
interview quality; inspect the actual host interaction before declaring
that UX verified.
