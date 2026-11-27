# Autonomous Execution, Quality Contract and Maximal E2E Implementation Plan

**Goal:** Implement W1–W4 from the design and ship them as `0.3.0`.

**Architecture:** Order: run-contract marker → W1 quality → W2 E2E → W3
autonomy → W4 environment facts/guard → docs and release. Each script change is
test-first in the existing test files plus a new `tests/quality.test.mjs`.

**Tech stack:** Node.js 22+, `node:test`, Git worktrees. No new dependencies.

**Spec:** [Design](../specs/2026-11-27-autonomous-execution-quality-e2e-design.md)

## Global constraints

- Work only in `.worktrees/autonomy-quality-e2e` on
  `feature/autonomy-quality-e2e`. The primary checkout belongs to another
  session; do not touch it.
- No commit, push or merge without explicit authorization; squash merge.
- Contract-1 (markerless) runs must behave exactly as before.
- G1/G2/G5b human approval checks stay unchanged.

## Tasks

Each workstream introduces its contract-2 policy part together with the rule
that requires it, so every task ends GREEN on its own.

### 1. Run contract marker

- **RED** (`local-intake`, `harness-revision`, `state` tests):
  - new local and Jira runs write `runContract: 2`;
  - `readRunLock` rejects values other than absent or `2`;
  - revision upgrade preserves an existing marker and never adds one;
  - a markerless lock still validates.
- **GREEN:** `harness.mjs` (`pinRun` option, `readRunLock`, upgrade carry),
  `intake.mjs`, `startJira`, and a `runContract(state, root)` helper used by
  later tasks.

### 2. Quality contract (W1)

- **RED** in `tests/quality.test.mjs`, porting the fork's cases:
  - Policy errors: missing module, missing kind, unknown command or task,
    reason vs command.
  - Report errors: stale head, policy digest, missing check, failed exit.
  - Runner basics: requires G2; literal argv; timeout; stops on failure; writes
    report and logs; no state change.
  - Runner source selection: `--task` in branch mode uses the run worktree;
    `--task` in worktree mode uses the task worktree; the integration scope
    uses the run worktree.
  - Runner cleanliness: dirty source fails, but changes under `docs/sdlc/` are
    ignored; a repeat run succeeds with existing artifacts.
- **RED** in the `state` tests:
  - A contract-2 policy without `quality` fails.
  - A contract-2 done slice without `slice.quality` fails.
  - G3/G4 without a bound `gate.quality` fail.
  - All-N/A passes without a report.
  - A contract-1 run carrying `policy.quality` fails.
- **GREEN:** `scripts/quality.mjs`, `scripts/quality-run.mjs`, `workflow.mjs`
  `createPolicy`/`policyErrors`, `state.mjs` slice and G3/G4 checks,
  `validate.mjs` asset paths, `templates/sub-task-plan.json` `quality` block.
- **Docs:**
  - `skills/sdlc/references/code-quality.md`: Go-first table,
    `golangci-lint fmt --diff`, auto-format of changed paths, no hooks.
  - Skills: `sdlc-setup`, `sdlc-plan`, `sdlc-implement`, `sdlc-verify`,
    `go-backend`, `react-ts`.
  - `sub-task-contract.md` and the implementer and verifier agents.

### 3. G1 preferences and maximal E2E (W2)

- **RED** in the `state`, `workflow` and `tasks` tests:
  - `G1.approval.preferences` shape: grants, `uiChange`, `e2e`, `reason`,
    `residualFindings`.
  - `prepare` derives `policy.verification` from the preferences and ignores
    draft values.
  - A `state.uiChange` or `policy.verification` mismatch with the passed-G1
    preferences fails.
  - `uiChange:true` with `e2e:'none'` fails without a reason.
  - `uiChange:true` with `full`/`regression` fails `prepare` without a
    Playwright AC.
  - The `playwright` check is accepted in contract 2 and rejected in
    contract 1.
  - The default level is `full`.
  - Contract-1 runs with preferences fail.
- **GREEN:** `state.mjs` G1 preference validation, `workflow.mjs` checks and
  `verification` policy, `tasks.mjs` preference-derived policy.
- **Docs:**
  - Skills: `sdlc-discover` (G1 execution-preference block with the `uiChange`
    proposal), `sdlc-plan` (test matrix), `sdlc-verify` and
    `verification-gate`.
  - `sdlc-verifier`: shell Playwright runner plus audit of conductor
    exploratory evidence.
  - `protocol.md`: conductor-owned exploratory E2E under `e2e/`.
  - Also update `sdlc-test-writer`, `tdd`, `bdd-gherkin` (Grafana fixture vs
    generic Playwright) and `discovery-review.md`.

### 4. Autonomous plan/implement (W3)

- **RED** in the `state` tests:
  - Grants accept only `plan-commit`, `slice-commit` and
    `local-integration`; `push`, `merge` and `production` are rejected.
  - A G1 invalidation removes the grants; a G2 invalidation keeps them.
  - `grants-revoked` history shape.
  - Agent acceptance passes with all of: contract 2, policy `follow-up`,
    `round:2`, `critical:0`, `blocking≥1`, a `D-n` decision and follow-ups.
  - Agent acceptance fails for each of: `round:1`, `critical>0`, policy
    `human`, a missing decision or one with no `decisions.md` row, missing
    follow-ups, contract 1.
  - Human acceptance still passes.
  - A contract-2 policy without `autonomy` fails.
- **GREEN:** `state.mjs` grants, acceptance and review `round`/`critical`
  rules, `workflow.mjs` `autonomy` policy, `tasks.mjs` preference-derived
  autonomy.
- **Docs:**
  - `protocol.md`:
    - autonomous execution section;
    - grants satisfy the authorization wording at 133/183/196/285;
    - escalation list and decision log;
    - review `round`/`critical`.
  - `code-review`: the reviewer classifies `critical` per blocking finding.
  - `sdlc-discover`, `discovery-review.md`: preference block.
  - `sdlc-plan`: G2 shows the decision log.
  - `sdlc-implement`: grants, decision log, residual findings.
  - `templates/decisions.md` and the completion report section.

### 5. Environment facts and guard (W4)

- **RED** in `tests/hooks.test.mjs`:
  - **Deny (az):**
    - `az group delete -n rg --yes`
    - `az role assignment create …`
    - `az deployment group create …`
    - `az aks get-credentials -g rg -n c`
    - `az keyvault secret show …`
    - `az storage account keys list …`
    - `az webapp config appsettings list …`
    - `az rest --url …`
  - **Deny (gh):**
    - `gh api -X DELETE repos/o/r`, `gh api --method=PATCH …`
    - `gh api repos/o/r -f name=x`, `gh api graphql -f query=…`
    - `gh pr create` (no draft), `gh pr ready 1`, `gh pr review 1 --approve`
    - `gh issue create …`, `gh issue close 1`
    - `gh repo sync`, `gh repo edit --visibility public`
    - `gh secret set X`, `gh workflow run ci`, `gh release create v1`
  - **Deny (wrappers and parsing):**
    - `bash -c "az group delete -n rg"`
    - `env A=1 gh repo delete o/r`
    - `sudo az …`
    - `az $(echo group) delete`, `eval "gh repo delete"`
  - **Neutral:**
    - `az account show`, `az group list -o table`, `az aks show -g rg -n c`
    - `az graph query -q …`, `az group show -n production -o json`
    - `gh pr view 1`, `gh run view 2 --log`, `gh api repos/o/r`
    - `gh pr create --draft …`, `gh pr checkout 3`
    - `gh pr comment 1 -b x`, `gh issue comment 2 -b y`
    - `kubectl get pods -n production`
- **GREEN:** `hooks/guard.mjs` observation classifier for `az`/`gh`, wrapper
  stripping, recursive `-c` handling, fail-closed expansions, observation
  exemption from the production-text check.
- **Docs:** `principles.md`, `discovery-review.md`, `sdlc-setup` (single
  confirmation form), `sdlc-plan`, `sdlc-implement`, release skills, and the
  guard summary at `protocol.md:283`.

### 6. Docs and release

- **Version and docs:**
  - Version 0.3.0 in `package.json`, the three plugin manifests and
    `validate.mjs`.
  - `CHANGELOG.md`.
  - `docs/compatibility.md`: contract marker, guard behavior change, rollback
    limitation, unverified host and browser behavior.
  - `docs/operations.md`.
  - Korean and English README.
  - No new skill, so the skill-count markers stay unchanged.
- **Old-release fixture:** list, resolve, `state check`, `workspaces plan`,
  restore.
- **Rollback probe:** run the `e0173b1` scripts from a temporary worktree
  against a contract-2 fixture. Confirm that the CLI dispatches to the pinned
  scripts and that in-process `validateState` reports the documented errors.
- **Final checks:** `npm test`, `npm run validate`, `git diff --check`.

### 7. G2 proceed agreement

- **RED** in the `run-contract` tests: a contract-2 run with a passed G2 and
  no `02-plan.md` evidence fails with `G2: 02-plan.md must be bound in approval
  evidence`; binding passes; editing the bound plan fails the hash check;
  contract 1 has no requirement.
- **RED** in the `package` guidance test: protocol `Proceed agreement`
  paragraph, "progress report, not a question", the critical list cannot be
  weakened, stop conditions apply only when the approved work cannot be
  completed without crossing them, the sdlc-plan table row and G2 evidence, and
  the phase skills and handoff template.
- **GREEN:** the `state.mjs` contract-2 check; protocol, `sdlc`, `sdlc-plan`,
  `sdlc-implement`, `sdlc-verify`, `discovery-review.md`, `handoff.md` and
  `decisions.md`.
- **Fixtures:** the contract-2 G2 fixtures in `quality` and `local-intake` bind
  `02-plan.md` through the shared `planEvidence` helper.
- **Pressure scenarios:** PA01–PA04 in `tests/scenarios/pressure.md`, baseline
  on the earlier 0.3.0 guidance and applied on the new guidance.
- **Docs:** Korean and English README, `docs/operations.md`, `CHANGELOG.md`,
  the W3 spec paragraph and the `ABC-123` example plan.
