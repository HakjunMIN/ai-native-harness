---
description: "Module-scoped lint, formatting and type-check setup and revision-bound evidence"
---

# Code quality checks

## Setup and ownership

Inspect manifests, lockfiles, existing scripts, lint/formatter/type-check
configurations, shared workspace settings and CI before proposing changes.
Reuse working project tools; never add a competing formatter or silently replace
an institutional rule. Split by language and package boundary, not by
frontend/backend labels alone.

For a module without tooling, propose these defaults; they are not mandates:

| Stack | lint | format-check | typecheck |
|---|---|---|---|
| Go BFF (primary) | `golangci-lint run ./...` with the existing config, else `go vet ./...` | `golangci-lint fmt --diff` | `go build ./...` |
| TypeScript / React / Grafana plugin | ESLint | `prettier --check` | `tsc --noEmit` or the project typecheck script |
| Spring Boot (supported) | Existing Checkstyle/SpotBugs/build analyzers | `spotlessCheck` or the existing formatter check | Compile through the existing build |

`gofmt -l` is not a check because it exits 0 when files need formatting. Use
`golangci-lint fmt --diff` (golangci-lint v2, nonzero on a diff) or an approved
wrapper that fails on output.

Show missing or overlapping coverage, paths, commands, exclusions and expected
changes before asking for scoped setup approval. Install local development
dependencies with the project's package manager and lockfile only after approval;
never install global tools. Never fabricate a successful execution to finish setup.

Commands live in the target repository's `ai-native-sdlc.config.json` `commands`
map as `{cwd, argv, purpose}`: `cwd` is repository-relative, `argv` is an
executable plus literal arguments, and `purpose` states the real coverage. Use the
same commands in CI. The installer does not install linters.

Check and fix commands are distinct. Check commands must not edit source
(`golangci-lint fmt --diff`, `prettier --check`, `spotlessCheck`). A build used as
a type check writes only ignored outputs. Review wrapper scripts too; the runner
cannot infer semantics from command names.

## Run contract and planning

Local intake and Jira `start` write `runContract: 2` into the hash-bound
`harness.lock.json`. Locks without the field are contract 1 and keep their
workflow through adoption, upgrade, resume and reinstall; an upgrade preserves an
existing marker and never adds one. Do not edit old locks or backfill policies.

For a contract-2 run, assess every task against at least one module before G2.
Each module has `id`, repository-relative `path`, the affected task IDs and all
three checks: `lint`, `format-check`, `typecheck`. Each check is either a
configured command ID or a nonempty `reason` for non-applicability. Missing tools,
failing checks and existing debt are not non-applicability.

Example config fragment:

```json
{
  "commands": {
    "bff-lint": {"cwd": "services/bff", "argv": ["golangci-lint", "run", "./..."], "purpose": "Lint all BFF packages with the committed config"},
    "bff-format-check": {"cwd": "services/bff", "argv": ["golangci-lint", "fmt", "--diff"], "purpose": "Fail on unformatted BFF source"},
    "bff-typecheck": {"cwd": "services/bff", "argv": ["go", "build", "./..."], "purpose": "Compile all BFF packages"}
  }
}
```

Example task draft fragment:

```json
{
  "quality": {
    "modules": [{
      "id": "bff",
      "path": "services/bff",
      "tasks": [1, 2],
      "checks": {
        "lint": {"command": "bff-lint"},
        "format-check": {"command": "bff-format-check"},
        "typecheck": {"command": "bff-typecheck"}
      }
    }]
  }
}
```

`tasks.mjs prepare` resolves IDs into the G2-bound `policy.quality` with the exact
cwd, argv and purpose, and rejects missing assessments, unknown commands and
unknown tasks. G2 approval covers applicability and coverage; there is no new
gate. Later config edits do not change execution; changing commands, coverage or
task mapping requires G2 invalidation and a fresh approved plan.

Lint and type checks cover affected modules and their consumers, not only edited
lines. A shared config or lockfile change can affect every consumer. For existing
debt, record the failures and an approved bounded exception in the project
standards or plan. Do not disable rules, swallow exit codes or call failure N/A.
Do not mass-reformat existing source during setup.

## Execution and evidence

During implementation the author runs the configured fix command (for example
`golangci-lint fmt <paths>` or `prettier --write <files>`) only on approved changed
paths, sequentially, before committing. Hooks stay guard-only: do not attach lint
or formatting to agent tool-use hooks. Commit the intended source before recording
quality results; a later source fix makes earlier results stale.

```bash
node "$PLUGIN_ROOT/scripts/quality-run.mjs" run STATE --task 1
node "$PLUGIN_ROOT/scripts/quality-run.mjs" run STATE
```

The runner requires approved G2 and a contract-2 quality policy. It picks the
source from the recorded assignment: `--task` on a branch-mode slice and the
integration scope (no `--task`) use the run worktree on `sdlc/<ID>/integration`;
a worktree-mode slice uses its registered task worktree on `sdlc/<ID>/t<N>`.
`--task` requires an in-progress slice. The source must be clean except
`docs/sdlc/`, the same rule as `workspaces.mjs`; reports and logs go to
`quality/<uuid>/` in the run directory under that path, so repeated runs never
dirty the source.

It runs literal argv without a shell, with no stdin and a five-minute timeout per
command, stops at the first failure and returns `{passed, evidence, subjectHead,
scope}` with a nonzero exit on failure. It never changes state or approves gates.
A changed HEAD, branch, file outside `docs/sdlc/` or state file during execution
fails the result; it does not undo user changes. Check tools are trusted project
code, not sandboxed.

The conductor binds a successful task report as `slice.quality` when marking the
slice done; its `subjectHead` must equal `slice.subjectHead`. For G3 and G4, bind
an integration report as `gate.quality` and include the same reference in
`gate.evidence`. A report must cover every applicable module/check with the exact
command, a successful exit, timestamps and a hash-bound log at `subjectHead`.
Missing, duplicate, failed, changed-policy or stale results block the pass. An
all-N/A scope needs no report; its reasons stay G2-bound. G3 and G4 may reuse the
same integration report only when policy, source and coverage are unchanged.

This evidence does not replace behavior tests, security checks or independent
review. Logs and JSON are audit evidence, not proof of execution or coverage;
reviewers verify command semantics and configured file inclusion. CI runs the
same check-only commands without a local SDLC run.
