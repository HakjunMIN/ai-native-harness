# Conversational Local Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start Jira-free SDLC from natural-language interview and persist an immutable local Markdown intake without a prewritten request file.

**Architecture:** The `sdlc` conductor interviews only for material uncertainty, writes the original request and confirmed details once, and invokes an added stdin command on the existing atomic intake engine. The state/hash and G0/G1 approval contracts remain unchanged.

**Tech Stack:** Node.js 22+ ESM, Node built-in test runner, Markdown skills.

**Spec:** `docs/superpowers/specs/2026-09-29-conversational-local-intake-design.md`

## Global Constraints

- Bare `sdlc` still reports existing runs; Jira-key entry and `intake.mjs start LOCAL-ID REQUEST_FILE [REPOSITORY_ROOT]` are unchanged.
- New CLI interface: `intake.mjs start-text LOCAL-ID [REPOSITORY_ROOT]` reads Markdown bytes from stdin and creates exactly one immutable `intake.md`.
- Reject empty/whitespace input, invalid IDs, existing output and symlink output directories without changing gates or replacing user files.
- G0/G1/G2 start pending; G1 requires actual human approval; local work has no Jira writes.
- Avoid persisting credentials or unsupported conclusions; material unanswered questions remain visible.

---

## File map

- `scripts/intake.mjs`: share atomic local creation between file and stdin input.
- `tests/local-intake.test.mjs`: assert stdin behavior, unchanged file path, invalid-input and state-hash invariants.
- `skills/sdlc/SKILL.md`: interview entry and Markdown formatting/routing when natural-language request has no Jira key.
- `skills/sdlc-discover/SKILL.md`, `skills/sdlc/references/protocol.md`: immutable request evidence and G0/G1 constraints.
- `README.md`, `docs/operations.md`: simple user entry and optional manual automation reference.

### Task 1: Atomic stdin intake

**Files:**
- Modify: `scripts/intake.mjs`
- Modify: `tests/local-intake.test.mjs`

**Interfaces:**
- Consumes: `node scripts/intake.mjs start-text LOCAL-ID [REPOSITORY_ROOT]` with Markdown on stdin.
- Produces: `startLocalText(id: string, content: string, repositoryRoot?: string): string` returning state path, sharing existing file-start logic.

- [ ] **Step 1: Add failing tests** in `tests/local-intake.test.mjs` for stdin start and invalid requests:

```js
test('starts a pending local run from interviewed Markdown on stdin', t => {
  const {repo,statePath} = fixture(t);
  const markdown = '# Original request\n\nImprove documentation\n\n## Interview\n\n- Scope: README\n';
  const run = input => spawnSync(process.execPath,
    [resolve('scripts/intake.mjs'),'start-text','local-doc-change',repo],
    {input,encoding:'utf8'});
  assert.equal(run(markdown).status,0);
  const state = JSON.parse(readFileSync(statePath,'utf8'));
  assert.equal(readFileSync(join(repo,'docs/sdlc/local-doc-change/intake.md'),'utf8'),markdown);
  assert.equal(state.intake.request.sha256,digest(markdown));
  assert.equal(state.gates.G0.status,'pending');
  assert.equal(state.gates.G1.status,'pending');
  assert.equal(state.jira,undefined);
  assert.notEqual(run(markdown).status,0);
});
test('rejects blank interviewed Markdown without creating state', t => {
  const {repo,statePath} = fixture(t);
  const result = spawnSync(process.execPath,
    [resolve('scripts/intake.mjs'),'start-text','local-doc-change',repo],
    {input:' \n',encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/nonempty/);
  assert.equal(existsSync(statePath),false);
});
```

- [ ] **Step 2: Run `node --test tests/local-intake.test.mjs` and confirm RED** because `start-text` does not exist.
- [ ] **Step 3: Extract shared creation** from `startLocal(id, requestFile, repositoryRoot)` into `startLocalText(id, content, repositoryRoot)` with existing validation, staging, state serialization and cleanup untouched; `startLocal` reads the file then calls `startLocalText`, and the CLI `start-text` reads `readFileSync(0,'utf8')`. Check `command`, argument count and root exactly; a missing ID and extra arguments fail with usage. Do not write a transient request file.
- [ ] **Step 4: Add tests** for stdin with invalid ID, output symlink, no stdin, non-default cwd, and `validateState`/`state.mjs check` on the generated run; make each test observe the error and absence of new files.
- [ ] **Step 5: Run `node --test tests/local-intake.test.mjs` and `npm run validate`; expect all passing.**
- [ ] **Step 6: Commit.**

```bash
git add scripts/intake.mjs tests/local-intake.test.mjs
git commit -m "feat: start local SDLC intake from stdin"
```

### Task 2: Conversational routing and user documentation

**Files:**
- Modify: `skills/sdlc/SKILL.md`
- Modify: `skills/sdlc-discover/SKILL.md`
- Modify: `skills/sdlc/references/protocol.md`
- Modify: `README.md`
- Modify: `docs/operations.md`
- Test: `tests/local-intake.test.mjs` (reuse Task 1 command/state assertions)

**Interfaces:**
- Consumes: `start-text LOCAL-ID [REPOSITORY_ROOT]` from Task 1.
- Produces: documented `sdlc <natural-language request>` path and unchanged bare/Jira paths.

- [ ] **Step 1: Rewrite `skills/sdlc/SKILL.md` entry** with explicit branches: bare `sdlc` lists status; Jira key reads Jira; non-Jira substantive task starts interview. Ask only material unknowns, preserve original request and Q&A, choose unused local ID, redact sensitive content, write `intake.md` via `start-text` stdin, then route to setup/discovery. Require pending gates; distinguish request recording from G1 approval. Keep `start` from existing file as optional.
- [ ] **Step 2: Align discovery and protocol** with the new interview source: `state.intake.request` always references a copied/generated immutable `intake.md`; G0 binds exact hash and AC/module map; no auto approval or Jira writes. Tell the conductor not to modify intake after creation; revised original request needs new ID.
- [ ] **Step 3: Simplify README `## 시작`** to show `sdlc 문서 검색 화면의 빈 상태를 개선해줘` (natural language, no manual file or ID). State that interview creates `docs/sdlc/local-<slug>/intake.md` and `state.json`, and link to the manual command in operations. Keep Jira `sdlc ABC-123` example.
- [ ] **Step 4: Update `docs/operations.md`** with both executable commands, marking the file-based command as optional automation:

```bash
printf '# Request\n\nUpdate documentation without Jira.\n' |
  node "$PLUGIN_ROOT/scripts/intake.mjs" start-text local-doc-update
node "$PLUGIN_ROOT/scripts/intake.mjs" start local-doc-update ./request.md
```

- [ ] **Step 5: Run `npm test && npm run validate`; inspect that README no longer requires a prewritten local request, while the optional file path and G1 authority remain discoverable.**
- [ ] **Step 6: Commit.**

```bash
git add skills/sdlc/SKILL.md skills/sdlc-discover/SKILL.md skills/sdlc/references/protocol.md README.md docs/operations.md
git commit -m "docs: start Jira-free SDLC with a conversational interview"
```

## Self-review

The new stdin interface is exercised by local state/evidence tests; both entry paths
keep one atomic state implementation. The interview changes routing and persistence,
not approval authority. A real host interview remains a runtime smoke check, not
something the source tests alone can assert.
