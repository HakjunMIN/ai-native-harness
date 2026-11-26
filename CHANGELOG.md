# Changelog

## [Unreleased]

Targets `0.2.0`.

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
  Run starts and `workspaces.mjs list` canonicalize paths with the native
  realpath, so a directory given through a Windows 8.3 short name (`RUNNER~1`)
  or different letter case resolves to the run worktree; a worktree that cannot
  be created also leaves no branch behind on Node 22.
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

The package and three plugin manifests currently declare `0.2.0`. This records
the release candidate baseline; it does not assert that a release was published.
