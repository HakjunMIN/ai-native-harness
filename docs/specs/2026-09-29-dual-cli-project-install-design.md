# Copilot CLI + Codex project installation

> Historical design: the Node installer described below was subsequently replaced
> by the root Bash `install.sh` with optional curl/Git bootstrap. See README.

## Goal and boundaries

One explicit command, run for a target project, makes this harness's 30 skills,
9 specialist agents, and session/guard hooks available to both GitHub Copilot
CLI and Codex CLI. This is a project-scoped development install, not a
marketplace/plugin install or a global user configuration. The source checkout
remains authoritative; installation links to it rather than copying the
package. README presents this method first, with existing plugin-based
installations documented as optional host-specific alternatives.

Installation never implies that either host grants the same agent permissions,
review independence, or deployment authority. Required gate evidence remains
subject to actual runtime checks. Node.js 22+, Bash, and both CLIs (for live
smoke checks) are prerequisites; no network or package installation is needed
to create the project wiring.

## Project layout and discovery

An installer in `scripts/` takes an explicit target project path and defaults
the source path to its own checkout. It resolves and validates both paths, then
creates only these project-local entries:

| Destination in target | Purpose |
|---|---|
| `.ai-native-sdlc` | One symlink to the source checkout, including `scripts/`, `templates/`, and skill references |
| `.agents/skills/<name>` | Per-skill symlinks to `.ai-native-sdlc/skills/<name>`; both hosts discover this location |
| `.github/agents/<name>.agent.md` | Per-agent symlinks to `.ai-native-sdlc/agents/<name>.agent.md` for Copilot |
| `.codex/agents/<name>.toml` | Generated Codex-native agent definitions with name, description, and instructions to read the corresponding linked profile |
| `.github/hooks/ai-native-sdlc.json` | Copilot project hook definitions for session start and pre-tool guard |
| `.codex/hooks.json` | Codex project hook definitions for the corresponding events |

Generated hooks address the resolved target's `.ai-native-sdlc` link, not a
plugin-only environment variable. Generated Codex agent definitions point at
the same profile content, without pinning a model or claiming Markdown `tools`
maps to native tool restrictions. This means updating the source checkout
updates linked skills, agents, scripts, and templates, while installer-generated
configuration must be refreshed after changes to its format or agent list.
Moving either checkout invalidates these links and any absolute hook commands;
rerun the installer after moving. Document this dependency prominently.

The installer verifies its source has the expected skills, agent profiles,
entry points, and templates. It treats an existing unrelated destination,
including any existing `.codex/hooks.json` or same-named skill, as a conflict
and stops rather than overwriting or silently skipping required capabilities.
Before writing it checks *all* destinations. Re-running against matching
generated entries is idempotent; a partial failure cleans up only entries it
created. Uninstall, if provided, removes only installer-owned entries after
verifying their targets/content; it never removes a user-owned directory.
Do not replace an existing `AGENTS.md`, project settings, or plugin install.

## Host adapters and enforcement

Keep the shared guard decision logic in `hooks/guard.mjs`. Add a Codex input and
output adapter rather than assuming that Copilot's top-level
`permissionDecision` or its session context shape is portable. Codex's
`PreToolUse` uses `tool_name`/`tool_input` and needs
`hookSpecificOutput: {hookEventName: "PreToolUse",
permissionDecision: "deny", permissionDecisionReason}` to block a supported
tool call. A neutral decision must not grant permission. Handle the documented
Codex shell and `apply_patch` argument shapes, and fail closed when the guard
cannot interpret a potentially mutating supported call. Adapt session-start
context to the host-specific shape without claiming a state gate passed.

Both hosts must discover and enable their project hooks; Codex requires the
project configuration layer to be trusted and each non-managed hook definition
to be reviewed/trusted. Hooks are guardrails, **not an OS security boundary**:
Codex documents tool paths that can bypass hooks, and host tool permissions
and human approvals remain necessary. No silent downgrade is allowed if hooks
are missing, disabled, untrusted, or incapable of intercepting an operation.
An installer check reports that state explicitly; it cannot silently label the
installation complete on file existence alone.

## Documentation and validation

Replace the README's plugin-first instructions with one project installation
command, directory layout, update/reinstall instructions, conflict behavior,
and how to verify discovery in **both** CLIs. Explain that `scripts/` and
`templates/` are runtime dependencies, `tests/` and `examples/` are development
assets, and installing a plugin does not place those files in the target
project root. Update `docs/compatibility.md` to distinguish Codex-native hook
support from this repository's current lack of a Codex adapter; describe actual
native agent registration after it is implemented. Preserve the optional
Claude Code instructions and host-specific plugin path as alternatives.

Automated tests cover fresh installation, idempotence, existing-file conflicts,
broken/moved links, safe partial-failure behavior, generated manifest syntax,
correct source paths, Codex agent definitions, and equivalent guard
allow/deny decisions from both hook input formats. A test must invoke the
generated hook command against a fixture project and assert the **actual deny
output shape**, not merely test that its JSON parses. Run targeted repository
tests and validation; perform CLI discovery and hook trust/deny smoke checks in
the test project when the binaries and permission flow are available. Report
any unverified live-host behavior explicitly rather than advertising parity.

## Rollout and acceptance

No existing plugin manifest is removed. This project-scoped installation is
the documented default only after a fresh target project demonstrates:
1. Both hosts discover all 30 skills, with no unexpected duplicate installation.
2. Copilot discovers all 9 profiles and Codex registers all 9 native agents.
3. Both session hooks run, and a representative prohibited command is denied
   by each host's trusted/enabled guard hook.
4. Existing target files remain untouched on conflict and a repeat install
   leaves the same valid wiring.

If a host cannot discover symlinked entries or blocks the needed hook path,
stop rollout, report the incompatible capability, and revise the adapter or
installation layout rather than claiming equivalent behavior.
