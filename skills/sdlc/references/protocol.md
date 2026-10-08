---
description: "Phase ownership, gates and evidence contracts for SDLC runs"
---

# Workflow protocol

This is the phase-owner contract, not a prerequisite for standalone technical
skills. Follow [shared principles](principles.md). Resolve `PLUGIN_ROOT` from the
ticket's locked snapshot and `REPO_ROOT` from the selected repository. Only initial
run selection/creation uses the installed plugin. Never edit the
installed plugin while implementing a task. Invoke exact plugin skills, not
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
new natural-language request without Jira, interview for material unknowns,
preserve the original request and confirmed answers in sanitized Markdown,
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
Verify the lock on every resume and before dispatch; child tasks inherit the
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
| G1 | human | approved requirements, relevant UI/BE/FE decisions |
| G2 | human | plan, policy snapshot, canonical implementation task manifest, applicable contracts/test matrix; strict plan review |
| G3 | implement | completed slices, change-appropriate verification and independent reviews; integrated checks |
| G4 | verify | applicable fresh checks, integrated spec/standards/security coverage, UX evidence when relevant |
| G5a | release | exact-SHA required CI, immutable digest, dev/staging health and promotion evidence |
| G5b | human | production approval/merge reference, observed digest, Synced/Healthy and smoke evidence |

A missing required capability blocks its dependent work, not unrelated authorized
work. Mark genuinely inapplicable checks N/A with a reason inside the report;
never use N/A for human gates or unavailable required checks.

## Risk-based policy

The canonical manifest and state contain the same policy, bound by G2 evidence.
See [implementation task contract](../../sdlc-tasks/references/task-contract.md) for drafting,
generation and publication. Config changes do not alter an approved snapshot.

- **Light:** newly configured bounded, low-risk work with one independent outcome.
  Jira uses its parent key; local uses its local ID. No child publication; G2 →
  implement directly.
  One author may write tests and implementation; one independent combined review
  covers spec and standards. G2 still requires human approval, not a model review.
- **Strict:** architectural/high-risk or decomposed work. Detailed generated task views,
  Jira child-ticket publication (not for local work), separate test-writer/implementer
  assignments, spec/standards
  axes and independent plan/final reviews remain required.
- **Legacy:** records without `policy` retain their existing strict semantics.
  Never add a light policy to approved work to bypass missing evidence.

Record auth/tenant boundaries, public compatibility, destructive/schema/data
changes and deployment/security effects as risks; size alone does not establish
low risk. Unknown material risk prevents light selection. `boundedProfile` defaults
to strict when absent; multiple outcomes automatically select strict. For both profiles,
`review.requireDifferentFamily` and `review.allowHumanReview` control review
eligibility. New policies default `requireDifferentFamily` to false: different-family
review is recommended, not a gate. With false, the same model/family in a verified
independent session is eligible; record that choice and any routing limitation.
Explicit true requires different-family model review and disallows human substitution.
Human review otherwise requires `allowHumanReview: true`; omission defaults to false.
Legacy records without policy retain different-family requirements. Never weaken
an approved snapshot from new defaults or a config edit. If policy or scope changes,
invalidate G2 (G1 for requirements), regenerate and reapprove.

## Evidence and review records

Write actual sanitized evidence, then hash with `state.mjs hash FILE`. References
are `{path, sha256}`, relative to the run directory, with actual SHA256; no
parent traversal or external symlinks. Gates have `status` and nonempty `evidence`.
G1/G2/G5b also require `approval: {actor: "human", reference, at}` from an observed,
artifact-scoped decision. Silence, selection clicks and autopilot are not approval.
G2 evidence includes the exact `taskPlan` reference. A local run always keeps
its copied or interview-recorded request at `state.intake.request`; G0 evidence
must include that exact reference. Changing its contents invalidates the state;
do not edit intake in place. Discovery produces the AC/module mapping before G0
passes; the intake interview itself does not constitute G1 approval. A local ID
is not a Jira key: do not create
issues, enqueue writes, or label work remotely without a separate authorized run.

G3/G4/G5a/G5b use the verified source `subjectHead`. Obtain the user's required
commit authorization before recording committed source evidence; do not commit
merely because a workflow needs a SHA. Record uncommitted/executable changes as
unverified until the candidate is established. Never relabel old CI with a new SHA.
Keep source SHA, built image digest and GitOps promotion revisions distinct.
G5b additionally requires `deployment: {digest, sync: "Synced", health: "Healthy"}`.
Environment details and smoke evidence live in the release report; JSON shape
validation cannot prove that a running deployment matches the intended artifact.

New-policy review records include `axis`, `blocking: 0`, hashed `evidence` and:

- Model: `reviewerType: "model"`, actual `authorModel`, `authorFamily`,
  `reviewerModel`, `reviewerFamily`, distinct `authorSession`/`reviewerSession`.
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

## Source workspaces

After G2, commit the approved plan with the required user authorization before
forking source work. The conductor runs `workspaces.mjs plan STATE [SCOPES.json]`,
then `start` with the same arguments. One ready, nonconcurrent slice uses only
`sdlc/<ID>/integration` in the current checkout. Concurrent independent slices
use separate `sdlc/<ID>/t<N>` branches and Git worktrees; exact repo-relative
edit scopes must be disjoint and exclude shared `docs/sdlc/` state. Path separation
alone does not prove contract/behavior independence; defer coupled work.

`start` records `in_progress` assignments and never commits, merges or dispatches.
Workers edit only their workspace and allowlist; only the conductor writes shared
state and evidence. Reconcile recorded branches/worktrees on resume. Integrate
reviewed slice commits on the integration branch with explicit user authorization
before unblocking dependents; workers do not merge.
G3 checks each completed slice SHA is an ancestor of the final integrated SHA;
rerun combined checks/reviews after merges or conflict fixes. See
[operations](../../../docs/operations.md) for commands and cleanup.

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
worktrees and task branches. Run `workspaces.mjs reconcile STATE` before
`plan`/`start`; it records reuse without merging, deleting work or granting approval.
It requires recorded ownership and ancestry, pending unassigned slices and clean
source. A changed HEAD or a later plan invalidation requires fresh reconciliation.
G3 preserves approved task identity and any Jira publication. By default it resets all
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

Only Jira-originated runs use `jira-sync`: durable intent, stable markers, readback
and honest pending/unknown status. Offline outbox is not remote success. Jira Done
requires G5b except approved research-only spikes. Jira light syncs the parent;
Jira strict publishes children. Local runs have no Jira outbox or remote status.
G5b and production authority remain human-controlled even for local runs.

v1 hooks conservatively deny `git push`, `gh pr merge` and direct deployment mutation.
Local `git merge` is neutral to the hook, not pre-approved: only the conductor
integrates reviewed source slices with explicit user authorization and repository
protections. Workers, including the release role, must not merge.
Humans publish branches and merge GitOps promotions. Production proposals are
allowed, actual production desired-state edits are not. Hooks are not a sandbox:
external CI protections, human approvals and production RBAC remain necessary.
