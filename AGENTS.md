# Repository Instructions

## Scope

These instructions apply to the entire `ai-native-harness` repository.

## Skill usage

- Use the skills shipped in this repository's `skills/` directory for work performed in this repository.
- Prefer the most specific matching local skill, and follow its instructions before taking action.
- Do not invoke unrelated global or external skills when a matching local skill exists.
- If no local skill matches the task, state that explicitly and use the smallest necessary fallback.
- Treat files under `skills/` as the source of truth for this repository's workflows.

## Repository boundaries

- Keep changes inside this repository unless the user explicitly requests otherwise.
- Do not modify sibling repositories or test copies while working here unless explicitly requested.
- Preserve the repository's existing scripts, hooks, tests, and conventions.

## Validation

- Use the repository's existing validation commands and tests.
- Keep test artifacts and temporary files out of the repository unless they are required by the test.
