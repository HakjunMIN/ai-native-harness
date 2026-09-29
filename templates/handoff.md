# Handoff: <from> -> <to>

Run: <Jira key or local ID> | Intake: <Jira snapshot or hashed local request> | Phase: <phase> | Slice: <id or N/A>
Policy: <approved snapshot/profile, verification mode and review flags; legacy strict if absent>
Implementation reference: <local ID, Jira parent key for light, or Jira child key for strict>
Ticket definition: <manifest path/hash and optional generated document path/hash>
Acceptance criteria: <local AC IDs -> parent requirement references>
Goal: <one observable result>
Base: <commit> | Head: <commit>
Source workspace: <integration branch; assigned branch, absolute worktree path or current checkout, base/slice HEAD, merge status>
Conductor state: <absolute state.json path in the integration checkout; worker worktree copy is not authoritative>
Author model/family: <observed runtime identity>
Review: <axis/coverage, confirmed model/family/session or permitted human reference>
Impact: <affected slices/dependents, retained-evidence rationale and impact hash, if revalidating>

## Inputs

| Artifact path | SHA256 | Purpose |
|---|---|---|
| <ticket-relative or repo-relative path, explicitly labelled> | <hash> | <purpose> |

## Constraints

- Allowed edits: <exact paths/globs; empty for reviewers>
- Workspace isolation: <one checkout branch or distinct worktree; conductor alone writes shared docs/sdlc state>
- Forbidden: cloud/nested delegation, prod mutation, weakening expectations; strict implementers cannot edit frozen tests.
- Dependencies: <completed outcome IDs, Jira keys only if applicable, contracts and evidence>
- Required skills: <qualified plugin skill names>
- Done when: <measurable result and required commands>

## Return

Status: DONE | BLOCKED | NEEDS_HUMAN
Actual model/family: <observed, never inferred from role name>
Changed: <paths>
Evidence: <commands, cwd, exit codes, subject SHA, redacted output file hashes>
Findings: <severity, path/line, expected vs actual, disposition>
Open questions: <unresolved items or none>
Next action: <responsible role and exact blocking condition>
