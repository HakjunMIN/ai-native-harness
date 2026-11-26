# Fork adoption: hook runtime, guard precision, role models, review cap, run worktrees

## Intent

The `ai-sdlc-fis` fork (v0.2.0 → v0.8.7, 50 commits) hardened this harness in
field use. The maintainer selected five improvements to bring back. Each one is
adapted to this repository's Jira/local run identity and to its existing
`reconcile` flow. Fork-only domain features are out of scope.

## Scope

| ID | Change | Risk tier |
| --- | --- | --- |
| A | Hooks find Node.js outside an interactive shell `PATH` | High (hooks) |
| B | Guard denies real `git push`, not `git stash push` or a quoted word | High (hooks) |
| C | Per-role subagent models; reviewer model must differ from author model | High (config/state schema, installer) |
| D | Review severity, two-round cap, human acceptance of residual findings | High (gate semantics) |
| E | Dedicated run worktree under `.worktrees/sdlc/<ID>/`, `.gitignore` handling | High (start, installer, hooks) |

## Non-goals

- Cross-review by planning participants in G1 or G2. The maintainer rejected it
  as too heavy for simple changes.
- Requiring a different model **family** by default. `requireDifferentFamily`
  stays `false`.
- G3 adaptive review, autopilot gate stop, plan amendments, upgrade approval
  carry-over, the local run store, the `.scratch` ignore rule, GitHub `gh-N`
  identities, version labels and Draft PR publication.
- Changing Codex agent configuration or shared-install agent links.

## A. Hook Node runtime

**Problem.** `hooks/gate-guard.sh` and `hooks/session-start.sh` run
`exec node …`. A host started from a GUI often has a `PATH` without nvm or
Homebrew. Running `env -i PATH=/usr/bin:/bin HOME=$HOME bash hooks/gate-guard.sh`
prints `exec: node: not found` and exits 127. The Copilot CLI documentation for
this build says a `preToolUse` hook that fails denies the call. Every tool call
is then denied.

**Design.**

- Add `hooks/node-runtime.sh`, ported from the fork. It sets `NODE_BIN` from the
  first candidate that exists:
  1. `$AI_NATIVE_SDLC_NODE`
  2. `command -v node`
  3. `$NVM_BIN/node`
  4. `/opt/homebrew/bin/node`
  5. `/usr/local/bin/node`
  6. `$HOME/.nvm/versions/node/*/bin/node`
- If no candidate exists, or the chosen file is not executable, it prints a fix
  hint naming `AI_NATIVE_SDLC_NODE` and exits 127. The hook still fails closed,
  but the reason is now clear.
- Both wrapper scripts source it and run `exec "$NODE_BIN" …`.
- Register the new file wherever hook assets are listed:
  - the `install.sh` asset check;
  - the shell-file list in `scripts/validate.mjs`.
- The shared installer's POSIX hook commands call the `.sh` wrappers instead of
  `node` directly. PowerShell and native Windows commands are unchanged.

## B. Guard push detection

**Problem.** The guard uses the regular expression
`\bgit\b[^;\n]*\bpush\b`. It denies both `git stash push -m wip` and
`git commit -m "push docs"`, which reproduces the field false positives.

**Design.**

- Split the command into segments on `;`, `&&`, `||`, `|`, `&` and newlines,
  respecting single and double quotes.
- For each segment that starts with `git` (after optional `env`/assignment
  prefixes), skip Git's global options to find the subcommand:
  - options that take a value: `-C`, `-c`, `--git-dir`, `--work-tree`,
    `--namespace`, `--exec-path`, `--config-env`;
  - flags without a value: `--no-pager`, `--bare`, `--no-replace-objects`,
    `-p`, `-P`, `--paginate`, `--literal-pathspecs`, …
- Deny when the subcommand is `push`. Keep denying `gh pr merge`.
- **Fail closed** for opaque commands. If the command contains `eval`,
  `bash -c`/`sh -c`/`zsh -c`, `$(`, a backtick, `xargs`, or a `-c alias.` Git
  option, keep the previous conservative regular expression.
- The deployment and production-path rules are unchanged.

## C. Role models

**Configuration.** `ai-native-sdlc.config.json` gains two optional maps.

- `models` maps a role or `default` to a nonempty model ID.
- `reasoningEfforts` maps a role or `default` to one of `low`, `medium`,
  `high`, `xhigh` or `max`.
- Roles are the shipped agent names: `architect`, `code-reviewer`,
  `cross-reviewer`, `implementer`, `release-engineer`, `spec-reviewer`,
  `test-writer`, `ux-designer`, `verifier`.
- An unknown key, an empty value or an unsupported effort is an error.
- `scripts/workflow.mjs` exports the validators. `createPolicy` also rejects an
  invalid map, so a broken config is caught when the policy is created and not
  only at install time.

**Binding.**

- **Conductor dispatch (all hosts).** The protocol tells the conductor to
  dispatch each specialist with `models.<role>`, falling back to
  `models.default`, using the host's per-dispatch model option.
  - If the mapped model cannot be routed, report `BLOCKED`. Never substitute
    another model silently.
  - Record the actual model reported by the host, not the configured value.
- **Copilot copy install.** `install.sh` reads the target's config.
  - For each mapped role, it generates a project-local
    `.github/agents/<role>.agent.md` with `model:` and `reasoning-effort:`
    frontmatter, using a new `scripts/install-agent-models.mjs`.
  - Unmapped roles keep the existing relative link.
  - The installer validates the whole config before it replaces any file.
  - The manifest records generated agents as file entries, so a later edit is
    detected as a conflict, as for other managed files.
- **Shared install and Codex.** Agent files are unchanged. These installs rely
  on conductor dispatch only.

**Enforcement.**

- New policies get a boolean `requireDifferentModel`, set from
  `review.requireDifferentModel`. It defaults to **true**.
- `reviewErrors` rejects a model review whose `authorModel` equals its
  `reviewerModel`, compared case-insensitively after trimming. The error is
  `<gate>: reviewer model must differ from author model`.
- Human reviews are not affected.
- `requireDifferentFamily` keeps its current meaning and default of `false`.
- `policyErrors` accepts a policy without the field, which covers policies
  created before this change, and rejects a non-boolean value.

## D. Review severity and round cap

**Severity.** A finding blocks only when it:

- violates an approved acceptance criterion or contract;
- is a security defect with a concrete exploit path;
- breaks the build or tests; or
- causes data loss.

Everything else is should-fix or nit and is listed as a follow-up. A reviewer's
request for a new acceptance criterion or extra cases is should-fix.

**Rounds.** Each subject gets at most two rounds: the initial review and one
delta re-review. Subjects are the G2 plan review, each slice review and the G4
final review. The delta re-review covers only the fix diff and its blast
radius. An implementation-only fix needs fresh GREEN, not a new RED, unless the
test expectations change.

If blocking findings remain after round two, the conductor stops and reports
`NEEDS_HUMAN` with three options:

1. accept with follow-ups;
2. fix once more;
3. descope.

**State.** A review may carry
`acceptance: {actor: "human", reference, at, followUps: [text, …]}`.

- With an acceptance, validation requires `blocking` to be an integer of at
  least 1, a valid human record and nonempty follow-ups.
- Without an acceptance, `blocking` must be 0, as today.
- Self-acceptance is not valid; the actor must be the human.
- Acceptance is allowed even when `allowHumanReview` is false. It records a
  human decision about residual findings; it does not substitute for the review.

**Documents.** Update `skills/code-review`, `skills/sdlc-implement`,
`skills/sdlc-plan`, `skills/sdlc/references/protocol.md` and the reviewer agent
profiles.

## E. Run worktree

**Problem.**

- Today a run is created in the primary checkout's `docs/sdlc/<ID>/`.
- `workspaces.mjs start` switches the primary checkout to
  `sdlc/<ID>/integration`.
- Task worktrees go beside the repository in
  `<repo>.sdlc-worktrees/<ID>/t<N>`.

Parallel tickets therefore contend for one checkout, and the sibling directory
is outside the project.

**Layout.**

| Item | Path | Branch |
| --- | --- | --- |
| Run worktree | `<primary>/.worktrees/sdlc/<ID>/integration` | `sdlc/<ID>/integration` |
| Slice worktree | `<primary>/.worktrees/sdlc/<ID>/t<N>` | `sdlc/<ID>/t<N>` |
| Run state | `docs/sdlc/<ID>/` inside the run worktree | — |
| Snapshot cache | `.ai-native-sdlc-revisions` in the primary checkout, shared by all worktrees | — |

**New module.** Add `scripts/run-workspace.mjs`, ported from the fork at
`92d770f` and adapted to Jira/local IDs. It provides:

- `worktrees()` and `mainWorktree()`, from `git worktree list --porcelain`;
- `requireIgnoredWorkspace()`, which refuses to create a worktree unless
  `git check-ignore` confirms the path is ignored. The error tells the user to
  add `/.worktrees/` to `.gitignore`;
- a per-repository lock directory in the Git common directory, with a pid file,
  stale-lock reclaim and a bounded wait;
- `addWorktree()` and `discardWorktree()`, which roll back on failure;
- `withRunWorkspace(id, root, create)`, which:
  - adopts the current linked worktree if it is already on the run's
    integration branch;
  - refuses when the run, the branch or the worktree already exists, or when
    starting from another run's branch;
  - requires a HEAD commit and warns about uncommitted changes;
  - removes the new worktree if `create` throws;
- `listRuns()`, which finds `docs/sdlc/*/state.json` in every worktree. A copy
  in a dedicated worktree wins over a stale copy in the primary checkout.

**Start.**

- The CLI paths `harness.mjs start` and `intake.mjs start|start-text` create
  the run inside the new worktree and print its state path.
- The exported in-place functions `startJira`, `startLocal` and
  `startLocalText` keep their behavior for programmatic callers and tests.

**Snapshot cache.**

- `cacheRoot` maps a linked worktree to the same relative path in the primary
  checkout, so concurrent runs share one cache and a run still resolves after
  its worktree is removed.
- `snapshotPath` falls back to the worktree's own cache.

**`workspaces.mjs`.**

- `start` must run in the run worktree on `sdlc/<ID>/integration`. Otherwise it
  fails with an exact fix command. It never switches the primary checkout.
- Slice worktrees are created under `.worktrees/sdlc/<ID>/t<N>`.
- The existing stale-plan protection is kept. The integration branch now always
  exists, so the trigger becomes "workspaces recorded for this integration
  branch in G0–G2 invalidation history, and the run is neither resuming nor
  reconciled".
- `reconcile` keeps its checks and runs in the run worktree.
- A new `list` command prints runs and their worktrees.

**Hooks.**

- The session banner uses `listRuns` and shows each run's worktree and state
  path.
- The guard falls back to the primary checkout's `ai-native-sdlc.config.json`
  when a linked worktree has none. Today `configAt` stops at the worktree's
  `.git` file.

**Installers.** Both installers add `/.worktrees/` to the target `.gitignore`
unless an equivalent rule (`/.worktrees/`, `/.worktrees`, `.worktrees/`,
`.worktrees`) exists.

- The installer preserves the existing content, CRLF line endings and file mode.
- The `.gitignore` is not a managed manifest entry. It is backed up and
  restored on failure.

## Compatibility

- **Pinned runs that are not upgraded** keep their snapshot's `state.mjs`,
  `workflow.mjs` and `workspaces.mjs`. That includes in-place integration
  switching and `<repo>.sdlc-worktrees`. Policies without
  `requireDifferentModel` are not checked for it.
- **Current-installation code used by every run:**
  - `guard.mjs` now allows Git subcommands other than `push`; otherwise it
    denies the same commands as before.
  - `session.mjs` lists runs in the primary checkout as before, plus runs in
    worktrees.
  - `harness.mjs resolve` and `restore` find legacy caches through the
    `cacheRoot` mapping (identity for the primary checkout) and the
    `snapshotPath` fallback.
- **Upgraded legacy runs** reset to G0 and recreate their policy under the new
  defaults. When such a run reaches `workspaces start` from the primary
  checkout, it fails with the fix command:
  `git worktree add -b sdlc/<ID>/integration .worktrees/sdlc/<ID>/integration`.
  The command is run from the committed plan, and the run resumes from the
  worktree's state path.
- **Rollback.** Revert the change and reinstall.
  - Runs pinned to this revision keep their snapshot in the primary cache.
    After a rollback, run `harness.mjs restore STATE --source <this release>`
    if resolution fails.
  - Generated agent files and the `.gitignore` rule may be left in place or
    removed by hand.
- **Version.** Minor bump to `0.2.0` with `CHANGELOG.md` entries.
  Consumers must reinstall to get the hook, agent and `.gitignore` changes.

## Verification

- Use `tdd` for each item, with tests in the existing files:
  - `hooks`, `install-project`, `install-shared`, `workflow`, `state`,
    `workspaces`, `local-intake`, `harness-revision`;
  - a new `run-workspace` test file.
- Run `npm test`, `npm run validate` and `git diff --check`.
- **Old-run fixture.** Create a run with the `507697a` harness, then check it
  with the new code: session listing, `resolve`, `restore`, resume through the
  pinned `state.mjs check`, and `workspaces plan`.
- **Host behavior** is reported separately and marked unverified unless
  observed in a live session:
  - hooks in a GUI-launched Copilot, Claude Code or Codex;
  - Copilot honoring `model:` and `reasoning-effort:` frontmatter.
