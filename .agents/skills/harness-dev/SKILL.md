---
name: harness-dev
description: Use when a maintainer wants to change, improve, test, review, or release the ai-native-harness repository.
disable-model-invocation: true
---

# Harness development

Maintain and improve this repository's harness. This is a maintainer workflow,
not a customer runtime skill. Do not edit an installed harness, consuming
project, or ticket snapshot.

## Procedure

1. **Understand the request.** Capture the desired outcome, why it matters,
   affected consumers, acceptance evidence, and source: `retro`, field/adoption
   feedback, or a maintainer idea. Treat proposals as input, not authorization.
   Reuse existing `retro` or `prune-unused` evidence; do not rerun them by
   default.
2. **Confirm the source checkout.** Check that this is the intended harness
   repository and not a shared clone currently linked by consumers. If runtime
   assets could change active consumers before rollout, stop before editing
   until an isolated source checkout is available.
3. **Map impact live.** Search the repository for affected names, interfaces,
   hosts, consumers, and tests. Consider the shipped skills and agents; hooks,
   scripts, gates, state/lock/config schemas, templates, installers and runtime
   guidance; and standalone use. Check host-specific discovery, invocation,
   permission, and update behavior. Also consider Korean/English docs,
   skill-count markers, diagram JSON/SVG labels, live-documentation allowlists,
   Windows/PowerShell validation, pinned tickets, rollback, and every install
   mode touched. This list is a prompt, not a substitute for repository search.
4. **Choose risk by effect.** Base the tier on who is affected, when the
   behavior takes effect, compatibility, reversibility, and security or
   approval impact—not file extension or diff size.
   - **Routine:** wording, typo, or non-normative documentation with no
     behavior or install effect. Make the narrow change and run the relevant
     check; no separate design or behavioral scenario.
   - **Behavioral:** a shipped skill workflow, bounded agent/template
     behavior, or operator guidance that changes actions. State expected
     behavior and acceptance criteria; use a short design, a realistic
     pressure scenario, targeted checks, and independent review.
   - **High impact:** approval/permission semantics, gates, tracker identity,
     hooks, bootstrap/resolver, state/lock/config schema, installer or host
     registration, compatibility guarantees, or anything affecting current
     consumers or risking existing runs. Get approval for a written design and
     implementation plan before editing. Include compatibility or migration,
     rollback, old-release fixture checks, affected host verification, and an
     isolated consuming-project rollout.

   Markdown can be high impact when it changes runtime behavior. A script can
   remain behavioral or routine if its actual blast radius is bounded.
5. **Implement with evidence.** For a new skill or workflow, first observe a
   realistic baseline without the proposed guidance. When editing an existing
   skill, compare against the previous released behavior. Record the observed
   gap and acceptance criteria, add the smallest effective change, rerun the
   same scenario, and record limitations. For code, use the local `tdd`
   workflow. Use `grilling` for unresolved requirements and the applicable
   local review/verification skills; do not duplicate their procedures.
6. **Protect old runs.** If the change can affect pinned-ticket behavior, test
   start, resolve, resume, and restore against a retained old-release fixture.
   If compatibility cannot be preserved, stop until an explicit, tested
   migration path is approved. A passing current-version test is not evidence
   of old-ticket compatibility.
7. **Verify separate claims.** Report evidence independently for:
   - structural and contract validity;
   - actual discovery by each affected host;
   - correct selection/triggering on intended requests and near misses;
   - behavior under realistic scenarios.

   Use the repository's existing tests, `npm run validate`, `git diff --check`,
   relevant pressure scenarios, and platform CI as appropriate. Do not treat
   file presence or one host's result as proof for another. Mark unavailable
   host checks unverified.
8. **Prepare the release handoff.** Keep the intended skill roster explicit;
   reconcile expected, packaged, installer-registered, and host-discovered
   identities instead of checking counts alone. For a distributable release,
   keep SemVer valid and consistent in `package.json` and all three plugin
   manifests, and update `CHANGELOG.md`. Describe compatibility, consumer
   actions, installer/ref behavior, reinstall needs, and rollback. `SemVer`
   describes compatibility; `contentSha256` remains the exact ticket runtime
   identity. Do not publish, push, merge, or update consumers without explicit
   authorization.

## Stop and output

Stop before editing if source ownership, approval, compatibility, or the
consumer boundary is unclear. Ask only for a decision that changes the work.

Hand off the changed files, evidence, unverified host behavior, compatibility
or migration requirements, consumer actions, and rollback. Commit only when
explicitly authorized; a commit does not authorize push, merge, publish, or
consumer rollout.
