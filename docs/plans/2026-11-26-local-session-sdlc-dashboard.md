# Local Session and SDLC Run Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local dashboard that links GitHub Copilot CLI, Claude Code, and Codex sessions to harness SDLC runs and shows verified progress, skill activity, reviews, tests, questions, and human approval gates.

**Architecture:** Add a Node.js loopback server and a plain HTML/CSS/ES-module frontend. Three read-only host adapters normalize local session records; a dashboard data layer joins eligible workspace sessions with validated run state/evidence and user-owned association overrides. The UI distinguishes transcript observations from authoritative run state and never infers success from missing evidence.

**Tech Stack:** Node.js >=22 built-ins, existing `scripts/state.mjs` and `scripts/run-workspace.mjs` readers, native HTML/CSS/JavaScript modules, and `node:test`. No database or new runtime dependency.

**Spec:** `docs/specs/2026-11-26-session-sdlc-dashboard-design.md`

## Global Constraints

- Implement as a local read-only web UI backed by a small Node.js local server, compatible with the repository's Node `>=22` engine. Reuse existing validation/test conventions; do not introduce a database for the first version.
- Bind the dashboard server to loopback only. No external API, cloud session-history endpoint, telemetry, CDN asset, or remote image/font request is permitted.
- Read host logs and workspace files without modifying them. Do not copy raw transcripts into the repository or a persistent dashboard cache. Parse on demand and retain only in-memory view data for the running process.
- Persist only session-ID/workspace/run-ID overrides in a user-local configuration file outside any workspace/repository.
- Do not infer test/review success, skill dependencies, or deployment health from a command name or message alone.
- Validate paths and IDs, reject traversal and unexpected symlink escapes, cap file/event sizes, and handle malformed or partially-written records without crashing the dashboard or exposing unrelated file contents.
- Never render transcript text as HTML. Do not interpret transcript text as instructions to the dashboard or as authorization to run commands.
- The real harness repository must remain portable and must not depend at runtime on a sibling checkout's `node_modules`.

## Review Focus

- A malformed or truncated final host event must not discard prior valid events or fabricate a successful skill/test result. Test in Task 1's adapter fixture suite.
- A session with a stale, missing, or escaping workspace path must not cause arbitrary home-directory or symlink traversal. Test in Tasks 1 and 2.
- Multiple concurrent runs and ambiguous transcript mentions must remain unlinked until an explicit association is selected; an override must be changeable and removable. Test in Task 2.
- An answered conversational question must not be presented as a pending harness approval, and a pending gate must not be hidden by transcript text. Test in Task 2.
- Hostile Origin/Host headers, encoded traversal, HTML-like transcript text, and non-loopback binding must not expose files or execute content. Test in Tasks 3 and 4.

---

## File Structure

- `scripts/dashboard.mjs` — CLI entry point; parse `--port`, start the local server, print its loopback URL, and close cleanly on signals.
- `scripts/dashboard/server.mjs` — HTTP routes, loopback/Origin/Host enforcement, static assets, request-size limits, CSP, and association mutation endpoint.
- `scripts/dashboard/model.mjs` — shared host/event enums and `truncateExcerpt(value, maxLength = 240) -> string` helper used by every adapter.
- `scripts/dashboard/adapters/copilot.mjs` — discover/read supported local Copilot CLI sessions.
- `scripts/dashboard/adapters/claude.mjs` — discover/read supported local Claude Code sessions.
- `scripts/dashboard/adapters/codex.mjs` — discover/read supported local Codex sessions.
- `scripts/dashboard/runs.mjs` — enumerate runs via `listRuns`, validate state/evidence, and build gate/review/test summaries.
- `scripts/dashboard/associations.mjs` — resolve platform config path and read/write only explicit local session↔run overrides atomically.
- `scripts/dashboard/snapshot.mjs` — filter eligible sessions to workspaces with runs, parse only those transcripts, apply explicit references/overrides, and assemble one API snapshot.
- `dashboard/index.html`, `dashboard/app.js`, `dashboard/styles.css` — self-contained static interface using the approved Astryx-informed design without external assets.
- `tests/dashboard-adapters.test.mjs` — synthetic host-layout and transcript fixtures for all three adapters.
- `tests/dashboard-data.test.mjs` — run validation, evidence, association, and merged snapshot tests.
- `tests/dashboard-server.test.mjs` — HTTP security and persistence tests.
- `tests/dashboard-ui.test.mjs` — frontend asset contract and safe-text rendering tests; supplement with a manual Edge smoke test.
- `tests/fixtures/dashboard/{copilot,claude,codex}/` — small synthetic metadata and JSONL fixtures only; never copy real user transcripts.
- `README.md`, `README.en.md`, `package.json` — document and expose `npm run dashboard`.

## Task 1: Normalize the Three Local Host Sources

**Files:**
- Create: `scripts/dashboard/model.mjs`
- Create: `scripts/dashboard/adapters/copilot.mjs`
- Create: `scripts/dashboard/adapters/claude.mjs`
- Create: `scripts/dashboard/adapters/codex.mjs`
- Create: `tests/dashboard-adapters.test.mjs`
- Create: `tests/fixtures/dashboard/{copilot,claude,codex}/...`

**Interfaces:**
- Each adapter exports `discoverSessions({homeDir, maxSessions = 200}) -> Promise<HostSession[]>` and `readEvents(session, {maxBytes}) -> Promise<DashboardEvent[]>`. Discovery returns the newest 200 sessions per host and reports when older sessions were omitted; event reads are bounded. Both arrays expose a non-enumerable `warnings` list so partial results retain the planned array contract.
- `HostSession` fields: `{host, id, cwd, startedAt, updatedAt, transcriptPath}`. `transcriptPath` stays server-side and is never sent to the browser.
- `DashboardEvent` fields: `{id, at, actor, kind, label, excerpt, command, outcome, runId, relatedTo, source}`; `source` is the host adapter ID; `relatedTo` contains only explicit related event/evidence IDs. `actor` is `user|assistant|tool|system`; `kind` is `message|skill|tool|question|approval`; `outcome` is `passed|failed|unknown|none`; optional values are `null` when the source has no evidence. `excerpt` is capped at 240 characters and is never persisted.
- Use `MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024` for each transcript, reading at most the newest 5 MiB. If the read starts mid-record, drop that first partial record and report truncation. A supported parser may ignore a malformed trailing partial JSONL record only when it is the final record; it reports a warning and preserves earlier valid events. Unknown event schemas produce a visible unsupported-source warning, not guessed events.

- [x] **Step 1: Write failing adapter tests** for the three synthetic host layouts: metadata returns host/session ID, cwd and timestamps; event readers normalize TDD, cross-review, API-test, E2E, tool, question, and approval events; absent optional fields remain null; an outside-workspace or malformed source is reported without exposing its contents.
- [x] **Step 2: Run `node --test tests/dashboard-adapters.test.mjs`** and confirm the new imports/expected adapter functions fail.
- [x] **Step 3: Characterize only the three requested CLIs' documented local session sources** and implement each adapter against its supported local schema. Do not scan general home-directory JSON files, read cloud endpoints, or use real user transcript data in fixtures.
- [x] **Step 4: Run `node --test tests/dashboard-adapters.test.mjs`**; verify valid records normalize, truncated last lines warn, unsupported versions fail closed, and reads never exceed `MAX_TRANSCRIPT_BYTES`.

## Task 2: Join Sessions to Validated Runs and Persist Explicit Overrides

**Files:**
- Create: `scripts/dashboard/runs.mjs`
- Create: `scripts/dashboard/associations.mjs`
- Create: `scripts/dashboard/snapshot.mjs`
- Create: `tests/dashboard-data.test.mjs`
- Extend: `tests/fixtures/dashboard/` with synthetic run evidence/state fixtures

**Interfaces:**
- `loadRuns(workspaceRoot) -> Promise<RunSummary[]>` uses `listRuns(workspaceRoot)` from `scripts/run-workspace.mjs`, then `validateState(state, runRoot, undefined, {checkPhase: false})` and existing evidence hash validation from `scripts/state.mjs`. Resolve each session cwd to its Git top-level before calling `listRuns`, while retaining the original cwd as the displayed workspace path.
- `loadAssociations({homeDir, env}) -> Promise<Association[]>`, `saveAssociation({homeDir, env, host, sessionId, workspaceRoot, runId}) -> Promise<void>`, and `removeAssociation({homeDir, env, host, sessionId}) -> Promise<void>` use platform paths: macOS `~/Library/Application Support/ai-native-harness/dashboard.json`; Windows `%APPDATA%/ai-native-harness/dashboard.json`; Linux `${XDG_CONFIG_HOME:-~/.config}/ai-native-harness/dashboard.json`. `AI_NATIVE_HARNESS_CONFIG_HOME` overrides the config directory for tests and explicit user configuration. Create files with mode `0600` where supported and atomically replace them.
- Config schema: `{schemaVersion: 1, associations: [{host, sessionId, workspaceRoot, runId}]}`. Key an association by `(host, sessionId)` so different CLIs cannot collide. Reject unknown schema versions and IDs not present in the current snapshot; deleting an association removes only the matching record.
- `loadDashboardSnapshot({homeDir, env, maxBytes}) -> Promise<DashboardSnapshot>` returns `{workspaces: WorkspaceSummary[], warnings: string[]}`. `WorkspaceSummary` is `{id, path, sessions: SessionSummary[], runs: RunSummary[]}`, with `id` equal to the canonical Git top-level path and `path` equal to the original session cwd; `SessionSummary` is `{host, id, startedAt, updatedAt, lastActivityAt, runId, events: DashboardEvent[], pendingQuestions: DashboardEvent[], warnings: string[]}` and contains no transcript path. Derive a pending question only when no later user event exists in that session. `RunSummary` is `{id, title, phase, valid, gates, reviews, verification, events, warnings}`; `events` aggregates skill/tool events from every session explicitly linked to this run; `gates` is a list of `{id, status, owner, evidencePaths}`, `reviews` a list of `{axis, reviewerType, status, blocking, evidencePaths}`, and `verification` a list of `{name, outcome, evidencePaths}`. Gate/review/verification outcomes stay `unknown` when validation/evidence is absent. Automatically associate only explicit run ID/path events or a saved override. Unmatched/ambiguous sessions have `runId: null`.
- A run whose `validateState` or evidence check fails is marked invalid and cannot appear passed. Derive displayed phase from `nextPhase(state)`/gate evidence rather than trusting a stale `state.phase` field.

- [x] **Step 1: Write failing tests** for two runs in one Git workspace, explicit run references, unmatched sessions, saved override precedence, update/delete mapping, stale phase fields, malformed state/config, invalid evidence hash, answered-versus-unanswered questions, and concurrent runs remaining distinct.
- [x] **Step 2: Run `node --test tests/dashboard-data.test.mjs`** and confirm failures exercise the absent data functions and mapping rules.
- [x] **Step 3: Implement run loading and associations** with the existing `listRuns`, `validateState`, and evidence validation; write only the user-local override file using atomic replacement.
- [x] **Step 4: Implement `loadDashboardSnapshot`** so it reads host event streams only for sessions whose resolved workspace contains run state; merge review/test evidence without promoting transcript claims into gate state.
- [x] **Step 5: Run `node --test tests/dashboard-data.test.mjs`** and verify all associations, validation errors, missing runs, and absent host directories have explicit non-success outcomes.

## Task 3: Add a Loopback-Only Read API and Safe Association Routes

**Files:**
- Create: `scripts/dashboard/server.mjs`
- Create: `scripts/dashboard.mjs`
- Create: `tests/dashboard-server.test.mjs`
- Modify: `tests/dashboard-adapters.test.mjs` only if a shared server fixture helper is needed

**Interfaces:**
- `startDashboardServer({port = 0, homeDir = homedir(), env = process.env}) -> Promise<http.Server>` binds only to `127.0.0.1` and returns the listening server.
- `GET /api/dashboard` returns the normalized snapshot as JSON with `Cache-Control: no-store`.
- `POST /api/associations` accepts only `{host, sessionId, runId}` with a same-origin JSON request; validates that the session and selected run are in the same workspace in the current snapshot, then persists the override. `DELETE /api/associations?host=...&sessionId=...` removes that explicit override.
- Serve only `/`, `/assets/app.js`, and `/assets/styles.css` from the fixed `dashboard/` root. Apply a restrictive CSP (`default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`) and `X-Content-Type-Options: nosniff`.
- Reject non-loopback Host/Origin, missing Origin on association mutations, invalid content types, bodies over 16 KiB, encoded traversal, unsupported methods/routes, and symlinks escaping the asset root. API responses never include absolute transcript paths.

- [x] **Step 1: Write failing HTTP tests** for loopback bind, GET snapshot, association add/update/delete, hostile Host/Origin, absent Origin, wrong content type, oversized JSON, encoded traversal, unknown route/method, and symlink escape.
- [x] **Step 2: Run `node --test tests/dashboard-server.test.mjs`** and confirm the new server export is missing.
- [x] **Step 3: Implement `startDashboardServer`** and the fixed route table with bounded body parsing, strict origin checks, no-store JSON, CSP, and only the permitted local config mutation.
- [x] **Step 4: Implement `scripts/dashboard.mjs`** with `--port <0..65535>` validation; default to port `0`, print the resulting `http://127.0.0.1:<port>` URL, and close on SIGINT/SIGTERM.
- [x] **Step 5: Run `node --test tests/dashboard-server.test.mjs`**; verify workspace/run/transcript source files remain byte-for-byte unchanged after all HTTP calls.

## Task 4: Build the Workspace → Session → SDLC Interface

**Files:**
- Create: `dashboard/index.html`
- Create: `dashboard/app.js`
- Create: `dashboard/styles.css`
- Create: `tests/dashboard-ui.test.mjs`

**Interfaces:**
- `GET /api/dashboard` supplies the view model defined in Task 2; UI refresh interval is `3000` ms.
- The UI uses only DOM APIs and `textContent` for transcript-derived values; no `innerHTML`, inline scripts, external fonts, images, or network dependencies.
- Workspace selection controls the middle session list. A session with `runId: null` shows an explicit unlinked state. Selecting a linked session shows only that run's gate, review, test and skill-event data.
- A pending human gate is a high-contrast approval banner from `RunSummary.gates`; conversational questions are a separate question banner from unresolved transcript events. No front-end action can approve a gate.
- A graph node opens an accessible detail panel showing event/evidence source, timestamp, outcome (`unknown` when not proven), bounded excerpt, and review/test details. Edges represent explicit relationships only.

- [x] **Step 1: Write failing UI contract tests** for required workspace/session/detail regions, separate approval/question labels, the `3000` ms refresh constant, no remote URL or inline script, and escaped transcript rendering using `textContent`.
- [x] **Step 2: Run `node --test tests/dashboard-ui.test.mjs`** and confirm the page/assets and required functions are absent.
- [x] **Step 3: Implement the three-column responsive interface** using the approved Astryx-informed folder rail, selected row, question/approval badges, host session cards, run phase/gates, skill graph, and selectable detail panel.
- [x] **Step 4: Implement selection and polling** so workspace/session/node selection is preserved across refreshes when IDs remain present, and missing/invalid data displays a clear non-success message.
- [x] **Step 5: Run `node --test tests/dashboard-ui.test.mjs`**, then manually smoke-test in Microsoft Edge: change workspace and session, select a graph node, view a pending approval and question separately, inspect TDD/cross-review/API/E2E nodes, resolve an unlinked session, and resize to a narrow viewport.

Implementation note: the snapshot exposes `associationSource` so the UI distinguishes saved overrides from transcript-derived links and only offers removal for a saved override.

## Task 5: Expose, Document, and Validate the Dashboard

**Files:**
- Modify: `package.json` (`scripts.dashboard`)
- Modify: `README.md` and `README.en.md` (local dashboard usage and privacy limits)
- Modify: `tests/dashboard-ui.test.mjs` only if documentation command/static asset integration needs coverage

**Interfaces:**
- `npm run dashboard -- --port 0` launches the same entry point as `node scripts/dashboard.mjs --port 0`.
- README instructions explain that only local host files are read, host formats can be unsupported, no transcript is uploaded, the dashboard cannot approve gates, and explicit run association may be needed.

- [x] **Step 1: Add a failing documentation/CLI contract check** that asserts package.json exposes `dashboard` and both README variants document command, local-only behavior, and unlinked sessions.
- [x] **Step 2: Run `node --test tests/dashboard-ui.test.mjs`** and confirm the command/documentation assertions fail.
- [x] **Step 3: Add the npm script and matching Korean/English instructions** in the respective README's workflow documentation section.
- [x] **Step 4: Run targeted tests** with `node --test tests/dashboard-*.test.mjs` and run `npm run dashboard -- --port 0` as a smoke test; fetch `/api/dashboard`, verify it returns JSON, and stop the process cleanly.
- [x] **Step 5: Run `npm test`, `npm run validate`, and `git diff --check`**; verify no real host transcript or generated browser artifact is added to the repository.
