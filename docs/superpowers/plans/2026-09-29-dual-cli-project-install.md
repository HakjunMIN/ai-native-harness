# Dual-CLI Project Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install one symlink-based project harness whose skills, native agents and safety hooks work in both Copilot CLI and Codex CLI.

**Architecture:** One Node installer links to the source checkout and creates host-specific project discovery files without altering existing user files. Existing guard and session logic gain explicit Codex adapters; source scripts and templates stay in the linked checkout.

**Tech Stack:** Node.js 22+ ESM, Node built-in test runner, Bash, JSON, TOML.

**Spec:** `docs/superpowers/specs/2026-09-29-dual-cli-project-install-design.md`

## Global Constraints

- Install only within an explicitly selected target project; do not globally install plugins or modify home configuration.
- Node.js 22+ and Bash are required; no npm dependencies or network access for wiring.
- Existing user files, project settings, and `AGENTS.md` remain untouched; stop on all conflicting destinations before creating any.
- Symlinks target the original checkout; source updates propagate to linked content, but generated host configurations require explicit refresh.
- Never claim Codex Markdown `tools` frontmatter enforces native permissions or that a hook is an OS security boundary.
- Preserve Claude and Copilot plugin manifests; no implicit Git remote mutation.

## File map

- `hooks/guard.mjs`: shared decision logic plus Codex input normalization/denial output.
- `hooks/session.mjs`: emit Codex-specific session context.
- `tests/hooks.test.mjs`: test both existing adapters and Codex, including denial for Codex patch and shell tools.
- `scripts/install-project.mjs`: validate source/target, compute all destinations, preflight collisions, install idempotently and roll back only newly created entries.
- `tests/install-project.test.mjs`: fixture project installation, conflicting files, broken links, idempotence and generated hook execution.
- `README.md` and `docs/compatibility.md`: project-first installation instructions and verified host limits.

### Task 1: Codex hook adapter

**Files:**
- Modify: `hooks/guard.mjs`
- Modify: `hooks/session.mjs`
- Modify: `tests/hooks.test.mjs`

**Interfaces:**
- Consumes: existing `node hooks/guard.mjs <adapter>` / `node hooks/session.mjs <adapter>` command entry points.
- Produces: `node hooks/guard.mjs codex` with `hookSpecificOutput` on denial; `node hooks/session.mjs codex` with Codex `SessionStart` context.

- [ ] **Step 1: Add failing tests for actual Codex payload/output.**

```js
const codex = (tool_name, tool_input) => ({
  hook_event_name: 'PreToolUse', tool_name, tool_input, cwd: process.cwd()
});
test('Codex denies prohibited shell and patch operations', () => {
  for (const [name, input] of [
    ['Bash', {command:'git push origin main'}],
    ['apply_patch', {command:'*** Begin Patch\n*** Update File: deploy/prod/values.yaml\n*** End Patch'}]
  ]) {
    const output = hook(codex(name, input), 'codex');
    assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  }
  assert.equal(hook(codex('Bash', {command:'git status'}), 'codex').hookSpecificOutput?.permissionDecision, undefined);
  assert.equal(hook({}, 'codex').hookSpecificOutput.permissionDecision, 'deny');
});
test('Codex session-start emits host-specific context', () => {
  const result = spawnSync(process.execPath, [resolve('hooks/session.mjs'), 'codex'],
    {input: JSON.stringify({cwd:process.cwd(), hook_event_name:'SessionStart'}), encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'SessionStart');
});
```

- [ ] **Step 2: Verify RED.** Run `node --test tests/hooks.test.mjs`; expect Codex denial shape assertions to fail.
- [ ] **Step 3: Implement normalization of Codex's `tool_name`, `tool_input.command` for shell and `apply_patch`, shared decisions and Codex-only host output.** In `hooks/guard.mjs`, transform Codex `apply_patch` command to `{patch: command}` before `decide`, and wrap denied results as `hookSpecificOutput: {hookEventName:'PreToolUse', ...result}`. Preserve the current Copilot and Claude outputs; malformed payloads must produce structured denial. In `hooks/session.mjs`, wrap the computed `additionalContext` for Codex as `{hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:context}}`. Do not authorize neutral calls.
- [ ] **Step 4: Verify GREEN and regression.** Run `node --test tests/hooks.test.mjs`; expect pass.
- [ ] **Step 5: Commit.**

```bash
git add hooks/guard.mjs hooks/session.mjs tests/hooks.test.mjs
git commit -m "feat: adapt safety hooks for Codex CLI"
```

### Task 2: One-command, non-destructive project installer

**Files:**
- Create: `scripts/install-project.mjs`
- Create: `tests/install-project.test.mjs`

**Interfaces:**
- Consumes: `node scripts/install-project.mjs TARGET [SOURCE]`, source `skills/`, `agents/`, `hooks/`, `scripts/`, `templates/`.
- Produces: target `.ai-native-sdlc`, `.agents/skills/*`, `.github/agents/*.agent.md`, `.codex/agents/*.toml`, `.github/hooks/ai-native-sdlc.json` and `.codex/hooks.json`.

- [ ] **Step 1: Write fixture tests using `mkdtempSync` and `spawnSync`** that create a target directory and run `node scripts/install-project.mjs TARGET SOURCE`. Assert source skills and agents exist as resolvable links, JSON configs parse and hook commands deny `git push origin main` with the correct host-specific shape. Start with:

```js
const source = resolve('.');
const target = mkdtempSync(join(tmpdir(), 'dual-cli-project-'));
t.after(() => rmSync(target, {recursive:true}));
const result = spawnSync(process.execPath,
  [resolve('scripts/install-project.mjs'), target, source], {encoding:'utf8'});
assert.equal(result.status, 0, result.stderr);
assert.equal(realpathSync(join(target, '.ai-native-sdlc')), source);
for (const name of readdirSync(join(source, 'skills'))) {
  assert.equal(realpathSync(join(target, '.agents/skills', name)),
    realpathSync(join(source, 'skills', name)));
}
const codexHooks = JSON.parse(readFileSync(join(target, '.codex/hooks.json')));
assert.ok(codexHooks.hooks.PreToolUse.length);
```

- [ ] **Step 2: Add failing tests for duplicate install (no changes), preexisting `.codex/hooks.json` (no files written, original intact), existing same-named skill (no files written), broken `.ai-native-sdlc` symlink (explicit error), and rollback after a forced installation failure (remove only newly created entries).** Avoid test-only production bypasses: use filesystem errors after preflight. Assert the guard output using `spawnSync('bash', ['-c', hookCommand], {input:JSON.stringify(payload), cwd:target, encoding:'utf8'})`. Example collision:

```js
mkdirSync(join(target, '.codex'), {recursive:true});
writeFileSync(join(target, '.codex/hooks.json'), '{"user":true}');
const failed = spawnSync(process.execPath,
  [resolve('scripts/install-project.mjs'), target, source], {encoding:'utf8'});
assert.notEqual(failed.status, 0);
assert.equal(readFileSync(join(target, '.codex/hooks.json'), 'utf8'), '{"user":true}');
assert.equal(existsSync(join(target, '.ai-native-sdlc')), false);
```
- [ ] **Step 3: Run `node --test tests/install-project.test.mjs` and confirm missing installer failure.**
- [ ] **Step 4: Implement the installer** as focused functions `planInstall(target, source)` (returns `{path, kind, contentOrTarget}[]`), `preflight(entries)` (checks existing file identity without writes), and `install(entries)` (creates required directories and entries, tracks created paths for rollback). Resolve `import.meta.url` for default source, ensure distinct absolute target/source and required source files. Use relative symlink targets calculated with `relative(dirname(destination), sourcePath)`; test realpath and file types. Keep generated hooks executable as Bash commands with shell-quoted absolute paths through `.ai-native-sdlc/hooks/{session-start,gate-guard}.sh`; invoke `codex` or `copilot` as adapter argument. TOML agents require quoted `name`, `description` and `developer_instructions` (escape newlines, quotes, backslashes); instruct the Codex agent to read its exact Markdown profile and follow it subject to host permissions. Use strict content equality for owned generated files on rerun. Do not delete existing parent directories on rollback unless created by this run and empty.

```js
function linkEntry(path, sourcePath) {
  return {path, kind:'symlink', contentOrTarget:relative(dirname(path), sourcePath)};
}
function preflight(entries) {
  for (const entry of entries) {
    const stat = lstatSync(entry.path, {throwIfNoEntry:false});
    if (!stat) continue;
    const matches = entry.kind === 'symlink'
      ? stat.isSymbolicLink() && readlinkSync(entry.path) === entry.contentOrTarget
        && existsSync(entry.path)
      : stat.isFile() && readFileSync(entry.path, 'utf8') === entry.contentOrTarget;
    if (!matches) throw new Error(`Conflicting installation path: ${entry.path}`);
  }
}
```
- [ ] **Step 5: Run `node --test tests/install-project.test.mjs tests/hooks.test.mjs`; correct until pass.**
- [ ] **Step 6: Commit.**

```bash
git add scripts/install-project.mjs tests/install-project.test.mjs
git commit -m "feat: install linked harness for Copilot and Codex projects"
```

### Task 3: Document and validate both hosts

**Files:**
- Modify: `README.md`
- Modify: `docs/compatibility.md`
- Modify: `tests/install-project.test.mjs` (if smoke assertions reveal a coverage gap)

**Interfaces:**
- Consumes: `node /path/to/ai-native-harness/scripts/install-project.mjs /path/to/target` from Task 2.
- Produces: an accurate project-first README and an installation acceptance report (in the task response, not a fabricated checked-in success claim).

- [ ] **Step 1: Update README install section** to show the single command, target layout, rerunning after a move/agent list change, conflict handling, Copilot `/skills` and `/agent`, Codex `/skills`, `/agent`, `/hooks` verification. Preserve optional plugin and Claude instructions. State scripts/templates are runtime assets in linked checkout and tests/examples aren't installed to target.

```bash
node /absolute/path/to/ai-native-harness/scripts/install-project.mjs /absolute/path/to/target-project
```
- [ ] **Step 2: Correct `docs/compatibility.md`**: Codex project hooks and TOML native agents are supported by this installation; Codex requires project and hook trust and host tool policies remain distinct. Replace stale assertion that Codex hooks cannot be registered, and distinguish structural testing from actual CLI behavior.
- [ ] **Step 3: Run `node --test tests/install-project.test.mjs tests/hooks.test.mjs && npm run validate`** and, if targeted checks pass, `npm test`. Expect all checks to pass.
- [ ] **Step 4: In a fresh disposable target project, install once and inspect** `copilot skill list` / `/agent` and Codex `/skills`, `/agent`, `/hooks`; trust the Codex hooks interactively and attempt a blocked operation in each host without pushing anything. Assert exactly 30 skills and 9 agents discovered per host and that both hooks deny a forbidden command. If host binaries/auth/trust are unavailable, mark live validation **unverified** and do not promote the README claim of verified equivalence. If symlink discovery fails, revise the installer or design and repeat the test before declaring the default complete.
- [ ] **Step 5: Commit documentation after only verified claims remain.**

```bash
git add README.md docs/compatibility.md tests/install-project.test.mjs
git commit -m "docs: document linked dual-CLI project installation"
```

## Plan self-review

- Spec coverage: one-command wiring (Task 2), all 30/9 discovery and conflicts (Tasks 2–3), shared Codex hook behavior (Task 1), runtime smoke checks and documentation (Task 3).
- No installer step updates user-owned AGENTS.md or global CLI settings.
- Live CLI compatibility is an acceptance gate, not a claim inferred from JSON syntax.
