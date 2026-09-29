# Implementation task and Jira publication contract

An implementation task is defined locally before G2 and approved at G2; a Jira
ticket is a remote issue (the originating parent or a child published from an
approved task for Jira strict/legacy runs).
Existing `tickets`, `ticketPlan`, `tickets.json`, `tickets/<id>.md`, and
`sdlc-tickets` names are stable persistence and tool interfaces, not a
requirement to create a Jira ticket for every task.

## Sequence and ownership

Jira light: plan + canonical outcome → human G2 → implement on the parent → G3/G4 → release.
Jira strict/legacy: plan + detailed outcomes → independent plan review + human G2 →
child publication → implementation → G3/G4 → release. Local intake in either
profile uses its local ID and skips publication after G2. Publication is agent-owned,
not an extra human gate. Children share the parent's approval/release lifecycle.
The conductor owns state, preparation and publication; specialists return drafts.

## Canonical definitions and policy

Write one draft using the [definition template](../../../templates/ticket-plan.json).
It contains changeKind, risks, tickets and (for non-behavior work) verificationReason.
Each implementation task requires stable positive id, title, goal, nonempty scope/nonGoals,
blockedBy IDs and acceptanceCriteria. Each AC has a locally unique id, parent
requirement reference, observable text and checks. Supported kinds: junit, jest,
playwright-bdd, go, chart, manual, static. Select applicable checks; manual cannot
replace required automated behavior tests. Details hold contract/UX/fixture
references, not duplicate ACs. Do not recycle retired IDs.

The graph must have unique IDs, known dependencies and no cycles. Independent
outcomes need no artificial edge. Prefer independently verifiable vertical work,
not DB/API/UI-only feature fragments. Exact edit paths/commands belong in the
current execution handoff, not long-lived tracker text.

The conductor runs:

```bash
node "$PLUGIN_ROOT/scripts/tickets.mjs" prepare STATE CONFIG DRAFT
```

Requires valid G1, plan phase and unapproved G2. The tool resolves config/risk
policy and creates immutable content-addressed plans/<revision>/tickets.json.
Strict additionally generates tickets/<id>.md views under that revision, with
hashes embedded in the manifest. Light has one independent outcome and no required
child document. The canonical manifest contains format: canonical-v1, parent,
policy and tickets. State receives the same policy, ticketPlan reference and pending
slices, atomically after validation. No human approval or Jira call occurs.

The manifest is the source of truth; generated Markdown must exactly match the
renderer, not merely have a matching hash. Never manually synchronize two copies
of ACs. Edit the draft and prepare a new revision; old artifacts remain for audit.
Generation rejects unsafe/symlinked output paths and conflicting immutable files.

G2 evidence includes the exact `ticketPlan` reference and current design/contract
artifacts. Approval binds the policy and graph transitively. Config changes cannot
weaken an approved snapshot. Existing schema-2 manifests without policy retain
strict/manual-document semantics; they are not silently migrated. For a new
policy, invalidate G2, prepare and reapprove; never reinterpret old approvals.

New low-risk bounded work may select light through workflow.boundedProfile. Risky,
architectural or multiple-outcome work uses strict. Missing workflow settings
retain strict. Non-behavior modes need verificationReason and meaningful evidence;
behavior changes still need RED/GREEN. See the [protocol](../../sdlc/references/protocol.md)
for review eligibility and evidence schema.
Both new profiles recommend different-family review and default
`requireDifferentFamily` to false. Explicit true remains mandatory; old approved
snapshots and policy-less legacy requirements are unchanged. A same-model
independent session does not waive review axes, evidence or human approval.

## Publication intents and receipts

This section applies to Jira strict/legacy work only. Jira light uses the parent
key and may retain historical stale records. Local work must not create any Jira
publication receipts, outbox, or remote writes.

`publications` holds one durable record per implementation task ID. Never recycle
an ID for a different outcome or discard old records when a task is removed.
A Jira publication record uses:

```json
{
  "id": 1,
  "parent": "ABC-123",
  "marker": "sdlc:ABC-123:ticket:1",
  "status": "confirmed",
  "key": "ABC-124",
  "planSha256": "<approved manifest hash>",
  "blockedBy": [],
  "evidence": {"path": "evidence/ticket-1-readback.json", "sha256": "<actual hash>"}
}
```

The example key/hash is illustrative, not evidence. Keys must be real read-back
identifiers, unique across records and different from the parent. `blockedBy`
contains Jira keys, while the manifest graph uses local IDs. Confirmation
requires correct parent linkage, the current approved manifest, matching native
blocking links (or the explicit verified fallback below), and readback evidence.

Before any create/update request, persist `pending` intent with marker, local ID,
parent, manifest hash and payload in `jira-outbox.md`. Set `unknown` before sending
a request that could have an effect, so a crash is not mistaken for unsent work.
Store any returned key immediately even if relationship creation fails. The
record becomes `confirmed` only after remote content/relationships are read back.
Outbox replay must revalidate G2 and current hashes.

Include the marker in a discoverable field or description on the initial create.
On resumption search that exact marker, then inspect candidate issues and the
parent relationship. Zero confirmed matches after an ambiguous timeout is NOT
proof creation failed: account for visibility/indexing and require reconciliation
or operator confirmation before retry. Multiple matches require human resolution.
Do not invent Jira idempotency support or tool names.

Discover create permissions, required custom fields, issue type, parent hierarchy
and link IDs from the configured project. Prefer native parent/subtask and
blocking links. If hierarchy disallows children, get an explicit configured
parent-link mapping. If blocking links are unavailable, require human agreement
to a read-back `Blocked by` key list; never silently omit the relationship.

Publish in dependency order so blocker keys are known. Blockers need to be
published, not implemented, to create dependent issues. An incomplete/unknown
record keeps the run in `publish`. Do not edit/close the parent or transition
children to Jira Done merely because publication or implementation completed.

## Execution frontier and revisions

After local or Jira light G2, or after all Jira strict child tickets are confirmed, `next` becomes
`implement`. Run:

```bash
node "$PLUGIN_ROOT/scripts/state.mjs" ready "docs/sdlc/ABC-123/state.json"
```

This checks state and emits JSON such as `[{"id":1,"key":"ABC-124"}]` (Jira light:
parent key `ABC-123`; local: local ID in `key` for CLI compatibility), only for
pending implementation tasks whose blockers have evidenced `done` slices and, for workspace
assignments, commits integrated into the current source. It does not dispatch.
An empty array means no pending ready task; inspect running assignments or,
if all slices are done, perform integrated G3 checks. It does not mean success.

Use the [workspace protocol](../../sdlc/references/protocol.md#source-workspaces)
to plan/start assignments and pass the recorded branch/path, approved document,
AC IDs, key, manifest hash and prerequisite evidence. Resolve allowlists and
commands from current code. Reconcile in-progress work instead of redispatching.
The conductor audits semantic dependencies before parallel assignments.

`done` requires attempts, change-appropriate verification, policy-required reviews
and a source revision integrated onto the main candidate even before G3. Behavior
needs RED/GREEN; refactor needs before/GREEN; docs/config need meaningful GREEN/static
checks. Final G3 validates the whole candidate. Jira status alone cannot satisfy a blocker.

G3 invalidation preserves local IDs, approved manifest and publication receipts.
By default all slices reset; with --slices and hashed --impact evidence, only the
selected slices and transitive dependents reset. Explain why retained slices are
unaffected; uncertain/shared impact needs a full reset. Global G3+ gates always
reset and integrated checks rerun. Reset done slices with RED receive a
`revalidation: {red, subjectHead}` record preserving historical RED provenance.
All old slice records are archived under the invalidation history's `previous`.
This record alone cannot restore done or unlock a dependent.

For unchanged behavior/tests, the assigned author (strict: test-writer) checks historical RED against the
unchanged approved task, previous source and current tests, and records the
reuse rationale. Use that historical RED reference (never relabel it as freshly
executed), run fresh GREEN on current code and obtain policy-required fresh reviews.
Changed tests, added behavior or a regression fix require a new relevant failing
test before that implementation. Missing valid historical RED blocks reuse;
do not make an already-correct test fail artificially. Task scope changes still
invalidate G2. All execution completion evidence must be rebuilt before a
dependent can run; historical RED is only one input.
Write fresh results to new evidence paths; do not overwrite the retained RED log.

G0/G1/G2 invalidation clears slices, archives the old manifest reference in
`history[].previous.ticketPlan`, sets active `ticketPlan: null`, and marks receipts
`stale`, retaining keys/markers/evidence. Clearing the active reference allows
repairing already-stale/missing documents without passing an old hash check;
it grants no approval. Rebuild and hash the draft set before new G2. Re-approve changed
drafts, update/reconcile the same issues after G2, then refresh receipts for the
new manifest. Retired Jira tickets remain stale; do not recreate or close them
automatically. Removed or merged work requires a human disposition.

## Reference and limits

The [upstream ticket decomposition reference](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md)
informs independently verifiable outcomes, dependency edges and separate tasks.
This package adds Jira reconciliation, approval hashes, BDD/TDD evidence and its
existing runtime gates; it does not import upstream tracker setup or permissions.
The JSON ledger is auditable evidence, not authenticated remote truth: the
conductor must actually read back Jira results. No live Jira adapter credentials
or automatic cloud delegation are bundled.
