# Autonomous execution, code quality contract, maximal E2E and environment facts

## Intent

The maintainer's goal is a harness that finds facts itself and asks the human
only to confirm prefilled proposals. Discovery should ask enough up front; plan
and implementation should then run on recommendations, record each decision and
report the log, stopping only for critical matters. Verification should prove
quality with enforced lint/format/type checks and the strongest practical
Playwright E2E evidence. The primary BFF stack is Go.

Observed gaps on `e0173b1` (probes kept in the session workspace):

| Probe | Output |
|---|---|
| G2 approval by `actor:'agent'` | `G2: human approval record required` (kept by design) |
| `uiChange:true`, AC checks `["manual"]` | `taskDefinitionErrors=[] state check exit=0 OK ABC-123: publish` |
| G3/G4 passed, no lint/format/vet evidence | `exit=0 OK ABC-123: release` |
| `gofmt -l` on an unformatted file | lists the file, `exit=0` (not a check) |
| `golangci-lint fmt --diff` (2.7.2) | unformatted `exit=1`, formatted `exit=0` |
| guard: `az group delete -n rg-app --yes`, `gh api -X DELETE …`, `gh repo edit --visibility public` | neutral `{}` |

Prose-only authorization rules (`protocol.md:133,183,196,285`,
`sdlc-implement/SKILL.md:65`) make agents ask for each commit or integration.
Residual review findings after round 2 require a human record
(`state.mjs` acceptance check). No decision log exists after discovery.

## Scope

- **W1 Code quality contract.** Port the fork's `967f560` module-scoped
  lint/format-check/typecheck contract with Go-first defaults and automatic
  formatting of changed paths during implementation. Not in hooks.
- **W2 Maximal E2E.** A G1-selected verification level (default maximal);
  UI-change runs require Playwright AC checks; affected-flow plus smoke
  regression; verifier exploratory E2E through a browser tool; discovery
  proposes `uiChange` from impacted UI modules; generic Playwright for non-Grafana
  web UIs.
- **W3 Autonomous plan/implement.** Discovery front-loads execution preferences;
  a standing grant recorded at G1 authorizes local commits and integration;
  plan/implement decision log; critical-only escalation; agent acceptance of
  non-critical residual findings with follow-ups. G2 stays a human gate.
- **W4 Environment facts.** Look up before asking (read-only `gh`, `az`,
  `kubectl`, `helm`, `git`, repository files), setup detection with one
  confirmation form, and guard denial of `az`/`gh` mutations.
- Release 0.3.0 with CHANGELOG, compatibility and Korean/English docs.

## Non-goals

- No automatic or delegated G1, G2 or G5b approval. "Autopilot is not approval"
  remains a core invariant.
- No push, merge, PR publication or production action by agents; grants cannot
  include them.
- No lint/format execution in tool-use hooks.
- No new gate. No migration or backfill of existing runs.
- No different-family requirement change (kept from 0.2.0).
- No fork `release.ci` reuse or financial-domain assurance.

## Run contract marker

New-run behavior is gated by one lock field so old runs keep their pinned
workflow even when current code (for example the dashboard) imports
`validateState`.

- `pinRun(state, runRoot, repositoryRoot, source, {runContract})` writes
  `runContract: 2` into `harness.lock.json` for runs created by local intake
  and Jira start in this release. Absent means contract 1.
- `readRunLock` accepts only absent or `2`. Revision upgrade preserves an existing
  marker and never adds one.
- `tasks.mjs prepare` passes the marker to `createPolicy`; contract 2 adds
  `policy.quality`, `policy.verification` and `policy.autonomy` (below).
- Every new rule is keyed on `runContract === 2`, never on field presence.
  Contract-2 runs require each policy part once a policy, task plan or passed G2
  exists. Contract-1 runs reject contract-2-only data (`policy.quality`,
  `policy.verification`, `policy.autonomy`, `slice.quality`, `gate.quality`,
  `G1.approval.preferences`, the `playwright` check, agent acceptance).

The fork names its marker `qualityVersion: 1`; one general marker avoids three
independent flags here.

## W1. Code quality contract

New files `scripts/quality.mjs`, `scripts/quality-run.mjs` and
`skills/sdlc/references/code-quality.md`, adapted from the fork.

**Policy.** For contract-2 runs, the task draft has `quality.modules[]`:
`{id, path, tasks:[ids], checks:{lint, format-check, typecheck}}`. Each check is
`{command: <config commands ID>}` or `{reason: <non-applicability>}`. Missing
tools, failing checks and debt are not non-applicability. `createQualityPolicy`
resolves command IDs into exact `{cwd, argv, purpose}`; every task must be
covered; unknown commands/tasks are rejected. G2 approval covers applicability;
later config edits do not alter execution.

**Runner.** `quality-run.mjs run STATE [--task ID]` requires approved G2 and a
contract-2 policy. The source checkout comes from the recorded assignment:
`--task` with `workspace.mode === 'branch'` and the integration scope (no
`--task`) use the run worktree on `sdlc/<ID>/integration`; `mode === 'worktree'`
uses the slice's registered task worktree on `sdlc/<ID>/t<id>`. The source must
be clean except `docs/sdlc/` (the same rule as `workspaces.mjs cleanSource`);
reports and logs go to `quality/<uuid>/` in the run directory, which lies under
that excluded path, so repeated runs never dirty the source. It executes literal
argv without a shell, no stdin, five-minute timeout per command, stops at the
first failure and returns `{passed, evidence, subjectHead, scope}`. It never
changes state; a changed source HEAD, branch, non-excluded file or state file
during execution fails the result.

**State.** Done slices bind `slice.quality`; G3 and G4 bind `gate.quality`
that also appears in `gate.evidence`. Reports must match the policy digest,
scope, `subjectHead`, every required module/check and successful exits.
All-N/A scopes need no report.

**Go-first defaults (setup proposals, not mandates).**

| Stack | lint | format-check | typecheck |
|---|---|---|---|
| Go BFF | `golangci-lint run ./...` (existing config) or `go vet ./...` | `golangci-lint fmt --diff` | `go build ./...` |
| TypeScript/React/Grafana plugin | ESLint | `prettier --check` | `tsc --noEmit` / project typecheck |
| Spring (supported) | existing Checkstyle/Spotbugs/build analyzers | `spotlessCheck` or existing formatter check | compile via existing build |

`gofmt -l` is not a check because it exits 0; use `golangci-lint fmt --diff` or
an approved wrapper that fails on output.

**Auto-format.** During implementation the author runs the configured fix
command (for example `golangci-lint fmt <paths>`, `prettier --write <files>`)
only on approved changed paths, sequentially, before committing; the check-only
runner then records evidence. Hooks remain guard-only.

## W2. Maximal E2E

**Verification level.** Contract-2 `policy.verification.e2e` is one of:

- `full` (default): Playwright AC checks for UI behavior, affected-flow E2E,
  existing E2E smoke regression, consumer-flow E2E for BFF/API changes, and
  exploratory browser E2E when a browser tool is available;
- `regression`: Playwright AC checks plus smoke regression, no exploratory run;
- `none`: no E2E (backend-only or non-UI work).

Discovery presents the level and the proposed `uiChange` in the G1 form,
prefilled with the recommendation. The human's answers are recorded in
`G1.approval.preferences` (see W3), not in the task draft. `prepare` copies
`{e2e, reason?}` from there into `policy.verification`; the draft cannot set it.

**Script rules (contract 2).**

- `checks` gains `playwright` for generic (non-BDD or non-Grafana) Playwright.
- Once G1 passed, `state.uiChange` must equal `preferences.uiChange` and
  `policy.verification` must equal the approved `{e2e, reason?}`. Changing either
  requires G1 re-approval.
- `uiChange: true` with `e2e: 'none'` requires a nonempty human `reason`.
- If `uiChange` is true and `e2e` is not `none`, at least one AC must include
  `playwright-bdd` or `playwright`.

**Prose rules.**

- `sdlc-plan`: test matrix maps each UI AC to Playwright; lists smoke suite and
  BFF/API consumer flows.
- `sdlc-verify` and `sdlc-verifier`: the verifier runs affected E2E, smoke
  regression and consumer-flow E2E with the repository's Playwright runner
  through its shell tool for `full`/`regression`.
- Exploratory browser E2E (`full` only) is conductor-owned, because subagent
  profiles expose no MCP or browser tools (`docs/compatibility.md`). The
  conductor starts the app locally and drives AC scenarios through Playwright
  MCP or the host browser. Screenshots, console errors and failed requests go
  under `e2e/` in the run directory, labelled exploratory, and are handed to
  the verifier for audit. Exploratory evidence supplements and never replaces
  regression tests. A missing browser tool is a recorded limitation, not a pass.
- `sdlc-discover`: propose `uiChange: true` when impacted modules include
  configured UI modules or frontend paths, and record the basis.
- Grafana plugins keep the `@grafana/plugin-e2e` fixture; other web UIs use the
  repository's existing Playwright configuration.

## W3. Autonomous plan and implementation

**Front-loaded discovery.** The G1 form always includes an execution-preference
block, prefilled: standing grant, `uiChange`, verification level (+ reason) and
residual-finding policy. Requirement questions keep the existing "classify
before asking" rules. Contract-2 G1 approval records the answers in
`G1.approval.preferences: {grants, uiChange, e2e, reason?, residualFindings}`;
the script validates the shape, and `prepare` derives `policy.verification` and
`policy.autonomy` from it.

**Standing grant.** `preferences.grants` is an array from `plan-commit`,
`slice-commit`, `local-integration`. The script rejects unknown values. Push,
merge, PR publication and production are not grantable. With a grant, agents
perform those local Git actions without asking and record them in history;
without one, current prose (ask each time) applies.

Grant lifetime:
- The grant lives in the G1 approval. A G0 or G1 invalidation resets G1 to
  `pending` and removes it, so new scope always needs a fresh form.
- G2 and later invalidations keep the G1 scope and therefore the grant.
- Revocation is a `grants-revoked` history event; the conductor asks again
  from then on.

Local Git remains neutral to the guard. The record makes authorization
auditable; it does not script-enforce each commit.

**Decision log.** Plan and implementation questions that are not critical are
resolved with the recommendation and recorded in the run's `decisions.md`:

| ID | Phase | Question | Choice | Alternatives | Basis | Reversal | At |

IDs continue the discovery `D-n` sequence. The G2 presentation lists plan
decisions; `03-impl-log.md` and `04-verify-report.md` reference implementation
decisions; the completion report lists all.

**Critical-only escalation.** Stop and ask (NEEDS_HUMAN) for: authority or
policy exceptions; auth/tenant changes; destructive data or schema changes;
public contract breaks; security issues with an exploit path; AC or scope change
(return to G1/G2); secrets or credentials; production or remote publication;
anything the user marked "ask me".

**Residual findings.** Contract-2 `policy.autonomy.residualFindings` is
`follow-up` (default) or `human`, taken from the G1 preferences.

Critical classification belongs to the independent reviewer, not the
conductor. The reviewer marks each blocking finding `critical: true|false`
against a fixed list. These are always critical:
- an unmet AC;
- a security defect with an exploit path;
- data loss;
- a broken build, test or required quality check;
- anything on the escalation list above.

In practice only internal contract, standard or ADR violations can be
non-critical blockers. The conductor copies the reviewer's verbatim output into
the hashed review evidence and records `round` (1 or 2) and `critical` (that
output's count, 0..blocking).

Agent acceptance, `acceptance:{actor:'agent', decision:'D-n', followUps:[…]}`,
is valid only when all of these hold:
- contract 2;
- policy `follow-up`;
- `round === 2`;
- `critical === 0`;
- `blocking ≥ 1`;
- a `D-n` decision whose row exists in the run's `decisions.md`;
- nonempty follow-ups.

Otherwise the run is NEEDS_HUMAN as today; human acceptance stays valid. Like
all review records, the script checks shape and hashes, not provenance truth
(protocol "Schema validation" note). Every agent acceptance is listed in the
completion report for after-the-fact review.

**G2.** Human gate; the presentation adds the decision log, the quality and
verification policy and the proceed agreement.

**G2 proceed agreement.** Every contract-2 `02-plan.md` has a `Proceed
agreement` section with three parts: what continues without asking inside the
approved sub tasks and ACs; stop conditions, which are the fixed critical list
plus plan-specific conditions (for example a real external connection instead of
synthetic data or a new write permission); and the actions that keep separate
approvals (push, merge, PR publication, production). The agreement cannot
remove or weaken the critical list or extend G1 grants. Contract-2 G2 evidence
must bind the hashed `02-plan.md` (`G2: 02-plan.md must be bound in approval
evidence`), so editing the agreement fails the hash check and needs a renewed
G2. The section content is not format-checked; the binding only proves which
text the human approved. Inside the agreement, a finished step or the next ready
sub task is a progress report, not a question. A stop condition applies only
when the approved work cannot be completed without crossing it; an optional
suggestion to cross it is logged with a follow-up. On a stop condition only the
affected work pauses with what changed, the decision, the options and the
recommendation, and the answer becomes a `D-n` row. Contract-1 runs keep the
earlier G2 evidence rules.

## W4. Environment facts

- `principles.md` and `discovery-review.md`: before asking for a value, look it
  up read-only (repository files, `git`, `gh` read commands, `az … show/list`,
  `kubectl get`, `helm get values`); ask only to confirm prefilled proposals and
  show the source of each value.
- `sdlc-setup`: detect repository/remote, Jira or GitHub scope, models, module
  paths, quality and E2E commands, CI jobs and deployment targets once; present
  one confirmation form.
- `sdlc-plan`, `sdlc-implement`, release skills: read CI runs/logs and deployed
  state before asking.
- `hooks/guard.mjs`: observation allowlists; every other `az`/`gh` command is
  denied as "requires the human operator".
  - `az`: `version`, `account show|list`, and `<group…> show|list|query`, plus
    `aks get-versions|get-upgrades`. Credential-bearing groups are denied even
    for show/list: `keys`, `credential(s)`, `secret`, `connection-string`,
    `appsettings`, `sas`. So are `az rest`, `login`, `aks get-credentials`,
    `acr login` and `account get-access-token`.
  - `gh`:
    - `pr view|list|diff|checks|status|checkout|comment`;
    - `issue view|list|status|comment` (comments approved by the maintainer);
    - `run view|list|watch|download`;
    - `workflow view|list`;
    - `release view|list|download`;
    - `repo view|list`, `label list`, `search …`, `status`, `auth status`;
    - `api` only with GET and no `-f/-F/--field/--raw-field/--input` (so no
      `graphql`).
    - The existing exception stays: `gh pr create` with `--draft`/`-d` is
      neutral and governed by the release-engineer rule (already-published,
      explicitly selected branch).
    - Denied: `gh pr create` without draft, `pr ready|edit|review|close`,
      other issue writes, `repo sync`, secrets, workflows, releases and `auth`
      changes.
  - Parsing:
    - Strip leading `VAR=…`, `env`, `command`, `time`, `nohup` and `sudo`.
    - Classify `bash|sh|zsh -c STRING` recursively.
    - Accept attached and `=` flags (`--method=DELETE`, `-XDELETE`).
    - `eval`, `xargs`, `$`, backticks or `<(` in a command naming `az`/`gh`
      fail closed.
  - A command whose every segment is an observation command (including the
    existing kubectl/helm/argocd reads) skips the production-text check, so
    `az group show -n production -o json` stays neutral.

## Compatibility

- Existing runs have no `runContract`; their pinned scripts and current-code
  validation behave as before. Old-release fixture: list, resolve, `state check`,
  `workspaces plan`, restore.
- Contract-2 additions are additive fields; schemaVersion stays 2.
- Guard changes apply to all sessions in configured projects: every `az`/`gh`
  command outside the observation allowlists (W4) becomes denied, including
  previously neutral ones such as `gh pr create` without `--draft`. This is a
  behavior change for consumers and is documented in CHANGELOG/compatibility.
- Rollback: reinstall 0.2.0. Contract-2 runs keep executing their pinned 0.3.0
  snapshot through `dispatchPinned`, so the CLI `state check` stays
  authoritative. 0.2.0's `readRunLock` and `policyErrors` ignore the unknown
  marker and policy fields. However, its in-process `validateState`, used for
  example by the dashboard (`scripts/dashboard/runs.mjs:104`), rejects the
  `playwright` check (`workflow.mjs:70`) and agent acceptance
  (`state.mjs:198-203`). The dashboard then shows such runs as invalid.
  Recommendation: finish contract-2 runs on 0.3.0. The release check runs the
  `e0173b1` scripts from a temporary worktree against a contract-2 fixture to
  confirm this exact behavior.

## Verification

- TDD per workstream (`tests/quality.test.mjs`, `workflow`, `tasks`, `state`,
  `hooks`, `local-intake`, `harness-revision`).
- `npm test`, `npm run validate`, `git diff --check`.
- Old-release fixture check as above.
- Host discovery and browser-tool behavior are reported as unverified unless
  exercised.
