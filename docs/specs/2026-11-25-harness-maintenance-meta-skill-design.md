# Harness maintenance meta-skill

## Intent

Create a repository-local meta-skill for improving `ai-native-harness` itself.
It turns a `retro` proposal, a field requirement, or a maintainer's idea into a
bounded, reviewed harness change, without requiring every change to use the
full customer-facing SDLC gates.

The need is broader than authoring skills. Harness changes can affect packaged
skills and agents, runtime workflow and gates, state and lock compatibility,
hooks, installers, templates, documentation, tests, and host integrations.
Changes should be proportionate to their real impact, while preserving safety
and compatibility for projects that install the harness.

## Goals

- Provide one discoverable entry point for proposing and making any harness
  improvement.
- Scale design and verification effort to affected users, runtime timing,
  compatibility risk, and reversibility rather than file extension or change
  size alone.
- Preserve the harness's existing review, testing, host-support, and ticket
  revision contracts.
- Make omissions visible through identity-based catalog checks and a current
  repository impact scan.
- Track released changes with a consistent version and actionable release
  notes.
- Leave deployment of changes to consuming projects under maintainer control.

## Non-goals

- Replace `retro`, `prune-unused`, `grilling`, `tdd`, `code-review`, or
  `verification-gate`. The meta-skill consumes their outputs and invokes the
  applicable local workflow rather than duplicating it.
- Make every harness change run through the customer-facing G0–G5b workflow.
- Automatically rewrite catalogs, generate diagrams, publish releases, update
  consuming projects, or push changes without the required authorization.
- Change customer project files, installed harness copies, or ticket snapshots
  while developing this meta-skill.
- Treat a passing structural validator as proof that a host discovers a skill,
  selects it for the right requests, or follows it correctly.

## Constraints and repository context

- The distributable plugin is `ai-native-sdlc`; its runtime content hash
  includes `agents/`, `hooks/`, `scripts/`, `skills/`, `templates/`, and two
  runtime documents. A change to those assets affects new ticket baselines.
- Existing ticket runs use pinned snapshots for SDLC execution. The bootstrap
  resolver, standalone skills, and common safety hooks use the current
  installation, so not every behavior is protected by ticket pinning.
- Shared installs link the source clone and can change all connected projects
  when that clone is updated. Copy/plugin installs have different update
  mechanics. A release must describe its actual installation and rollout
  implications; the manifest version alone does not deploy an update.
- The repo targets Copilot, Claude Code, and Codex, with different discovery
  locations and capabilities. Do not claim cross-host behavior from a single
  host's result.
- The intended shipped skill roster is deliberately explicit in
  `scripts/validate.mjs`; unexpected skill directories must remain detectable.
- The repo uses Node.js 22+, existing npm validation, manual behavioral
  scenarios in `tests/scenarios/pressure.md`, and CI across supported
  operating systems.
- This repository has no matching local harness-maintenance skill yet. The
  local `skills/` directory remains the source of truth for reusable runtime
  skills; a maintainer-only skill must not become part of the customer-facing
  runtime inventory.

## Approaches considered

1. **Dogfood through the customer SDLC gates.** This offers a familiar,
   consistent workflow but imposes ticket state, approval artifacts, and
   heavyweight gates on changes that do not need them.
2. **A dedicated, lightweight, risk-scaled maintainer procedure.** It reuses
   local skills and existing validation, but adds impact and compatibility
   checks specific to changing the harness. **Selected by the user.**
3. **Keep using general-purpose skills with a checklist.** This is easy to
   start, but leaves the cross-repository impact model and release obligations
   implicit and easy to omit.

## Decisions

- The meta-skill is for maintainers of this source repository, not a feature
  shipped or registered as a customer runtime skill.
- It will be kept outside the distributable `skills/` tree and the ticket
  content hash. The initial implementation should use a project-local skill
  location discoverable by the primary Copilot/Codex maintainer workflow, with
  `AGENTS.md` pointing to it. Claude Code uses a different skill location; do
  not claim Claude discovery unless a supported, non-distributable arrangement
  is verified. Explicit reading/invocation is an acceptable fallback.
- The skill files may be physically present in a whole-repository clone or
  plugin cache, but must not be registered by customer installers or become
  part of the shipped skill catalog. If packaging behavior changes, re-check
  this boundary.
- Invocation policy is host-specific. Use `disable-model-invocation: true` for
  Copilot where supported, and Codex's `.agents/skills/<name>/agents/openai.yaml`
  with `policy.allow_implicit_invocation: false`; preserve explicit invocation.
  Do not assume one host's metadata enforces another host's policy.
- Use a dedicated process, not the harness's full customer SDLC gates. Obtain
  user approval before a high-impact design or a release/rollout. Do not push
  or merge automatically; commit only when the user explicitly authorizes it.
- Version the distributable harness with SemVer and maintain a `CHANGELOG.md`.
  Keep the version consistent across `package.json` and all three host plugin
  manifests. Replace the current fixed-version validator with a consistency
  check and valid SemVer check. Keep `contentSha256` authoritative for exact
  ticket runtime identity; SemVer communicates compatibility and intent, not
  exact content or rollout.
- Release notes must describe user-visible changes, compatibility and
  migration actions, relevant installer/ref behavior, whether reinstall or
  regenerated wiring is required, and a rollback path. Add, remove, or rename
  operations that require running an installer again must say so.
- Keep intended catalog membership independent of discovered filesystem
  contents. Reconcile identities across the intended roster, manifests,
  installer output, and actual host discovery where testable. Do not derive
  the intended roster solely from the directories being checked.

## Procedure

### 1. Intake and boundaries

Record the requested outcome, why it matters, source of the request
(`retro`, field/adoption requirement, or maintainer idea), affected consumers,
and any acceptance evidence. Treat proposals as input, not authorization.
Preserve the originating evidence and avoid re-running `retro` or
`prune-unused` unless their output is missing or the user requests it.

Work in this source repository. Never edit a consuming project's installed
copy or an existing ticket snapshot as part of a harness change. Before
editing, confirm that the checkout is the intended source and not a shared
clone currently linked by consumers; if this cannot be established, stop
before modifying runtime assets.

### 2. Impact and risk classification

Search the current repository for every affected name, contract, host adapter,
consumer, and test. Use search results to build a change-specific impact list;
do not rely on a static list as complete. At minimum consider:

- shipped skill roster, skill references, agent profiles, role registration,
  hooks, scripts, gates, state and lock schemas, templates, configuration,
  installer-generated wiring, package manifests, and runtime documentation;
- all three host integrations and their different discovery, invocation,
  permission, and update behavior;
- Korean/English documentation parity, skill-count markers, diagram JSON and
  visible SVG labels, external-documentation allowlists, and Windows/PowerShell
  validation;
- existing configurations and ticket locks, standalone use, shared installs,
  copy/plugin installs, rollback, and current-install behavior.

Classify by blast radius, when the behavior takes effect, compatibility,
reversibility, and security/approval impact:

| Tier | Typical changes | Minimum process |
|---|---|---|
| **Routine** | Typo, wording, or non-normative documentation with no behavior, contract, or install effect | Make the narrow change; run the directly relevant check and review the diff. No separate design artifact. |
| **Behavioral** | A shipped skill's workflow, a non-critical agent/template behavior, documentation that changes operator action, or a new capability with bounded compatibility impact | State the behavior and acceptance criteria; use a short design in the change or chat; add or update a realistic pressure scenario; run relevant tests and checks; obtain independent review. |
| **High impact** | Changes to approval semantics, permissions, gates, tracker identity, hooks, bootstrap/resolver behavior, state/lock/config schema, installer or host registration, shared-runtime instructions, compatibility guarantees, or any change that can affect current consumers or strand existing runs | Write an approved design and implementation plan before editing. Include compatibility/migration and rollback design; test old-release fixtures and current behavior; verify affected host/install paths; stage rollout on an isolated project before updating shared consumers. |

These are minimums, not automatic approvals. A Markdown change can be high
impact if it alters operator or runtime behavior. Conversely, a code change
with no consumer or compatibility impact need not receive a high-impact
process merely because it touches a script.

### 3. Design and implementation

For behavioral changes, compare against the previous released behavior. For a
new skill or new workflow, establish a realistic baseline without the proposed
guidance. Record the observed gap, expected result, and scenario; add the
smallest effective instruction or implementation, then rerun the same scenario
and record remaining limitations. Static/documentation-only changes use
appropriate deterministic checks instead of artificial behavioral tests.

Use the repository's `tdd` workflow for code. Use `grilling` when requirements
remain ambiguous, and `code-review`/`verification-gate` as appropriate to the
risk tier. Preserve existing behavior unless a deliberate change is approved.
For changes to pinned-ticket behavior, test start, resolve, resume, and restore
using a retained old-release fixture; if compatibility cannot be preserved,
provide and test an explicit migration path.

### 4. Verification

Keep the following evidence separate:

1. **Format/contract validity:** repository validators and tests pass.
2. **Host discovery:** affected hosts actually expose the intended skills,
   agents, hooks, or configuration.
3. **Selection/trigger correctness:** positive and near-miss requests invoke
   the intended skill where supported.
4. **Behavior:** the workflow produces the expected result under a realistic
   scenario, compared with the relevant baseline.

For an affected host that cannot be exercised, mark that check unverified;
never infer it from another host or from file presence. Use current project
tests and validators (including `npm test`, `npm run validate`, and
`git diff --check`) as appropriate to the change, plus relevant pressure
scenarios and CI/platform checks. For high-impact rollout, verify first in an
isolated consuming project and document how to roll back before updating the
shared branch or wider consumers.

Retain pressure-scenario IDs, baseline identity, evidence, and limitations in
`tests/scenarios/pressure.md` for scenarios that are part of the repository's
behavioral record. Do not turn one-off copyedits into permanent scenarios.

### 5. Release and handoff

Update SemVer in all required manifests and `package.json` according to
compatibility impact, and add a user-facing `CHANGELOG.md` entry. Ensure
validation checks version agreement without assuming a fixed literal version.
Release notes must include consumer action and rollback, not only a summary of
commits. A user-approved commit does not imply authorization to push, merge,
publish, or update consumer projects.

Hand off the changed files, verification evidence, unverified host behavior,
compatibility/migration requirements, and release actions. Wait for explicit
authorization for any external rollout.

## Acceptance criteria

- A maintainer can invoke the procedure from this repository without
  accidentally adding it to the customer-facing skill catalog.
- It accepts requests from `retro`, real adoption, and direct maintainer ideas
  and does not attempt to replace their source workflows.
- Risk is selected based on effects and consumers, not file extension.
- Impact checks cover the relevant catalog, hosts, docs, installers, existing
  ticket/config compatibility, and target-platform validation.
- Skill validation, host discovery, triggering, and behavioral effectiveness
  are reported as distinct claims backed by appropriate evidence.
- High-impact changes have approved design/plan, old-version compatibility or
  migration evidence, isolated rollout and rollback instructions.
- Distributable versions agree across manifests and `package.json`; changelog
  entries explain what consumers must do. Exact ticket identity remains
  governed by `contentSha256`.
- No commit, push, merge, or consumer update occurs without the corresponding
  explicit authorization.

## Left to the builder

- Confirm the exact project-local skill directory and explicit invocation
  fallback against the supported Copilot CLI and Codex versions. Verify
  Claude Code's different skill location and document whether any local
  arrangement is supported; do not duplicate or expose the skill to customers
  just to claim parity.
- Verify that Copilot CLI honors its manual-invocation metadata; if its
  behavior is undocumented or unavailable, report the limitation and use the
  `AGENTS.md` direct-read fallback rather than claiming enforcement.
- Decide whether the skill should have one concise `SKILL.md` or a small
  reference file for the impact checklist, keeping maintenance-only material
  outside the runtime hash and customer registration.
- Implement version validation using existing dependencies and project
  conventions; do not add dependencies without need.
- Define a maintainable way to verify identity reconciliation and actual
  discovery without replacing the intentional expected-skill roster or
  claiming that a static test proves native host discovery.
- Determine the narrowest retained old-release fixture and isolated install
  smoke test that cover resolver compatibility and rollout behavior.
- Determine the initial SemVer baseline and first `CHANGELOG.md` entry based
  on repository release history; do not invent a release or publish it.
