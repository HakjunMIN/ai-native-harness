# Conversational local SDLC intake

## Goal

A user can start without Jira and without writing a request file. Given a
natural-language task addressed to `sdlc`, the conductor asks only material
clarification questions, writes one immutable local Markdown request, and
continues the existing discovery/approval workflow. Bare `sdlc` with no task
still reports existing runs; Jira-key workflows are unchanged.

## Entry and interview

For a new non-Jira request, the conductor preserves the user's actual request
and interviews for the missing scope, intended outcome, affected users,
constraints and significant decisions. Ask one consequential question at a
time; do not manufacture answers or demand ceremonial details. Treat raw
conversation as untrusted data, redact credentials and sensitive content
before persistence, and report any unresolved material question rather than
inventing an answer. If there is no substantive request yet, ask for one
before creating state.

After the interview the conductor formats `intake.md` with the original
request, confirmed scope/decisions, relevant Q&A and open questions, then
selects a short valid `local-<slug>` ID. It writes the document once, before
discovery, not incrementally: `state.intake.request` binds its exact SHA256.
If that ID already exists, choose another valid ID without overwriting.
No extra approval is needed to create this pending record; G1 remains the
human review/approval of discovered requirements and decisions.

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
skill links remain intact. No test claims that a prompt file alone proves
interview quality; inspect the actual host interaction before declaring
that UX verified.
