---
description: "Phase ownership, gates and evidence contracts for SDLC runs"
---

# Workflow protocol

This is the phase-owner contract, not a prerequisite for standalone technical
skills. Follow [shared principles](principles.md). Resolve `PLUGIN_ROOT` from the
ticket's locked snapshot and `REPO_ROOT` from the selected repository. Only initial
run selection/creation uses the installed plugin. Never edit the
installed plugin while implementing a sub task. Invoke exact plugin skills, not
unrelated same-name skills. Loading a reference does not execute its procedure.

Follow [project governance](project-governance.md) across phases. Project standards
and cross-feature ADRs live outside individual runs; feature plans reference the
applicable baseline. On resume, assess shared-document drift before dependent
work. State validation alone does not check that drift or grant project-policy
approval. Preserve existing artifact paths and the run-local evidence boundary.

## State and routing

Use `docs/sdlc/<ID>/`. Jira IDs match `^[A-Z][A-Z0-9_]*-[1-9][0-9]*$`;
local IDs match `^local-[a-z0-9]+(-[a-z0-9]+)*$`. Reject unsafe IDs. For a
Jira-originated run, use `harness.mjs start KEY [REPO_ROOT]` only if no state exists;
it creates pending state and a ticket lock without Jira evidence or approval. For a
new natural-language request without Jira, use
[discovery review](discovery-review.md) to investigate first and batch only `now`
decisions; carry disclosed `g1` recommendations into discovery without inventing
confirmed answers. Preserve
the original request and confirmed answers in sanitized Markdown,
then pass it on stdin to `node "$PLUGIN_ROOT/scripts/intake.mjs" start-text
local-<slug> [REPO_ROOT]`. Do not create a temporary request file. The optional
prewritten automation path remains `start local-<slug> REQUEST_FILE [REPO_ROOT]`.
Both create one immutable `intake.md` and pending `state.json` without approval,
Jira access, publication, or source edits. Bare `sdlc` lists existing runs; an
existing local ID resumes instead of interviewing. If the ID is taken, choose
another; changed original requests require a new ID. In v1 artifactRoot
remains `docs/sdlc`.
Before entering a phase, resolve `STATE` with the installed `scripts/harness.mjs`
and use the returned snapshot as `PLUGIN_ROOT` for all skills, references, role
profiles, templates and scripts. See [ticket revisions](harness-revisions.md).
Verify the lock on every resume and before dispatch; sub tasks inherit the
conductor's lock, not a lock from a worker's stale state copy. Then run:

```bash
node "$PLUGIN_ROOT/scripts/state.mjs" check "docs/sdlc/ABC-123/state.json"
node "$PLUGIN_ROOT/scripts/state.mjs" next "docs/sdlc/ABC-123/state.json"
```

Require the requested phase to match `next`. After a gate update, run `next`, set
`phase` to the result and rerun `check`. `next` tolerates an outdated valid phase
name, not invalid evidence or prerequisites; it does not write state. `check` and
`ready` remain strict. Earlier-phase edits require invalidation, not forced entry.
There is no automatic human approval command.

| Gate | Owner | Evidence and scope |
|---|---|---|
| G0 | discover | Jira snapshot or hashed local user request, AC, module map |
| G1 | human | hashed discovery summary and requirements, relevant UI/BE/FE decisions, individual high-impact confirmations |
| G2 | human | plan, policy snapshot, canonical sub task manifest, applicable contracts/test matrix; strict plan review |
| G3 | implement | completed slices, change-appropriate verification and independent reviews; integrated checks |
| G4 | verify | applicable fresh checks, integrated spec/standards/security coverage, UX evidence when relevant |
| G5a | release | exact-SHA required CI, immutable digest, dev/staging health and promotion evidence |
| G5b | human | production approval/merge reference, observed digest, Synced/Healthy and smoke evidence |

A missing required capability blocks its dependent work, not unrelated authorized
work. Mark genuinely inapplicable checks N/A with a reason inside the report;
never use N/A for human gates or unavailable required checks.

## Risk-based policy

The canonical manifest and state contain the same policy, bound by G2 evidence.
See [sub task contract](../../sdlc-subtasks/references/sub-task-contract.md) for drafting,
generation and publication. Config changes do not alter an approved snapshot.

- **Light:** newly configured bounded, low-risk work with one independent outcome.
  Jira uses its parent key; local uses its local ID. No child publication; G2 →
  implement directly.
  One author may write tests and implementation; one independent combined review
  covers spec and standards. G2 still requires human approval, not a model review.
- **Strict:** architectural/high-risk or decomposed work. Detailed generated sub task views,
  Jira child-ticket publication (not for local work), separate test-writer/implementer
  assignments, spec/standards
  axes and independent plan/final reviews remain required.
- **Legacy:** records without `policy` retain their existing strict semantics.
  Never add a light policy to approved work to bypass missing evidence.

Record auth/tenant boundaries, public compatibility, destructive/schema/data
changes and deployment/security effects as risks; size alone does not establish
low risk. Unknown material risk prevents light selection. `boundedProfile` defaults
to strict when absent; multiple outcomes automatically select strict. For both profiles,
`review.requireDifferentFamily`, `review.requireDifferentModel` and
`review.allowHumanReview` control review eligibility. New policies default
`requireDifferentModel` to true: a model review needs a reviewer model ID different
from the author model ID (same family allowed). `requireDifferentFamily` defaults
to false: different-family review is recommended, not a gate. With false, the same
family in a verified independent session is eligible; record that choice and any
routing limitation. Policies without `requireDifferentModel` keep their approved rule.
Explicit `requireDifferentFamily: true` requires different-family model review and disallows human substitution.
Human review otherwise requires `allowHumanReview: true`; omission defaults to false.
Legacy records without policy retain different-family requirements. Never weaken
an approved snapshot from new defaults or a config edit. If policy or scope changes,
invalidate G2 (G1 for requirements), regenerate and reapprove.

## Run contract and E2E level

Runs started by this release carry `runContract: 2` in `harness.lock.json`; locks
without it are contract 1 and keep their workflow. Contract 2 adds
`G1.approval.preferences` ([discovery review](discovery-review.md#execution-preferences)),
the `policy.quality` contract ([code quality](code-quality.md)) and
`policy.verification`. Contract-1 runs reject these fields and the `playwright` check.

`tasks.mjs prepare` copies `policy.verification: {e2e, reason?}` from the G1
preferences; the draft cannot set it. Levels:

| `e2e` | Required E2E |
|---|---|
| `full` (default) | Playwright AC checks for UI behavior, affected-flow E2E, existing smoke regression, consumer-flow E2E for BFF/API changes, and conductor exploratory browser E2E when a browser tool is available |
| `regression` | Playwright AC checks and smoke regression; no exploratory run |
| `none` | No E2E; backend-only or non-UI work |

`state.uiChange` and `policy.verification` must equal the approved preferences;
changing them needs G1 re-approval. `uiChange: true` with `none` needs a human
reason; with `full` or `regression` at least one AC must use `playwright-bdd`
(Grafana Gherkin through `@grafana/plugin-e2e`) or `playwright` (other web UIs,
the repository's own Playwright config).

Subagent profiles have no MCP or browser tools, so the verifier runs the
repository's Playwright runner through its shell. Exploratory browser E2E is
conductor-owned: start the app locally, drive the AC scenarios through
Playwright MCP or the host browser and save screenshots, console errors and
failed requests under `e2e/` in the run directory, labelled exploratory, for the
verifier to audit. It supplements regression tests and never replaces them; a
missing browser tool is a recorded limitation, not a pass.

## Evidence and review records

Write actual sanitized evidence, then hash with `state.mjs hash FILE`. References
are `{path, sha256}`, relative to the run directory, with actual SHA256; no
parent traversal or external symlinks. Gates have `status` and nonempty `evidence`.
G1/G2/G5b also require `approval: {actor: "human", reference, at}` from an observed,
artifact-scoped decision. Silence, selection clicks and autopilot are not approval.
For this revision's locked runs, G1 must bind `01-discovery.md` with the
[discovery review format](discovery-review.md). The read-only
`state.mjs discovery STATE [--text]` command checks and presents its summary.
G1 validation checks summary coverage/status/IDs and rejects open decisions.
An unchanged ordinary `recommended` choice is accepted by scoped G1 approval
without rewriting the document. High-impact recommendations additionally require
`approval.decisions: [{id, reference}]` for observed designated-owner confirmations.
Each record accepts the exact bound recommendation, not an alternative or a
general permission. Changed choices require updated evidence and final approval.
The checker cannot authenticate the person or prove prose/diagram equivalence.
Older locked revisions retain their own contracts; legacy unpinned gates remain
unchanged until explicit adoption.
G2 evidence includes the exact `taskPlan` reference; contract-2 G2 evidence also
binds the hashed `02-plan.md` that holds the [proceed agreement](#autonomous-execution).
A local run always keeps
its copied or interview-recorded request at `state.intake.request`; G0 evidence
must include that exact reference. Changing its contents invalidates the state;
do not edit intake in place. Discovery produces the AC/module mapping before G0
passes; the intake interview itself does not constitute G1 approval. A local ID
is not a Jira key: do not create
issues, enqueue writes, or label work remotely without a separate authorized run.

G3/G4/G5a/G5b use the verified source `subjectHead`. Obtain the user's required
commit authorization (or an active standing grant) before recording committed source evidence; do not commit
merely because a workflow needs a SHA. Record uncommitted/executable changes as
unverified until the candidate is established. Never relabel old CI with a new SHA.
Keep source SHA, built image digest and GitOps promotion revisions distinct.
G5b additionally requires `deployment: {digest, sync: "Synced", health: "Healthy"}`.
Environment details and smoke evidence live in the release report; JSON shape
validation cannot prove that a running deployment matches the intended artifact.

New-policy review records include `axis`, `blocking` (0 unless accepted), hashed `evidence` and:

- Model: `reviewerType: "model"`, actual `authorModel`, `authorFamily`,
  `reviewerModel`, `reviewerFamily`, distinct `authorSession`/`reviewerSession`.
  With `requireDifferentModel`, the reviewer model ID must differ from the author's.
  Different aliases in one family do not satisfy an explicit or legacy different-family
  requirement. Optional family diversity does not waive identity or session evidence.
- Human, only when allowed: `reviewerType: "human"`,
  `human: {actor: "human", reference, at}` recording the actual review, not merely
  G2 approval. Do not fabricate model provenance for a human reviewer.
- Code reviews: `subjectHead` matching the slice/final revision. Combined reviews
  include `coverage: ["spec", "standards"]`; G4 requires security coverage too.
  G4 may reuse light combined evidence only for identical revision, covered scope
  and current findings. A particular host security agent is optional; actual
  security inspection is not. Missing necessary expertise remains a blocker.

A finding is `blocking` only for a violated approved AC/contract, a security defect
with an exploit path, a broken build/test or data loss; everything else is
`should-fix`/`nit` and becomes a follow-up. Each review subject (G2 plan, each slice,
G4 final) gets at most 2 rounds. Round 2 is a delta review of the fix diff and its
blast radius only; an implementation-only fix needs fresh GREEN, not a new RED.
If blockers remain after round 2, return `NEEDS_HUMAN` with three options: accept
with follow-ups, fix once more, or descope. An accepted residual finding keeps its
`blocking` count and adds `acceptance: {actor: "human", reference, at, followUps}`
with nonempty follow-ups; acceptance is a human risk decision, not a human review,
so it does not need `allowHumanReview`. Contract-2 records also carry `round`
(1 or 2) and `critical` (0..`blocking`) from the reviewer's verbatim output, and may
use agent acceptance (see [autonomous execution](#autonomous-execution)).

Strict axes are `plan` at G2, `spec` and `standards` per slice, `final` at G4.
Light uses `combined` per slice and at G4. Split author scopes must be unique and
all pass. Review completion is not gate approval. Schema validation checks shape
and hashes, not the truth of provenance, independence, logs or human identity.

Completed slices have positive `id`, `status: "done"`, `attempts`, `subjectHead`,
`green` and reviews. `behavior` requires observed expected-assertion `red` plus
fresh GREEN; infrastructure errors are not RED. `refactor` requires passing
`before` baseline and fresh GREEN. `documentation`/`config` use meaningful static,
render, schema or relevant test evidence without fabricated RED. Non-behavior
policies require `verificationReason`; behavior changes cannot be disguised as
refactoring/configuration. G3/G4 always verify the final integrated candidate.

## Autonomous execution

Contract-2 runs ask every predictable question at G1 (see
[execution preferences](discovery-review.md#execution-preferences)) and then run
plan and implementation on recommendations. G2 and G5b stay human gates; G2 also
approves how far the run proceeds without asking.

**Standing grants.** `G1.approval.preferences.grants` may hold `plan-commit`
(commit the approved plan), `slice-commit` (commit reviewed slice work) and
`local-integration` (merge reviewed slices into `sdlc/<ID>/integration`). A grant
satisfies the "user authorization" required for that local action in this
protocol; record each action in history. Without it, ask each time. Push, merge
to shared branches, PR publication and production are never grantable. A G0 or
G1 invalidation resets G1 and drops the grants; G2 and later invalidations keep
them. When the user revokes, append
`{at, event: "grants-revoked", grants, reference}` to history; a grant named by a
revocation later than the G1 approval is no longer active. The guard treats local
Git as neutral; the record makes authorization auditable, not enforced.

**Decision log.** Resolve non-critical plan, implementation and verification
questions with the recommendation and append a row to the run's `decisions.md`
([template](../../../templates/decisions.md)), continuing the discovery `D-n`
sequence. The G2 presentation lists plan decisions, `03-impl-log.md` and
`04-verify-report.md` reference implementation decisions, and the release report
lists all decisions and agent acceptances.

**Proceed agreement.** Every contract-2 `02-plan.md` has a `Proceed agreement`
section, shown at G2 and bound by G2's hash of that file:

- *Continue:* inside the approved sub tasks and ACs, implement, test, fix review
  findings within the 2-round cap, format and run quality checks, look up facts
  read-only, verify at the approved E2E level and take local Git actions that
  active grants cover.
- *Stop:* the critical list below, plus plan-specific conditions the planner
  recommends or the human adds at G2, such as a real external connection instead
  of synthetic data, a new write permission or a new external dependency. The
  agreement cannot remove or weaken the critical list or extend grants.
- *Separate approvals:* push, merge to shared branches, PR publication and
  production (G5b) keep their own human approvals.

Inside the agreement, a finished step, a passing check or the next ready sub task
is a progress report, not a question: report it and continue; never ask whether
to continue. A stop condition applies only when the approved work cannot be
completed without crossing it; an optional suggestion to cross it keeps the
approved path and becomes a `D-n` row with a follow-up. On a stop condition,
pause only the affected work, keep unrelated authorized work going and return
`NEEDS_HUMAN` with what changed, the decision needed, the options and the
recommendation. Log the answer as a `D-n` row; an answer that changes scope,
ACs, contracts or policy follows [invalidation](#invalidation-and-resumption)
and renewed approval. Editing the agreement changes `02-plan.md` and needs a
renewed G2. A light plan keeps the defaults and adds a stop condition only for
an effect the plan actually touches.

**Critical-only escalation.** Stop with `NEEDS_HUMAN` for: authority or policy
exceptions; auth/tenant changes; destructive data or schema changes; public
contract breaks; security issues with an exploit path; AC or scope changes
(return to G1/G2); secrets or credentials; production or remote publication;
the stop conditions of the G2 proceed agreement, including anything the user
marked "ask me".

**Residual findings.** `policy.autonomy.residualFindings` comes from the G1
preferences: `follow-up` (default) or `human`. The independent reviewer, not the
conductor, marks each blocking finding critical or not. Always critical: an unmet
AC, a security defect with an exploit path, data loss, a broken build, test or
required quality check, and anything on the escalation list. In practice only
internal contract, standard or ADR violations can be non-critical. The record
copies the reviewer's counts into `round` and `critical`. Agent acceptance
`acceptance: {actor: "agent", decision: "D-n", followUps}` is valid only with
`follow-up` policy, `round: 2`, `critical: 0`, `blocking >= 1`, nonempty follow-ups
and a `D-n` row in `decisions.md`. Otherwise return `NEEDS_HUMAN`; human acceptance
stays valid. The checker verifies shape and the logged row, not provenance.

## Source workspaces

After G2, commit the approved plan with the required user authorization (or the
`plan-commit` grant) before forking source work. The conductor runs `workspaces.mjs plan STATE [SCOPES.json]`,
then `start` with the same arguments, both in the run worktree (see
[run worktrees](#run-worktrees)). One ready, nonconcurrent slice uses only
`sdlc/<ID>/integration` in the run worktree. Concurrent independent slices
use separate `sdlc/<ID>/t<N>` branches and sibling Git worktrees at
`<repo>/.worktrees/sdlc/<ID>/t<N>`; exact repo-relative
edit scopes must be disjoint and exclude shared `docs/sdlc/` state. Path separation
alone does not prove contract/behavior independence; defer coupled work.

`start` records `in_progress` assignments and never commits, merges or dispatches.
Workers edit only their workspace and allowlist; only the conductor writes shared
state and evidence. Reconcile recorded branches/worktrees on resume. Integrate
reviewed slice commits on the integration branch with explicit user authorization
(or the `local-integration` grant) before unblocking dependents; workers do not merge.
G3 checks each completed slice SHA is an ancestor of the final integrated SHA;
rerun combined checks/reviews after merges or conflict fixes. See
[operations](../../../docs/operations.md) for commands and cleanup.

## Run worktrees

Every run owns one Git worktree. `harness.mjs start` and `intake.mjs start|start-text`
create branch `sdlc/<ID>/integration` at `<repo>/.worktrees/sdlc/<ID>/integration`
inside the primary checkout, forked from the invoking checkout's committed HEAD,
and print only the state path inside that worktree. The primary checkout's files
and branch stay untouched; only the snapshot cache `.ai-native-sdlc-revisions/`
is kept there and shared by every run.

* Git must ignore `/.worktrees/` in the primary checkout. Installers append the
  rule to `.gitignore`; commit it before the first run. Starts refuse otherwise.
* Run `resolve`, `state.mjs`, `tasks.mjs`, `workspaces.mjs` and every phase in the
  run worktree (`cd` or `git -C`), and give workers that path. Call installed
  harness scripts by absolute path, because an uncommitted install is absent there.
* Start from the primary checkout or a branch that belongs to no run. Starting
  inside a worktree already on the run's integration branch adopts it.
* An ID that already has a run is refused with the worktree to resume in.
  `workspaces.mjs list [REPO_ROOT]` lists every run across all worktrees.
* Uncommitted changes in the invoking checkout are not copied; commit what the
  run needs first. If the host cannot use the worktree, report `NEEDS_HUMAN`
  rather than working in the primary checkout.
* A run started in place before this layout keeps its state and stays
  resolvable. `workspaces.mjs start|reconcile` refuse it with the exact
  `git worktree add` (or `switch`) command for its dedicated worktree; commit
  the run's state first so the new worktree carries it.

## Invalidation and resumption

```bash
node "$PLUGIN_ROOT/scripts/state.mjs" invalidate STATE G2 "contract changed"
node "$PLUGIN_ROOT/scripts/state.mjs" invalidate STATE G3 "code fix" --slices 1,2 --impact evidence/impact.md
```

Use G1 for requirements/UX, G2 for plan/policy/contracts, G3 for code, G4 for fresh
integrated verification, G5a for changed promotion artifacts. Invalidation clears
the named gate and downstream gates. G0–G2 archive active plan/slices in history,
clear the manifest and mark publications stale; reconcile existing keys later.
To reuse an existing integration branch after G0–G2 invalidation (including a
harness upgrade), renew required approvals/publication and commit the approved
plan. Stop old workers, audit and preserve their work, then clean up archived
worktrees and sub task branches. Run `workspaces.mjs reconcile STATE` before
`plan`/`start`; it records reuse without merging, deleting work or granting approval.
It requires recorded ownership and ancestry, pending unassigned slices and clean
source. A changed HEAD or a later plan invalidation requires fresh reconciliation.
G3 preserves approved sub task identity and any Jira publication. By default it resets all
slices; with known slice IDs, complete graph and hashed impact analysis it resets
only selected slices and transitive dependents. Explain changed paths, dependencies
and why retained slices remain valid. Shared/uncertain impact requires full reset.
Retained evidence does not skip fresh integrated G3/G4 checks.

Historical RED in `revalidation` may be reused only after verifying unchanged
behavior, tests and provenance; require fresh GREEN/reviews. New regression tests
need new RED. Never manufacture failure or overwrite historical evidence. After
three failed attempts perform bounded diagnosis; unresolved work is NEEDS_HUMAN.

For spikes, G1 approval of findings permits `outcome: "spike-complete"`,
`phase: "done"`; downstream gates stay pending. Jira uses a research-only resolution;
local work records only the local outcome.
Implementation requires a newly classified run, not an implied release approval.

## Dispatch and external effects

Use the [handoff template](../../../templates/handoff.md). Specialists receive the
policy and relevant contracts, not the entire workflow. Prefer available local
roles; no cloud/nested delegation. Parallel work requires disjoint edit scope.
The conductor alone writes shared state and audits returned diffs against assigned
paths. Do not revert unrelated work. Runtime model mappings must be verified, not
inferred from profile names. Missing routing blocks only reviews that require it.
Dispatch each role with project config `models.<role>`, falling back to
`models.default`, and `reasoningEfforts` the same way; roles without a mapping use
the host default. Copy installs also bind these into project `.github/agents` profiles.
If a mapped model cannot be routed, report `BLOCKED`; never substitute silently.
Record the model the host actually reports, not the requested ID. Prefer a reviewer
model different from the author's even when not required.

Only Jira-originated runs use `jira-sync`: durable intent, stable markers, readback
and honest pending/unknown status. Offline outbox is not remote success. Jira Done
requires G5b except approved research-only spikes. Jira light syncs the parent;
Jira strict publishes children. Local runs have no Jira outbox or remote status.
G5b and production authority remain human-controlled even for local runs.

v1 hooks conservatively deny `git push`, `gh pr merge` and direct deployment mutation.
`az` and `gh` are limited to read-only observation: `az version`, `account show|list`,
`<group> show|list|query` and `aks get-versions|get-upgrades`, excluding credential
words (`key(s)`, `credential(s)`, `secret(s)`, `password(s)`, `token(s)` alone or
after `-`, `connection-string(s)`, `appsettings`, `sas`, and `iot … policy`), `rest`,
`login`, `aks get-credentials`, `acr login`, `account get-access-token`, and leaf
commands that take positional arguments (such as `acr build|run`, `config set`,
`storage copy`), so `az acr build list` is not read as a `list`; a path word that
is not a plain command name is denied. `gh pr|issue|run|workflow|release|repo|label`
reads, `search`, `status`, `auth status` without `--show-token` and `api` GET without
fields are observation;
any gh flag other than `-R`/`--repo` before the subcommand is denied because it
could hide the real subcommand. `gh pr|issue comment`, `pr checkout`,
`run|release download` and `pr create --draft` (a flag value such as
`--title --draft` does not count) are also neutral. Other `az`/`gh`
commands are denied as requiring the human operator. The guard strips `VAR=`, `env`,
`command`, `time`, `nohup`, `exec`, `nice`, `timeout`, `sudo` and shell keywords
(`if`, `then`, `do`, `{`, `!` …), parses shell options to classify
`bash|sh|zsh -c` recursively, denies `az`/`gh` fed to a shell or `source` through a
script or stdin, classifies a shell launched by another program (for example
`find -exec sh -c`), denies `az`/`gh` passed as an argument to another program (for
example `find -exec`, `docker run`, `stdbuf`) except non-launching `which`, `type`,
`echo`, `printf`, `grep` and `rg` without `--pre`, and fails closed when an `az`/`gh`
command uses `$`, backticks, `<(`, `eval` or `xargs`. Codex `apply_patch` text is
checked by its target paths, not parsed as a command; shell tools are always parsed. A command whose every segment is such an
observation (or a kubectl/helm/argocd read) skips the production-text check, so
`az group show -n production` stays neutral. Commands inside another program's
string (for example `python -c`) and in script files are not parsed and rely on host
permission prompts.
Local `git merge` is neutral to the hook, not pre-approved: only the conductor
integrates reviewed source slices with explicit user authorization (or the
`local-integration` grant) and repository protections. Workers, including the release role, must not merge.
Humans publish branches and merge GitOps promotions. Production proposals are
allowed, actual production desired-state edits are not. Hooks are not a sandbox:
external CI protections, human approvals and production RBAC remain necessary.
