# Fork Adoption Implementation Plan

**Goal:** Implement design items A–E from the fork-adoption spec. Ship them as `0.2.0`.

**Architecture:** Follow the order A → B → D → C → E. Each item is test-first and
uses the existing test files. Item E adds `scripts/run-workspace.mjs`, which is
shared by `harness.mjs`, `intake.mjs`, `workspaces.mjs` and the hooks.

**Tech stack:** Node.js 22+, `node:test`, bash, Git worktrees. No new dependencies.

**Spec:** [Fork adoption design](../specs/2026-11-26-fork-adoption-design.md)

## Global constraints

- Work only in `.worktrees/fork-adoption` on `feature/fork-adoption`.
- Do not commit, push or merge without explicit authorization. When merging,
  prefer a squash merge.
- Keep the in-place exported start functions, because existing tests and
  callers use them.
- Keep the Jira (`ABC-1`) and `local-…` identities. Do not port `gh-N`.
- Behavior of pinned runs that are not upgraded must not change. Hooks and the
  resolver must still accept the legacy layout.

## Tasks

### 1. Hook Node runtime (A)

- **RED.** In `tests/hooks.test.mjs`, run each wrapper with
  `env -i PATH=/usr/bin:/bin HOME=<tmp>`:
  - with `AI_NATIVE_SDLC_NODE` set, the wrapper succeeds;
  - with no Node available, it exits 127 and prints the hint.
- **GREEN.**
  - Add `hooks/node-runtime.sh` and update `gate-guard.sh` and
    `session-start.sh` to source it.
  - Add the file to the `install.sh` asset check and to the shell list in
    `scripts/validate.mjs`.
  - Change the POSIX commands in `scripts/install-shared.mjs` to call the
    `.sh` wrappers.
- Update the related install tests.

### 2. Guard push detection (B)

- **RED.** In `tests/hooks.test.mjs`:
  - **Deny:** `git push`, `git -C x push`, `git -c a=b push`,
    `cd x && git push`, `FOO=1 git push`, `gh pr merge 1`,
    `bash -c "git push"`, `eval "git push"`.
  - **Allow:** `git stash push -m wip`, `git commit -m "push docs"`,
    `git log --grep push`, `echo push`.
- **GREEN.** Add a quote-aware segment splitter and a Git subcommand finder to
  `hooks/guard.mjs`. For opaque commands, fall back to the old regular
  expression.

### 3. Review severity, two-round cap and acceptance (D)

- **RED.** In `tests/state.test.mjs` or `tests/workflow.test.mjs`, a review with
  `blocking: 1`:
  - and a valid human acceptance with follow-ups → passes;
  - with no acceptance, an `actor` other than human, empty follow-ups or
    `blocking: 0` → fails.
- **GREEN.** Add the `acceptance` branch to `reviewErrors`.
- **Documents.** Update the severity, cap, delta re-review and `NEEDS_HUMAN`
  rules in:
  - `skills/code-review/SKILL.md`
  - `skills/sdlc-implement/SKILL.md`
  - `skills/sdlc-plan/SKILL.md`
  - `skills/sdlc/references/protocol.md`
  - `agents/code-reviewer.agent.md`, `agents/spec-reviewer.agent.md` and
    `agents/cross-reviewer.agent.md`, where they describe findings

### 4. Role models (C)

- **RED, `tests/workflow.test.mjs`.**
  - The validators accept role and `default` keys and the five effort values.
    They reject an unknown role, an empty model and a bad effort.
  - `createPolicy` sets `requireDifferentModel: true` by default, honors
    `false`, and rejects a non-boolean value.
  - `policyErrors` accepts a policy without the field.
- **RED, `tests/state.test.mjs`.** When `requireDifferentModel` is set, a model
  review with the same author and reviewer model fails. It passes when the
  models differ or the flag is absent.
- **RED, `tests/install-project.test.mjs`.**
  - A config with `models.code-reviewer` generates a managed file with
    `model:` frontmatter.
  - An unmapped role stays a link.
  - An invalid config aborts before any file changes.
  - A reinstall replaces the generated file. A hand-edited generated file is
    reported as a conflict.
- **GREEN.**
  - Add `validateModels` and `validateReasoningEfforts` to
    `scripts/workflow.mjs`, and extend `createPolicy` and `policyErrors`.
  - Add the same-model check to `scripts/state.mjs`.
  - Add `scripts/install-agent-models.mjs` and wire it into `install.sh`.
  - Add `reasoningEfforts` and `review.requireDifferentModel` to
    `templates/ai-native-sdlc.config.json`.
- **Documents.** Update:
  - the dispatch, `BLOCKED` and actual-model recording rules in the protocol;
  - the config description in `sdlc-setup`;
  - `docs/install.md`.

### 5. Run worktree (E)

- **RED, new `tests/run-workspace.test.mjs`.**
  - Start creates `.worktrees/sdlc/<ID>/integration` on
    `sdlc/<ID>/integration`.
  - Start refuses an unignored path, an existing branch or run, and starting
    from another run's branch.
  - It adopts the current run worktree, and rolls back when `create` throws.
  - `listRuns` prefers the dedicated worktree copy.
  - The lock serializes concurrent starts.
- **RED, other test files.**
  - `tests/local-intake.test.mjs`: the CLI `start` and `start-text` print a
    state path inside the worktree.
  - `tests/harness-revision.test.mjs`: the snapshot cache is in the primary
    checkout, `resolve` works after the worktree is removed, and a legacy
    in-worktree cache still resolves.
  - `tests/workspaces.test.mjs`:
    - `start` from the primary checkout fails with the fix command;
    - slice worktrees are created under `.worktrees/sdlc/<ID>/t<N>`;
    - replan, reconcile and resume keep their protections in run-worktree
      mode;
    - `list` prints each run.
  - `tests/hooks.test.mjs`: the session banner lists worktree runs and legacy
    primary-checkout runs, and the guard reads the primary config from a
    linked worktree.
  - `tests/install-project.test.mjs` and `tests/install-shared.test.mjs`: the
    `.gitignore` rule is added once, equivalent rules are respected, CRLF and
    mode are preserved, and a failed install rolls the file back.
- **GREEN.**
  - Port `scripts/run-workspace.mjs`.
  - Wire it into `harness.mjs` (CLI start, `cacheRoot`, `snapshotPath`),
    `intake.mjs` (CLI), `workspaces.mjs` (`requireRunWorktree`, slice paths,
    stale-plan trigger, `list`), `hooks/session.mjs` and `hooks/guard.mjs`.
  - Add the `.gitignore` handling to `install.sh` and
    `scripts/install-shared.mjs`.
- **Documents.** Update:
  - `skills/sdlc/SKILL.md`, the protocol, `skills/sdlc-implement`,
    `skills/sdlc-setup` and `templates/project-AGENTS.md`;
  - `docs/operations.md`, `docs/install.md`, `docs/compatibility.md` and
    `docs/customer-repository-discovery.md`;
  - the README files, where they describe paths.

### 6. Release handoff and verification

- Bump `package.json` and the three plugin manifests to `0.2.0`, and add the
  `CHANGELOG.md` entries.
- Run `npm test`, `npm run validate` and `git diff --check`.
- Run the old-run fixture check from the spec against a `507697a` harness copy
  in a temporary directory.
- Report host behavior that was not observed as unverified.

## Review focus

- The guard must not allow a real push through any wrapper. Opaque forms must
  stay denied.
- A new run must never write state into the primary checkout. A failed start
  must leave no worktree, branch or lock behind.
- Old pinned runs must still list, resolve, restore and resume without any
  migration.
- The same-model rule must not affect human reviews or old policies.
- The installer must never change a target file before the whole config has
  been validated.
