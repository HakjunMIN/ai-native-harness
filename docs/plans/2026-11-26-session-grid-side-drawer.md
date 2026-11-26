# Session Grid and Side Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate session list and SDLC detail pane with a scannable session grid whose selected session opens in a side drawer.

**Architecture:** Keep the existing read-only API and workspace rail. Derive a sorted, filtered session-card view model in `dashboard/app.js`, render cards and optional run groups in the main content area, and render the selected session's existing SDLC/evidence detail in a responsive drawer. Preserve the current vanilla DOM, `textContent` rendering, and 3-second polling.

**Tech Stack:** Node.js >=22, native HTML/CSS/ES modules, existing `node:test` UI tests. No new dependencies or server/API changes.

**Spec:** `docs/specs/2026-11-26-session-sdlc-dashboard-design.md`, revision “session grid and detail interaction”.

## Global Constraints

- Implement as a local read-only web UI backed by a small Node.js local server, compatible with the repository's Node `>=22` engine. Reuse existing validation/test conventions; do not introduce a database for the first version.
- Bind the dashboard server to loopback only. No external API, cloud session-history endpoint, telemetry, CDN asset, or remote image/font request is permitted.
- Read host logs and workspace files without modifying them. Do not copy raw transcripts into the repository or a persistent dashboard cache. Parse on demand and retain only in-memory view data for the running process.
- Never render transcript text as HTML. Escape text, show short excerpts only for the selected run's relevant events, and provide a clear indication of the source and uncertainty of inferred classifications.
- The dashboard stays observational: it does not answer questions, approve gates, or mutate run state.
- Keep the dashboard's existing data sources and session/run association behavior unchanged.

## Review Focus

- A session with no linked run remains visible and explicitly unlinked; it never inherits another card's run details. Test with mixed linked/unlinked sessions in Task 1.
- Human approval and unanswered conversational questions remain separate, correctly ranked attention states. Test both classifications in Task 1 and their distinct card treatment in Task 2.
- Missing or invalid timestamps do not break sorting or put a session ahead of a real approval/question. Test in Task 1.
- Duplicate session IDs from different hosts do not select or navigate to the wrong card. Use the existing `(host, id)` session key in Tasks 1 and 3.
- Large filtered lists do not render all cards at once, and changing filters/workspaces does not leave an invalid page selection. Test eight-item pagination in Task 1 and Task 2.

---

## File Structure

- `dashboard/app.js` — derive the filtered/sorted card view, paginate it, render card/grid/group controls, and manage selected session/drawer navigation.
- `dashboard/index.html` — replace the separate session-list and detail-pane layout with the grid and an accessible drawer container while retaining the workspace rail and evidence regions.
- `dashboard/styles.css` — add responsive card-grid, attention states, and desktop/narrow-screen drawer presentation using existing color tokens.
- `tests/dashboard-ui.test.mjs` — test view-model behavior and the required UI regions, controls, accessible labels, and retained safe-text contract.

## Task 1: Derive Stable Session Grid Items and Pagination

**Files:**
- Modify: `dashboard/app.js`
- Modify: `tests/dashboard-ui.test.mjs`

**Interfaces:**
- `getSessionGridItems(snapshot, {workspaceId = null, host = 'all', filter = 'all', sort = 'attention'}) -> Array<{workspace, session, run}>` returns sessions across all workspaces when `workspaceId` is null, otherwise only that workspace. `run` is the matching run or `null`.
- Supported `host` values are `all`, `copilot`, `claude`, and `codex`. Supported `filter` values are `all`, `approval`, `question`, `failed`, and `unlinked`. `sort` is `attention` or `recent`.
- Attention ordering is approval wait, unanswered question, recent failure, other linked, and unlinked; timestamps sort descending within each rank. Invalid timestamps sort after valid timestamps at the same rank. Do not label a session as running without explicit host evidence.
- A session is in the `failed` filter/rank when its own events or its linked run's gate, review, or verification evidence records `failed`; never infer failure from missing evidence.
- `getSessionGridPage(items, visibleCount, pageSize = 8) -> {items, total, hasMore, nextCount}` returns only the first `visibleCount` items and caps `nextCount` to the remaining number of items.
- Session identity is the existing `(host, id)` key. Missing run data remains `null`; missing evidence never produces a passed outcome.

- [ ] **Step 1: Write failing view-model tests** named `session grid orders attention before recent activity`, `session grid filters by workspace host and attention`, and `session grid paginates eight items without losing the total`. Use literal fixture data with two hosts sharing an ID, an unlinked session, an approval gate, an unanswered question, a failure, and invalid timestamps.
- [ ] **Step 2: Run `node --test tests/dashboard-ui.test.mjs`** and confirm the new exports are missing.
- [ ] **Step 3: Implement `getSessionGridItems` and `getSessionGridPage`** as exported pure functions in `dashboard/app.js`; derive attention only from existing snapshot gate, question, event, and run evidence fields.
- [ ] **Step 4: Run `node --test tests/dashboard-ui.test.mjs`** and verify all filtering, stable identity, attention precedence, invalid-time handling, and page-boundary assertions pass.

## Task 2: Render the Workspace-to-Session Grid

**Files:**
- Modify: `dashboard/index.html`
- Modify: `dashboard/app.js`
- Modify: `dashboard/styles.css`
- Modify: `tests/dashboard-ui.test.mjs`

**Interfaces:**
- The workspace rail remains the leftmost workspace selector. “모든 워크스페이스” selects sessions across the current snapshot.
- The main grid renders at most eight cards initially and adds eight more per “더 보기” action. Reset the visible count when workspace, host, filter, or sort changes.
- Apply pagination to the filtered/sorted flat list before grouping, so “더 보기” always reveals the next eight sessions regardless of view mode.
- Each card shows host and session identity, last activity, linked-run title or explicit unlinked state, five SDLC phase progress, G0–G5b gate summary, verification types/outcomes, review/blocker count, and last session event.
- Approval-waiting cards use the existing orange attention treatment; unanswered questions use a distinct yellow treatment. Unlinked cards remain visible with subdued styling.
- Host and attention filters, recent/attention sort, and a flat/run-grouped view control are available above the cards. Flat view is the default.
- Build all transcript-derived card values with DOM nodes and `textContent`; do not add `innerHTML`, inline scripts, external assets, or network requests.

- [ ] **Step 1: Write a failing UI contract test** named `session overview replaces the separate list with a grid and load-more controls`. Assert the workspace rail remains, the session-grid region exists, the old standalone session-list region is absent, the drawer and SDLC/evidence regions remain available, and host/filter/group/load-more controls are present.
- [ ] **Step 2: Run `node --test tests/dashboard-ui.test.mjs`** and confirm the new grid contract fails against the current three-pane page.
- [ ] **Step 3: Replace `renderSessionList` usage with card-grid rendering** in `dashboard/app.js` using Task 1's view-model exports. Render flat cards by default; when grouping is enabled, show one run summary header and session-specific cards beneath it, with unlinked sessions grouped separately.
- [ ] **Step 4: Update `dashboard/index.html` and `dashboard/styles.css`** for the session grid, filters, run-group headers, “더 보기” action, visible attention states, and narrow-screen layout. Keep the existing workspace rail and no-external-assets contract.
- [ ] **Step 5: Run `node --test tests/dashboard-ui.test.mjs`** and verify the grid contract, card summaries, safe text rendering, no-inline-script/no-remote-request checks, and existing activity-summary tests pass.

## Task 3: Open Session Details in a Navigable Side Drawer

**Files:**
- Modify: `dashboard/index.html`
- Modify: `dashboard/app.js`
- Modify: `dashboard/styles.css`
- Modify: `tests/dashboard-ui.test.mjs`

**Interfaces:**
- Activating a card’s “자세히보기” selects that session and opens the drawer without hiding the grid on desktop.
- The drawer reuses the existing run phase, gates, activity lanes, inspector, warnings, approval banner, question banner, and association controls for the selected session.
- Previous/next buttons and `ArrowLeft`/`ArrowRight` navigate the currently visible filtered session list, wrapping at its ends. `Escape` closes the drawer and restores focus to the selected card’s detail button.
- Store the open session in `#host=<host>&session=<id>` using `URLSearchParams` for the host and session ID; this preserves the existing collision-safe `(host, id)` identity. Initialize from the hash and synchronize `hashchange`/back-forward navigation. Closing clears the hash.
- `getAdjacentSessionKey(items, currentKey, delta) -> string | null` accepts the returned `Array<{workspace, session, run}>`, returns the next visible item's existing `(host, id)` key, wraps at either end, and returns `null` for an empty list. `parseSessionHash(hash) -> string | null` returns that key from a valid hash; `formatSessionHash(session) -> string` round-trips the host and ID without collisions.
- On narrow viewports, show the drawer as an overlay rather than compressing the grid; keep its close control reachable and keyboard accessible.
- Polling preserves workspace, filters, visible-card count, grouping, and the selected drawer session when those IDs still exist.

- [ ] **Step 1: Write failing drawer contract tests** named `session details open in an accessible drawer` and `drawer navigation preserves selection across URL history`. Assert the drawer label, close/previous/next controls, keyboard/hash handler seam, and retained SDLC/evidence regions. Test `getAdjacentSessionKey` with duplicate IDs across hosts, filtered lists, and an empty list; test `parseSessionHash`/`formatSessionHash` with reserved characters and malformed hashes.
- [ ] **Step 2: Run `node --test tests/dashboard-ui.test.mjs`** and confirm the drawer interaction contract fails.
- [ ] **Step 3: Implement drawer rendering and navigation** in `dashboard/app.js`; preserve existing selected-session details and use `(host, id)` identity throughout card selection, URL state, and previous/next navigation.
- [ ] **Step 4: Add desktop side-by-side and narrow-screen overlay styles** in `dashboard/styles.css`, including focus-visible states and a scrollable drawer body.
- [ ] **Step 5: Run `node --test tests/dashboard-ui.test.mjs`**; manually smoke-test in Edge at desktop and narrow widths: open a card, inspect approval/question and run evidence, navigate with buttons and arrow keys, close with Escape, use browser back/forward, paginate, filter, group by run, and verify state survives the 3-second refresh.

## Final Verification

- [ ] Run `node --test tests/dashboard-ui.test.mjs`.
- [ ] Run `npm run validate`.
- [ ] Run `git diff --check`.
- [ ] Confirm only the intended dashboard UI, focused tests, and approved design/plan documents changed; do not commit, push, or deploy.
