# Harness Maintenance Meta-Skill Implementation Plan

**Goal:** Add a maintainer-only, risk-scaled skill for improving `ai-native-harness`, with identity-safe validation and SemVer/change-log support.

**Architecture:** Keep the maintainer skill in `.agents/skills/harness-dev/`, outside the customer runtime tree and ticket content hash, and point to it from `AGENTS.md`. Extend the existing Node validator and package tests to validate SemVer agreement across `package.json` and the three plugin manifests, while keeping the expected shipped-skill roster explicit. Add behavioral scenarios and verify host discovery separately from static validity.

**Tech Stack:** Markdown; Node.js >=22; built-in `node:test`; existing npm scripts. No new dependencies.

**Spec:** [Harness maintenance meta-skill design](../specs/2026-11-25-harness-maintenance-meta-skill-design.md)

## Global Constraints

- The distributable plugin is `ai-native-sdlc`; its runtime content hash includes `agents/`, `hooks/`, `scripts/`, `skills/`, `templates/`, and two runtime documents.
- Existing ticket runs use pinned snapshots for SDLC execution. The bootstrap resolver, standalone skills, and common safety hooks use the current installation, so not every behavior is protected by ticket pinning.
- Shared installs link the source clone and can change all connected projects when that clone is updated. Copy/plugin installs have different update mechanics.
- The repo targets Copilot, Claude Code, and Codex, with different discovery locations and capabilities. Do not claim cross-host behavior from a single host's result.
- The intended shipped skill roster is deliberately explicit in `scripts/validate.mjs`; unexpected skill directories must remain detectable.
- The repo uses Node.js 22+, existing npm validation, manual behavioral scenarios in `tests/scenarios/pressure.md`, and CI across supported operating systems.
- This repository has no matching local harness-maintenance skill yet. The local `skills/` directory remains the source of truth for reusable runtime skills; a maintainer-only skill must not become part of the customer-facing runtime inventory.
- Do not push, merge, publish, update consumer projects, or commit without the corresponding explicit authorization.

## Review Focus

- A maintainer skill accidentally enters customer installation or ticket identity: test that it is outside `skills/`, absent from plugin registrations, and outside the runtime inventory.
- A SemVer parser accepts malformed versions or mismatched manifests: test valid release and prerelease versions, invalid syntax, and each metadata-file mismatch.
- A change to hooks or runtime guidance is mistakenly treated as harmless because it is Markdown: pressure-test classification by behavior and consumer timing, not extension.
- An old ticket is silently stranded by a runtime or state change: add a compatibility scenario that requires a retained old-release fixture and start/resolve/resume/restore evidence or an explicit migration.
- A static check is reported as proof of host discovery or effective triggering: keep manual host evidence separate and report unavailable host checks as unverified.

---

### Task 1: Add the maintainer-only skill entry point

**Files:**
- Create: `.agents/skills/harness-dev/SKILL.md`
- Create: `.agents/skills/harness-dev/agents/openai.yaml`
- Modify: `AGENTS.md`
- Create: `tests/maintainer-skill.test.mjs`

**Interfaces:**
- Produces the manually invoked `harness-dev` procedure for maintainers working in this repository.
- `AGENTS.md` directs maintainers to the skill path and says to use explicit reading/invocation if the active host does not discover it.

- [x] **Step 1: Write a failing boundary test**

Add a test named `maintainer skill is available locally but excluded from the shipped runtime` that asserts:
- `.agents/skills/harness-dev/SKILL.md` exists and declares `name: harness-dev` and `disable-model-invocation: true`;
- `.agents/skills/harness-dev/agents/openai.yaml` sets `policy.allow_implicit_invocation: false` for Codex while retaining explicit invocation;
- `AGENTS.md` points to `.agents/skills/harness-dev/SKILL.md`;
- the skill is not a directory under `skills/`;
- none of the three plugin manifests registers `.agents/skills/harness-dev`;
- the runtime inventory directories in `scripts/harness.mjs` do not include `.agents`.

Run: `node --test tests/maintainer-skill.test.mjs`
Expected: FAIL because the maintainer skill and its local pointer do not exist yet.

- [x] **Step 2: Implement the skill and local entry point**

Write a concise `SKILL.md` with Copilot manual-only invocation metadata and the spec's intake, impact/risk classification, compatibility, implementation, verification, and release/handoff procedure. Add Codex's `agents/openai.yaml` manual-only policy sidecar. Keep both outside `skills/` and avoid claiming unsupported Claude discovery. Add a short `AGENTS.md` pointer without copying the procedure into global instructions.

- [x] **Step 3: Run the boundary test and package checks**

Run: `node --test tests/maintainer-skill.test.mjs`
Expected: PASS; the maintainer skill is locally present and excluded from shipped registration/runtime inventory.

Run: `npm test && npm run validate`
Expected: PASS; the existing shipped-skill roster and package validation remain unchanged.

### Task 2: Add SemVer consistency validation and a changelog

**Files:**
- Modify: `scripts/validate.mjs`
- Modify: `tests/package.test.mjs`
- Create: `CHANGELOG.md`

**Interfaces:**
- `validatePackage(root)` continues returning an array of human-readable validation errors.
- Version metadata sources are `package.json`, `plugin.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json`; all must contain the same valid SemVer string.
- The explicit `skillNames` roster remains unchanged.

- [x] **Step 1: Add failing package-version tests**

In `tests/package.test.mjs`, add isolated-copy tests that assert:
- the current matching `0.1.0` metadata validates;
- a valid prerelease such as `0.2.0-rc.1` validates when present identically in all four files;
- malformed versions such as `0.1` and `0.1.0-01` are rejected;
- a mismatch in each of the four files is reported with the offending path.
- missing `CHANGELOG.md` or its `## [Unreleased]` heading is reported as a package validation error.

Name the test `package version metadata is valid, consistent, and has an unreleased changelog` so the targeted selector below runs it.

Run: `node --test --test-name-pattern='version' tests/package.test.mjs`
Expected: FAIL because the validator currently only accepts the literal `0.1.0`.

- [x] **Step 2: Implement SemVer validation and changelog baseline**

Replace the fixed-version comparison in `scripts/validate.mjs` with a dependency-free SemVer 2.0.0 syntax check and equality check across the four files. Require `CHANGELOG.md` to contain `## [Unreleased]`. Create it with that section and identify `0.1.0` as the current manifest baseline without inventing a release date or claiming a new release. Preserve `contentSha256` as the exact ticket identity.

- [x] **Step 3: Verify package metadata behavior**

Run: `node --test --test-name-pattern='version' tests/package.test.mjs`
Expected: PASS for matching stable/prerelease versions and FAIL cases for malformed or mismatched metadata.

Run: `npm test && npm run validate`
Expected: PASS with all four current versions still equal to `0.1.0`.

### Task 3: Record behavioral and compatibility scenarios

**Files:**
- Modify: `tests/scenarios/pressure.md`
- Modify: `.agents/skills/harness-dev/SKILL.md` only if scenario results reveal a specific gap

**Interfaces:**
- Scenario records use the existing pressure-test table and distinguish a no-guidance baseline from behavior after applying the maintainer skill.
- For an edited existing runtime skill, the previous release is the baseline; for a new maintainer workflow, the no-guidance run is the baseline.

- [x] **Step 1: Add focused maintainer scenarios**

Add a separate harness-maintenance scenario table with IDs `HM01`–`HM04`:
- `HM01`: a `retro` proposal to fix an existing hook failure is routed to the harness source and classified by its impact on current consumers;
- `HM02`: a field request to change approval semantics is high impact and requires old-ticket compatibility or migration evidence plus isolated rollout/rollback;
- `HM03`: a README typo is handled as routine, without a design document or behavioral scenario;
- `HM04`: a state-schema change affecting a retained ticket is not accepted based only on a current-version test; require start/resolve/resume/restore evidence using a retained old-release fixture or explicit migration.

The pass criteria must also require explicit consumer rollout authorization. Keep evidence/results separate from the scenario definitions.

- [x] **Step 2: Run the baseline without the maintainer skill**

Use fresh local agent contexts and provide only the repo's ordinary instructions. Record observed omissions/rationalizations and actual outputs in `tests/scenarios/pressure.md`; do not infer a failure from the design alone.

- [x] **Step 3: Run the same scenarios with the maintainer skill**

Repeat the scenarios with the skill loaded. Record observed behavior and limitations. Add only the smallest guidance needed to close observed gaps; do not claim a statistical guarantee from a small manual sample.

- [x] **Step 4: Verify scenario records**

Review the scenario table to ensure each acceptance criterion is observable and each recorded result is evidence-based. Run: `git diff --check`
Expected: PASS.

### Task 4: Verify host discovery and end-to-end handoff

**Files:**
- Modify: `.agents/skills/harness-dev/SKILL.md` or `AGENTS.md` only if verified host behavior requires correcting the invocation path or fallback.
- No customer project, installed harness, or ticket snapshot is modified.

**Interfaces:**
- Report four distinct outcomes: structural validity, host discovery, triggering, and behavior.
- Any unsupported or unavailable host check is explicitly marked unverified.

- [x] **Step 1: Verify local Copilot and Codex discovery**

For Copilot, run `copilot skill list --json` from this repository and `/skills list` in an interactive repository session; confirm `harness-dev` is discoverable. Use only a manual invocation documented by the active CLI; if the exact invocation is not documented or the skill cannot be invoked, use the `AGENTS.md` explicit-read fallback and report the limitation rather than guessing syntax. For Codex, confirm the `.agents/skills` discovery location and `agents/openai.yaml` policy against its official documentation; use `$harness-dev` for explicit selection only in a live session where the CLI is available. Record the observed CLI/version and exact invocation. Do not equate listing/discovery with successful triggering.

- [x] **Step 2: Verify Claude boundary without claiming parity**

Confirm that the repo-local location is not being presented as Claude Code discovery. If no supported maintenance-only discovery location is verified, retain explicit reading as the fallback; do not add a customer-shipped duplicate.

- [x] **Step 3: Run final repository validation**

Run: `npm test && npm run validate && git diff --check`
Expected: all tests pass, validator reports consistent versions and unchanged catalog, and no whitespace errors are reported.

- [x] **Step 4: Review rollout and handoff**

Use the local `code-review` workflow on the complete diff. Confirm the changelog does not claim publication, no external rollout occurred, and all host gaps, compatibility requirements, consumer actions, and rollback instructions are stated. Do not commit unless separately authorized.
