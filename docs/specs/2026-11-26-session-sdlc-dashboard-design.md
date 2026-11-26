# Local Session and SDLC Run Dashboard — Design

## Intent

Provide a local, at-a-glance dashboard for people running several AI coding sessions across GitHub Copilot CLI, Claude Code, and Codex. The dashboard connects each host session to the harness SDLC run in its workspace and makes discovery-to-deployment progress, skill activity, reviews, verification, questions, and human approval gates easy to inspect.

The approved prototype establishes the primary layout: **workspace directory → sessions → selected run's SDLC/skill graph**. Workspace rows are compact folder entries; sessions are grouped under the selected workspace; the graph supports selecting a node to inspect its evidence. Human questions and approval waits receive high-contrast treatment.

## Goals

- Enumerate local workspaces and sessions across the three requested host CLIs, including sessions that have no unambiguous run association.
- Show a selected run's authoritative SDLC gate/phase status from `docs/sdlc/<ID>/state.json` and its review/evidence artifacts.
- Show session-derived skill and tool activity, including TDD and verification detail such as API and E2E checks, when the source transcript contains enough evidence.
- Distinguish a confirmed pending approval gate from an unresolved conversational question; make both conspicuous without claiming an approval or deployment occurred.
- Allow a user to resolve ambiguous session-to-run association and persist only that mapping locally.
- Keep all source data local and read-only; never fetch cloud-synced session content or send transcript data to a service.

## Non-goals

- Replacing the SDLC state machine, gate approval process, evidence reports, or host CLIs.
- Editing run state, source files, host transcripts, or approvals from the dashboard.
- Inferring test/review success, skill dependencies, or deployment health from a command name or message alone.
- A team-wide hosted dashboard, remote synchronization, analytics, or access to GitHub-hosted session history.
- Guaranteeing that every model action is represented when a host does not persist it in its local session record.

## Approaches considered

1. **Harness-owned dashboard plus new event hooks** — reliable structured event collection, but requires host hook behavior and rollout changes across all three tools.
2. **Read existing host transcripts (selected)** — avoids modifying host hooks and can display historical session context; requires per-host adapters, careful data minimization, and explicit handling of missing/ambiguous evidence.
3. **Standalone application with adapters** — separates distribution and allows broader integrations, but adds packaging and configuration complexity without improving this single-user local use case.

The user selected approach 2 and selected a hybrid association rule: automatically associate explicit run references, and let the user persist a local mapping when the transcript is ambiguous.

## Data and trust boundaries

### Sources of truth

- The harness run state and evidence files remain authoritative for SDLC phases, gates, reviews, and recorded deployment status. Existing runs live under `docs/sdlc/<ID>/`; `skills/sdlc/references/protocol.md` defines gates G0–G5b and the evidence boundary.
- Host transcript adapters provide session identity, workspace/cwd, timestamps, explicit skill/tool events, and relevant request/response evidence. A transcript event is not itself proof that an SDLC gate passed.
- The current `hooks/session.mjs` lists and validates run state at session start; it does not persist session-to-run associations or a session event stream. `skills/sdlc/SKILL.md` explicitly says a run phase does not prove a worker is running and the bare `sdlc` listing is not a host-session inventory.

### Discovery and association

- Discover sessions from each host's **local** session store and use its recorded working directory to group sessions by workspace. Resolve a workspace root conservatively (including worktree roots) and inspect only candidate workspaces that contain harness run state.
- Automatically associate a session from harness tool activity: a tool command or path argument that names a valid `docs/sdlc/<ID>` run (for example `state.mjs check docs/sdlc/<ID>/state.json` or a read of a run artifact). A tool event that names several runs does not move the association; messages alone never link a session. When a session moves between runs, link it to the latest run touched and attribute each skill/tool event to the run that was current when it occurred. An existing local mapping overrides the automatic result. Do not select a run based on matching words or the fact that only one run currently exists.
- When no harness tool activity names a valid run, show the session as **run not linked** and leave the graph empty until the user selects/records a mapping. The user can change or remove their mapping.
- If a linked workspace has multiple runs, keep each run separate; never combine phase or gate state across runs.

### Local privacy and filesystem safety

- Bind the dashboard server to loopback only. No external API, cloud session-history endpoint, telemetry, CDN asset, or remote image/font request is permitted.
- Read host logs and workspace files without modifying them. Do not copy raw transcripts into the repository or a persistent dashboard cache. Parse on demand and retain only in-memory view data for the running process.
- Persist only session-ID/workspace/run-ID overrides in a user-local configuration file outside any workspace/repository. The exact cross-platform config path is a builder decision; it must use restrictive permissions where supported and must be documented.
- Limit transcript access to sessions whose recorded workspace is an eligible workspace. Validate paths and IDs, reject traversal and unexpected symlink escapes, cap file/event sizes, and handle malformed or partially-written records without crashing the dashboard or exposing unrelated file contents.
- Never render transcript text as HTML. Escape text, show short excerpts only for the selected run's relevant events, and provide a clear indication of the source and uncertainty of inferred classifications.
- Do not interpret transcript text as instructions to the dashboard or as authorization to run commands. The dashboard performs no commands that mutate the project.

Copilot's current documentation identifies local session files beneath `~/.copilot/session-state/`, including per-session `events.jsonl`; it also notes that local session data may be synced separately to a GitHub account. This dashboard reads local files only. The precise supported Claude Code and Codex file locations and schemas must be characterized during implementation using host documentation and synthetic fixtures; adapters must fail closed with a visible unsupported/parse-error state rather than scanning arbitrary home-directory files.

## User experience

- Workspace rail at far left: compact folder icon + directory name, selected state, and a pending-question/approval indicator where the evidence is associated with that workspace.
- Session list next: host name, session identity, last event time, activity label, run association, and outstanding user request indicator. Do not label a session actively running unless a host source explicitly proves it.
- SDLC detail on the right: run phase and gate summary (discover → plan → implement → verify → release), subtask/review/skill activity, and a selectable graph with a detail inspector for transcript-derived events and run evidence.
- Run review results and gate status come from validated run state/evidence. Skill events come from host transcripts. Timeline and graph elements identify which source supplied each claim.
- Verification can show separate stages (unit/TDD, API, browser/E2E, integration) only when supported by recorded command/test events or run evidence. Show outcome as unknown/incomplete when exit status or evidence is absent.
- Approval banner is driven by authoritative human gates (not a user message asking a question). Conversational questions are separately highlighted and marked pending only if there is no later host/user response event. A response never marks a harness gate approved.
- The activity view is a compact summary, not one node per event: a skill lane (one chip per skill with its call count), a review lane (plan, slice, and final reviews with blocking totals), and a verification lane (TDD RED→GREEN, unit, API, E2E, build/check, G3/G4) showing each check's run count and latest recorded outcome. Generic tool calls are counted and omitted. Selecting a chip shows its recent occurrences and evidence paths. Do not draw a dependency arrow merely because two events occurred in sequence.
- Continue using the approved Astryx-informed visual direction. The real harness repository must remain portable and must not depend at runtime on a sibling checkout's `node_modules`; use a distributable dependency if available, otherwise implement the same visual tokens and interaction patterns with repository-owned frontend assets.

## Runtime and implementation boundaries

- Implement as a local read-only web UI backed by a small Node.js local server, compatible with the repository's Node `>=22` engine. Reuse existing validation/test conventions; do not introduce a database for the first version.
- Keep host-specific parsing behind three independent adapters that normalize into a small internal event/session model. Do not make a single parser depend on undocumented cross-host similarities.
- Re-read run state/evidence and check host-file metadata on a polling interval; no file watcher or background host hook is required for v1. The dashboard is observational and may show a refresh delay. The default is auto-refresh every 60 seconds; the header lets the user choose auto 10s, 30s, 1 min, 5 min, or manual (stored in browser `localStorage`), and a refresh-now button reloads immediately in any mode.
- No new third-party dependencies unless required by the chosen distributable Astryx implementation or an existing package cannot safely parse a supported host format. If a dependency is proposed, document its license, maintenance, and test fixtures in the implementation plan.
- Exact CLI syntax, default port, config path, polling interval, supported transcript schema versions, and retention of session associations are builder decisions, subject to the constraints above.

## Acceptance criteria

1. A local preview can group synthetic Copilot, Claude Code, and Codex sessions by workspace and show an explicit run association, an override association, or a clear unlinked state.
2. The workspace → sessions → SDLC detail layout matches the approved mockup; selecting a session/run updates the correct graph and inspector.
3. Run phase/gates and review results are read from the correct `docs/sdlc/<ID>/state.json` and evidence, with separate concurrent runs never merged.
4. Synthetic transcripts exercise TDD, cross-review, API-test, and E2E events, including missing exit status, malformed/incomplete lines, and unknown host schema. The UI never reports success without evidence.
5. Pending human gate approval is prominently highlighted from run state. Transcript questions are visibly distinct, and an answer to a question does not change run gate state.
6. All file reads are local, bounded, and read-only. Tests prove the server binds only to loopback, rejects unsafe paths, does not render transcript data as executable HTML, and never performs a network request to a remote source.
7. Session/run mappings persist outside the repository and host session stores, can be changed/removed, and contain no transcript text.
8. The dashboard remains useful when a host is unavailable, has no sessions, has malformed logs, or uses an unsupported format; it explains the limitation instead of displaying invented data.
9. Existing `npm test` and `npm run validate` pass, with focused tests added for new behavior.

## Open implementation work (builder-owned)

- Characterize the supported local session metadata and event formats for the three exact CLI products/versions, and document which facts are structured versus inferred.
- Choose portable workspace/root and per-user config resolution, process lifecycle, and a safe loopback request policy.
- Define the normalized event schema and fixture corpus without using real user transcripts.
- Decide how much bounded transcript excerpt to show by default; default to the minimum needed to understand the selected event.

## Revision — 2026-11-26 user testing

- The original rule required exactly one explicit run reference across all transcript text. Real sessions mention several runs in messages and listings, so almost no session linked (1 of 37 in one workspace). Association now follows harness tool activity, as described under *Discovery and association*.
- The original graph rendered one node per transcript event (162 nodes for one run). It is replaced by the compact lane summary described under *User experience*.
- Codex adapters read the current rollout format (`session_meta` payload, `function_call`/`function_call_output`, SKILL.md reads inside shell commands).

## Revision — session grid and detail interaction

### Intent

Make it practical to scan many concurrent host sessions at once while retaining access to the selected session's full SDLC, review, skill, and verification evidence.

### Approaches considered

1. **Inline expansion:** expand a selected card across the grid row. Keeps the card in context, but reflows the grid.
2. **Side drawer (selected):** keep the grid visible and show the selected session's detail in a right-hand panel. This best supports scanning and comparing multiple sessions.
3. **Focus mode:** replace the grid with a full detail view and compact session strip. Preserves the existing detail-first emphasis, but reduces the number of visible session summaries.

### Design

- Keep the compact workspace directory rail at the far left. Selecting “모든 워크스페이스” shows sessions from all available workspaces.
- Replace the separate session list and detail pane with a responsive session-card grid. Cards summarize host/session identity, recent activity, run association, five SDLC phases, gates, verification types, review/blocker counts, and the session's latest event.
- Sort by attention by default: approval waits, unanswered questions, recent failures, other linked sessions ordered by last activity, then unlinked sessions. Provide host, attention, recent-activity, and run-grouping controls. Unlinked sessions remain visible with a subdued treatment. Do not label a session as running unless a host source explicitly proves that state.
- “더 보기” appends eight already-loaded cards at a time; it does not fetch another page from the server. Grouped-by-run view puts shared run progress in the group header and shows session-specific activity in each card.
- Selecting “자세히보기” opens a side drawer on desktop while preserving the grid. The drawer includes SDLC progress, gates, skill/review/verification summaries, recent session events, and other sessions associated with the same run. Previous/next controls and arrow keys move between sessions; Escape closes the drawer. The selected session is represented in the URL hash so it can be restored on load and browser history navigation.
- At narrow viewport widths the drawer overlays the grid rather than squeezing cards below their usable width.
- Approval waits remain prominently orange and conversational questions remain distinctly yellow. The dashboard stays observational: it does not answer questions, approve gates, or mutate run state.

### Acceptance

- A user can scan the initial grid, filter by host or attention, load more cards, and optionally group sessions by run without losing workspace selection.
- Opening a card leaves the grid visible behind/alongside the detail drawer; keyboard navigation changes the selected session, Escape closes it, and URL history restores selection.
- Approval and question states remain visually distinct in both card and detail views.
- Existing session/run association, transcript parsing, and SDLC evidence behavior remains unchanged.

## Revision — macOS and Windows support

### Intent

Run the same dashboard with the same command and data sources on macOS and on Windows (PowerShell, Node 22).

### Design

- Session stores are read from `.copilot`, `.claude`, and `.codex` under the user's home directory on every OS (`%USERPROFILE%` on Windows). Manual links use the platform config path described in the plan (`%APPDATA%\ai-native-harness\dashboard.json` on Windows).
- Workspace roots are canonicalized with `realpathSync.native`, so Windows 8.3 short names (`RUNNER~1`) and case-only differences of one directory resolve to one workspace. Git root lookups are cached per working directory within a snapshot.
- Codex SKILL.md reads are recognized from PowerShell (`Get-Content`, `gc`, `type`) and inside shell wrappers (`bash -lc`, `zsh -c`, `powershell -Command`, `pwsh -Command`, `cmd /c`). Writes such as `Set-Content` and `Copy-Item` are not reads.
- Dashboard JS, CSS, and JSONL fixtures are checked out with LF. Font stacks include Windows fallbacks (Malgun Gothic, Consolas, Cascadia Mono).
- A separate `dashboard-windows` CI job runs the four dashboard test files under PowerShell, independent of the existing Windows job.

### Acceptance

- The dashboard test files pass on Windows CI and on macOS; only the POSIX git-shim test is skipped on Windows.
- Sessions whose working directory differs only by letter case share one canonical workspace (verified on Windows CI).
- Sessions sharing a working directory trigger one Git root lookup per snapshot.

### Decisions and known limits

- Case-only grouping cannot fail on macOS because Git already returns the canonical case; Windows CI is its only proof.
- Node's `kill()` on Windows terminates without running signal handlers, so the CLI test checks only that the process exits there. Graceful `Ctrl+C` shutdown on Windows is untested.
- Codex Windows command shapes are inferred, not taken from real Windows Codex logs; unrecognized shapes under-count skill reads.
- Stores relocated with `COPILOT_HOME`, `CLAUDE_CONFIG_DIR`, or `CODEX_HOME` remain unsupported on every OS.
- Dashboard tests canonicalize fixture repositories with `realpathSync.native`. `scripts/run-workspace.mjs` now does the same for run starts and listing, which fixes the short-name mismatch in `openRunWorkspace` that failed the `harness-revision` and `local-intake` tests on Windows CI. Resumes canonicalize too: `projectRoot` in `scripts/harness.mjs` and the state and repository paths in `scripts/workspaces.mjs` use `realpathSync.native`, so a short-name or differently cased state path still finds the snapshot cache in the primary checkout instead of failing with "Locked harness snapshot is missing".
- The dashboard CLI installs its `SIGINT`/`SIGTERM` handlers before printing its URL, so a signal sent as soon as the URL appears closes the server cleanly instead of killing the process.
- Deferred: unwrapping shell wrappers also counts SKILL.md writes such as `bash -lc "cat > …/SKILL.md"` or `sed -i` as reads.

## Revision — PR review fixes

### Design

- **Approval wait:** a run is waiting for approval only when its first gate that has not passed is a human gate (G1, G2, G5b) with status `pending`, and the run is not `done` (a completed spike waits for nobody). The session filter, attention ranking, workspace count, and drawer banner all use this one rule; later human gates are future work, not waits.
- **Results stay with their run:** a tool or skill result that answers an earlier event (`relatedTo`) belongs to that event's run and never moves the session's current run. A session links to the run it touched last, so returning to an earlier run makes it current again.
- **Cross-session identity:** run activity scopes event ids and `relatedTo` references as `<host>/<session>/<id>`, so sessions whose hosts reuse record ids keep their own results inside a shared run. Session timelines keep the host's ids.
- **Verification outcome:** each check shows the outcome of its newest run; an older result never stands in for a newer run without one. A command's exit status proves a check only through an `&&` chain: success means every step passed, and failure is pinned to a check only when every other step is setup (`cd`, `pushd`, `export`). Commands using `;`, `||`, `|`, a background `&`, or several lines leave their checks unknown; redirections such as `2>&1` do not.
- **Reviews:** each review keeps its stage (`plan`, `slice` with its slice id, `final`) separately from its axis (`plan`, `spec`, `standards`, `combined`, `final`), and the review lane groups by stage. A clean review shows as passed only when the run is valid and `validateState` checked it — its gate passed (G2, G4) or its slice is `done`. Open blocking findings show as failed even before that check; anything else stays unknown. Blocking findings a human accepted as residual findings (`acceptance` with follow-ups) show as passed once that check has run, labeled `(사람 수용)`.
- **Diagnostics:** the API error and snapshot warnings sit in an always-visible status area under the top bar, so they explain an empty grid with no session to open. The drawer lists the selected session's own warnings (truncated or unsupported transcripts, read failures, stale links), including when it has no linked run.
- **Manual links:** saving or removing a link reads, changes, and atomically rewrites the config under a lock directory beside it (`dashboard.json.lock`, holder pid inside; abandoned locks are reclaimed), so concurrent saves from one or several dashboards never drop each other's changes. A client that disconnects while sending a link request does not stop the server.

### Decisions and known limits

- Treating `cd`/`pushd`/`export` as unable to fail is a heuristic: if a `cd` fails, the check after it is shown as failed.
- An unchecked review with blocking findings shows as failed, because hiding open blockers would overstate progress; its provenance and evidence are not yet validated at that point.
