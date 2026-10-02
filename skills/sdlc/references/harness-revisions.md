# Ticket-scoped harness revisions

The installation is shared; the execution baseline belongs to one run at
`docs/sdlc/<ID>/`. Never pin a whole service repository or switch a shared link
when selecting a ticket. This contract applies to Jira and local runs alike.

## Identity and storage

Each new run has `harness.lock.json`, bound by `state.harness.path` and
`state.harness.sha256`. Commit the lock and state with the run's evidence using
the project's normal authorization. No repository-level version lock is created.

```json
{
  "schemaVersion": 1,
  "ticket": "ABC-123",
  "createdAt": "2026-10-02T00:00:00.000Z",
  "harness": {
    "commit": null,
    "contentSha256": "<64-character SHA256>"
  }
}
```

`contentSha256` is authoritative: it hashes a deterministic inventory of every
file's path and byte hash under `agents`, `hooks`, `scripts`, `skills`, and
`templates`, plus the runtime references `docs/compatibility.md` and
`docs/operations.md`. Other documentation and ticket histories are excluded.
The source Git `commit`, when available, is provenance/a restoration
hint, not a claim that the source checkout was clean. Local edits are captured in
the content identity too. A dirty/uncommitted revision may require a retained
snapshot to restore; a commit alone cannot recreate those edits. Do not release
dirty snapshots as reproducible Git versions. Asset line endings are pinned to
LF by the repository's Git attributes for cross-platform checkouts.

In each target service, preserve the bytes of committed locks and hashed evidence
across Windows/macOS/Linux checkouts as well. Add this rule to the service's
`.gitattributes` before committing new run artifacts (preserve existing rules):

```gitattributes
docs/sdlc/** text=auto eol=lf
```

The framework's `.gitattributes` does not configure a sibling service. Do not
blindly renormalize historical evidence or rewrite its hashes to hide a mismatch.

The runtime stores snapshots at `.ai-native-sdlc-revisions/<contentSha256>/`:

- Copy/direct installations: under the target service repository.
- Shared installations: beside the real shared harness checkout; linked services
  reuse the same snapshot for identical content.

Snapshots contain runtime assets, not service source or a copy of every ticket.
They are logically immutable and verified before use, not an OS sandbox or
write-protected storage. Keep the cache out of application commits (for example
with `.git/info/exclude`); do not delete versions referenced by active or archived
runs. No automatic garbage collection is performed. Do not store absolute cache
paths in the lock; a new machine resolves its own location.

## Start and resume

`INSTALLED_HARNESS_ROOT` is the current installation (usually `.ai-native-sdlc`).
It is the bootstrap resolver and remains distinct from ticket `PLUGIN_ROOT`.

```bash
node "$INSTALLED_HARNESS_ROOT/scripts/harness.mjs" start ABC-123
node "$INSTALLED_HARNESS_ROOT/scripts/harness.mjs" resolve docs/sdlc/ABC-123/state.json
```

Local `intake.mjs start` and `start-text` pin automatically; do not create a second
lock. Jira start creates pending state only, not a Jira snapshot or approval.
The selected installation is snapshotted as-is: starting a run does not pull or
fetch a newer version. Updates of the shared installation affect new runs only.

`resolve` returns JSON with the lock identity, authoritative state path, snapshot
`root`, `skills` and `agents`. Read the selected revision's conductor, protocol,
phase/technical skills, role profiles and templates. Use that root in handoffs.
When resolving again on another machine, ignore old absolute paths in handoffs.

For example, in PowerShell:

```powershell
$state = 'docs/sdlc/ABC-123/state.json'
$json = & node '.ai-native-sdlc/scripts/harness.mjs' resolve $state
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve locked harness' }
$harness = $json | ConvertFrom-Json
& node (Join-Path $harness.root 'scripts/state.mjs') check $state
if ($LASTEXITCODE -ne 0) { throw 'Ticket state check failed' }
```

The installed `state.mjs` (except content-only `hash`), `tasks.mjs` and
`workspaces.mjs` CLIs automatically dispatch locked runs to the selected snapshot.
Direct imports of their library helpers are not a dispatch interface; callers
must resolve the run before importing a revision-specific helper. Legacy unlocked
state remains inspectable with old commands for compatibility, but the conductor
must not resume it until explicit adoption.

Every child task and subagent uses the parent's lock and authoritative conductor
state path. A worker's application worktree or a published Jira child key does
not create a new workflow baseline. Native agent registration is a bootstrap:
read the locked role, not the current installed role's remaining instructions.
Loading the right Markdown is a host/agent procedure, not a security boundary.

## Missing or modified snapshots

A missing snapshot, malformed lock, hash mismatch or modified cached file blocks
execution. Never silently use the latest installation, overwrite a changed cache,
or repair the lock to match a different revision.

```bash
node "$INSTALLED_HARNESS_ROOT/scripts/harness.mjs" restore STATE --source /path/to/harness
```

Restore first tries exact source content. Otherwise, when the lock includes a
commit, it clones the supplied **local** Git source into a temporary checkout,
checks out that commit without changing the original source checkout, and verifies
the full content hash before publishing the snapshot. It does not fetch a remote
or execute the restored workflow during restore. Obtain a trusted source clone
with the required history separately. A copy installation can use such a local
source clone, or the exact old installed assets. For dirty snapshots, provide the
original content; never label today's assets as the historical revision.

Inspect and remove a corrupted cached snapshot only after establishing that no
run is using it and preserving forensic/local changes as needed; then restore.

## Explicit adoption and upgrades

```bash
node "$INSTALLED_HARNESS_ROOT/scripts/harness.mjs" adopt STATE --reason "Establish a baseline for this legacy run" --confirm
node "$INSTALLED_HARNESS_ROOT/scripts/harness.mjs" upgrade STATE --source /path/to/harness --reason "Reverify under the updated workflow" --confirm
```

Only run these commands with explicit operator authorization. `--confirm` records
intent to change the execution baseline, not human gate approval. `adopt` is for
an existing run without a lock; it never asserts which revision did the old work.
`upgrade` requires an intact old lock and changed new content. To roll back a run's
workflow, use the same explicit upgrade operation with the older snapshot as source.

Both operations archive the complete previous state and lock under
`harness-history/<hash>.json`, record the reason and old/new references in history,
and conservatively invalidate G0 and every downstream gate. Previous evidence files
remain; active task plans/slices are archived, publications become stale and policy
must be established again. There is no automatic approval carry-forward. The new
revision must support the current schema; other schema migrations remain explicit.
Finished runs are not rewritten. Create a new run for follow-up work.

Revision changes use a run-local `.harness-operation-lock`. Readers refuse to
proceed during the update. A normal write failure restores the old lock if state
replacement failed. After abrupt termination, inspect the state, lock and archived
history before manually removing a stale operation lock; never bypass a mismatch.

## Safety and scope

Do not re-register ticket-specific host hooks. The installed common safety hooks,
current project instructions and host permissions stay in force even when the
ticket uses an old workflow. SessionStart reports the pinned identity but does not
claim that current-version validation has certified an old state. Run the pinned
state checker before progressing. Hashes detect content changes; they do not prove
publisher identity, honest execution or human authorization. A source supplied for
execution/adoption must be trusted. No shell branch, push, merge or deployment
authority is granted by a lock.
