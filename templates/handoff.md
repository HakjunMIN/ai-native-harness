---
description: "Scoped SDLC assignment inputs, constraints and evidence return format"
---

# Handoff: <from> -> <to>

Run: <Jira key or local ID> | Intake: <Jira snapshot or hashed local request> | Phase: <phase> | Slice: <id or N/A>
Policy: <approved snapshot/profile, verification mode and review flags; legacy strict if absent>
Implementation reference: <local ID, Jira parent key for light, or Jira child key for strict>
Implementation task definition: <manifest path/hash and optional generated document path/hash>
Acceptance criteria: <local AC IDs -> parent requirement references>
Goal: <one observable result>
Base: <commit> | Head: <commit>
Source workspace: <integration branch; assigned branch, absolute worktree path or current checkout, base/slice HEAD, merge status>
Conductor state: <absolute state.json path in the integration checkout; worker worktree copy is not authoritative>
Harness lock: <conductor-run harness.lock.json path and SHA256; inherited by every child task>
Harness revision: <content SHA256; source Git commit if known, not the application Head>
Harness root: <verified snapshot root from harness.mjs resolve; re-resolve on another machine/session>
Role profile: <exact file under the locked root's agents directory; do not substitute the installed profile>
Author model/family: <observed runtime identity>
Review: <axis/coverage, confirmed model/family/session or permitted human reference>
Impact: <affected slices/dependents, retained-evidence rationale and impact hash, if revalidating>

## Inputs

| Artifact path | SHA256 | Purpose |
|---|---|---|
| <run-relative or repo-relative path, explicitly labelled> | <hash> | <purpose> |

## Project baseline

Read `<PLUGIN_ROOT>/skills/sdlc/references/project-governance.md` from the installed
harness; resolve PLUGIN_ROOT when writing the run-local handoff.
Reference the plan's applicable standards and accepted project ADRs, including
document paths/sections, baseline commits or uncommitted content hashes, and
owners. Record none with a reason when no shared documents apply.

- Shared changes: <approved project ADR/standard changes and owner approval evidence, or none>
- Exceptions: <rule, scope, owner approval, expiry or exit condition, or none>
- Drift: <comparison evidence and impact since the baseline; unresolved differences>
- Follow-up: <migration obligations, expiring exceptions and responsible owners>

## Constraints

- Allowed edits: <exact paths/globs; empty for reviewers>
- Shared-document ownership: <single assigned owner and explicit allowed paths for standards/ADRs, or read-only>
- Workspace isolation: <one checkout branch or distinct worktree; conductor alone writes shared docs/sdlc state>
- Forbidden: cloud/nested delegation, prod mutation, weakening expectations; strict implementers cannot edit frozen tests.
- Dependencies: <completed outcome IDs, Jira keys only if applicable, contracts and evidence>
- Required skills: <exact skill paths under the locked harness root>
- Done when: <measurable result and required commands>

## Return

Status: DONE | BLOCKED | NEEDS_HUMAN
Actual model/family: <observed, never inferred from role name>
Changed: <paths>
Evidence: <commands, cwd, exit codes, subject SHA, redacted output file hashes>
Findings: <severity, path/line, expected vs actual, disposition>
Open questions: <unresolved items or none>
Next action: <responsible role and exact blocking condition>
