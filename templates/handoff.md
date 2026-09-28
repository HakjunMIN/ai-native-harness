# Handoff: <from> -> <to>

Ticket: <KEY> | Phase: <phase> | Slice: <id or N/A>
Goal: <one observable result>
Base: <commit> | Head: <commit>
Author model/family: <observed runtime identity>
Requested reviewer model/family: <confirmed available identity or BLOCKED>

## Inputs

| Artifact path | SHA256 | Purpose |
|---|---|---|
| <ticket-relative or repo-relative path, explicitly labelled> | <hash> | <purpose> |

## Constraints

- Allowed edits: <exact paths/globs; empty for reviewers>
- Forbidden: cloud delegation, nested agents, prod mutation, changing test expectations as implementer.
- Dependencies: <completed slice IDs and contracts>
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
