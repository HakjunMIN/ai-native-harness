# Changelog

## [Unreleased]

## [0.3.0]

Released on `main` on 2026-11-27 as one squashed commit on top of `df1411c`;
not tagged.

- Run contract marker: runs started by local intake or Jira start now write
  `runContract: 2` to `harness.lock.json`. Every new rule below applies only to
  contract-2 runs; contract-1 runs keep their rules and reject contract-2 data.
- Code quality contract: the task draft declares `quality.modules[]` with
  `lint`, `format-check` and `typecheck` per module (a config command ID or a
  non-applicability reason). `quality-run.mjs run STATE [--task N]` executes the
  approved commands without a shell on a clean source and writes a report under
  the run directory; done slices bind `slice.quality`, G3 and G4 bind
  `gate.quality`. Go BFF defaults: `golangci-lint run ./...`,
  `golangci-lint fmt --diff`, `go build ./...` (`gofmt -l` is not a check).
  The author formats approved changed paths before committing; hooks stay guard-only.
- G1 execution preferences (`G1.approval.preferences`): `uiChange`, standing
  grants, the E2E level (`full` default, `regression`, `none`) and residual
  finding handling (`follow-up` default, `human`). `tasks.mjs prepare` derives
  `policy.verification` and `policy.autonomy` from them; the draft cannot set
  them. UI changes with E2E need a `playwright` or `playwright-bdd` AC check; a
  generic `playwright` check kind covers non-Grafana web UIs.
- Autonomous plan and implementation: standing grants `plan-commit`,
  `slice-commit` and `local-integration` replace per-action questions and are
  revoked with a `grants-revoked` history event. Non-critical choices go to the
  run's `decisions.md` (new template); only a fixed critical list stops for the
  human. After review round 2, the agent may accept residual blockers the
  reviewer marked non-critical (`round: 2`, `critical: 0`, a logged `D-n`
  decision and follow-ups). G1, G2 and G5b stay human gates.
- G2 proceed agreement: every contract-2 `02-plan.md` has a `Proceed agreement`
  section with the continue scope, plan-specific stop conditions added to the
  fixed critical list, and the separate approvals (push, merge, PR publication,
  production). Contract-2 G2 evidence must bind the hashed `02-plan.md`, so
  editing the agreement needs a renewed G2. Inside the agreement, finished steps
  and the next ready sub task are progress reports, not questions; a stop
  condition pauses only the affected work, and the human answer is logged in
  `decisions.md`.
- Environment facts: skills look up repository, CI and deployed state read-only
  before asking, and setup presents one confirmation form with sourced values.
- The guard limits `az` and `gh` to read-only observation (`az … show|list|query`,
  `gh pr|run|issue view`, `gh api` GET, and more; see the protocol). Other
  `az`/`gh` commands are denied, including through `env`, `sudo`, `timeout`,
  `bash -c` or shell-keyword wrappers, as arguments to other programs, and when a gh
  flag precedes the subcommand; `az`/`gh` with `$`, backticks, `<(`, `eval` or
  `xargs` fail closed. Observation-only commands skip the production-text check, so
  `az group show -n production` is neutral.
- Package maintenance: ESLint (`npm run lint`, `eslint.config.mjs`) and a `Lint`
  workflow join `Validate plugin`; ESLint is a development dependency only, so
  runtime dependencies stay at zero. Both READMEs are condensed with CI, lint,
  version and platform badges; dashboard detail moved to `docs/dashboard.md` and
  progress inspection to `docs/operations.md`.
- Dashboard (#4): session cards add a VS Code link and a resume-command copy
  button. Copilot sessions open as `vscode://file/<cwd>?copilotCliSession=<id>&windowId=_blank`
  in a new window; VS Code only imports sessions it created or discovered while
  running, so older CLI sessions open the folder with an import error. Claude
  Code and Codex links open the folder only. Snapshot warnings collapse into a
  bottom-left "알림 N건" toggle; API errors stay at the top.

Compatibility and consumer actions:

- Reinstall to pick up the guard, templates and skills. Runs already in progress
  stay contract 1 with their pinned snapshot; they still list, resolve, check and
  restore (checked against a 0.2.0 run).
- Behavior change: `az` and `gh` writes that were neutral in 0.2.0 (for example
  `az group delete`, `gh api -X DELETE`, `gh repo edit`) are now denied; the human
  operator runs them. `gh pr create --draft` stays neutral.
- Rollback: reinstall `0.2.0`. Its CLI dispatches contract-2 runs to their pinned
  snapshot and keeps working, but its dashboard validates in process and reports
  agent-accepted reviews as `residual finding acceptance requires a human record
  and follow-ups`.

## [0.2.0]

Merged to `main` at `e0173b1`; not tagged.

- Add a maintainer-only workflow for improving the harness repository.
- Validate SemVer consistency across package metadata.
- Hooks find Node through `hooks/node-runtime.sh` (`AI_NATIVE_SDLC_NODE`, `PATH`,
  `NVM_BIN`, Homebrew and `~/.nvm` locations) so GUI-launched hosts without a
  login-shell `PATH` still run them; a missing Node fails with a clear message.
- The guard detects remote publication by parsing commands, so text such as
  `git log --grep push` or `git stash push` is no longer denied; opaque
  wrappers stay denied.
- Per-role `models`/`reasoningEfforts` in `ai-native-sdlc.config.json`; copy
  installs bind them into `.github/agents` profiles. New review policies default
  `requireDifferentModel` to true (reviewer model must differ from the author
  model; same family allowed). Existing policies keep their recorded values.
- Each review is capped at 2 rounds; round 2 is a delta review of the fix, and
  blockers left after it return `NEEDS_HUMAN` instead of a third round.
- Every run starts in its own Git worktree on `sdlc/<ID>/integration` at
  `<repo>/.worktrees/sdlc/<ID>/integration`; slices use `.../t<N>`. Starts are
  serialized by a repository lock and refused unless `/.worktrees/` is ignored.
  `workspaces.mjs list` lists runs across all worktrees. The snapshot cache stays
  in the primary checkout and is shared by every run worktree.
  Run starts, `workspaces.mjs list` and resumes (`harness.mjs resolve`,
  `state.mjs`, `workspaces.mjs`) canonicalize paths with the native realpath, so
  a directory given through a Windows 8.3 short name (`RUNNER~1`) or different
  letter case resolves to the run worktree and its pinned snapshot; a worktree
  that cannot be created also leaves no branch behind on Node 22.
- Copy and shared installers append `/.worktrees/` to `.gitignore` when no
  equivalent rule exists, preserving content, CRLF and mode; failures restore it.
- The guard reads an untracked `ai-native-sdlc.config.json` from the primary
  checkout when running in a linked worktree.
- Add `npm run dashboard`, a read-only local web dashboard that groups GitHub
  Copilot CLI, Claude Code and Codex sessions by Git workspace, links them to
  runs from harness tool activity, and shows SDLC gates, reviews, unit/API/E2E
  verification and highlighted approval waits and questions in a session grid
  with a detail drawer. The page auto-refreshes every 60 seconds by default,
  with 10s/30s/1 min/5 min/manual choices and a refresh-now button. It runs on macOS, Linux and Windows (PowerShell); a
  `dashboard-windows` CI job runs its tests on Windows.
  Only the next human gate still pending counts as an approval wait; each
  check shows its newest run's outcome and compound shell commands (`;`, `||`,
  `|`, `&`) leave it unknown, as do failed `&&` chains (including setup steps);
  reviews are grouped by stage and show passed only
  once state validation checked them; late tool results stay with their run;
  API errors and snapshot warnings stay visible without opening a session, and
  the drawer shows session warnings. Manual link saves are serialized by a lock
  beside the config file.

Compatibility and consumer actions:

- Reinstall (copy or shared) to pick up the hooks, agent model binding and the
  `.gitignore` rule; commit `/.worktrees/` before the first run.
- Pinned runs keep their snapshot and still list, resolve and restore. A run
  started in place under `0.1.0` is refused by `workspaces.mjs start|reconcile`
  with the exact `git worktree add` command for its dedicated worktree.
- Rollback: reinstall `0.1.0`; remove `.worktrees/` only after integrating or
  preserving its run branches.
- The dashboard runs from the harness source checkout. It only reads session
  stores and run evidence and changes no run state, hook or installer behavior.
  Copy installs carry `scripts/dashboard*` with the rest of `scripts/` but not
  the `dashboard/` UI assets. To reset manual session links, delete the
  per-user `ai-native-harness/dashboard.json` config file.

## Current manifest baseline

The package and three plugin manifests currently declare `0.3.0`. This records
the release candidate baseline; it does not assert that a release was published.
