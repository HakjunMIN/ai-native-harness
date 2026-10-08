# Safe project instructions

Use this procedure before an authorized project-specific AGENTS.md change,
including an accepted `retro` navigation improvement. Shared installation may
link this file to the harness template used by several repositories.

**Never edit through an AGENTS.md symlink.** Do not change the shared template,
installed harness, ticket snapshot or sibling repositories to customize a project.

1. Inspect the project's AGENTS.md with `lstat`, not a check that follows links.
   Preserve an existing regular file and propose the smallest authorized diff.
   If absent, create a local regular file only when needed; do not replace an
   existing path or create another shared link.
2. For a symlink, inspect `readlink` and the regular-file ownership manifest
   `.ai-native-sdlc.links.json`. Require version 1 and exactly one `AGENTS.md`
   entry of kind `link`; its `hash` must equal the SHA-256 of the link text.
   Verify the resolved target is the installed harness's
   `templates/project-AGENTS.md`. Broken, modified, unmanaged or unknown links
   need explicit ownership review; stop rather than guessing or unlinking them.
3. Coordinate with shared-clone updates before taking a copy. An active target
   `.ai-native-sdlc.install-lock` or sibling `.<shared-clone>.shared-install-lock`
   blocks conversion. Acquire the target's `.ai-native-sdlc.install-lock` with
   exclusive directory creation for this operation; never remove an existing
   lock. If a concurrent shared update cannot be excluded, pause.
4. Preserve the target's complete bytes, original link text and manifest bytes
   **before unlinking**. Prepare a regular-file copy and updated manifest locally;
   remove only the `AGENTS.md` entry from `entries`, retaining all other entries
   and metadata. Recheck the link, target hash and manifest before replacement.
5. Unlink only the project's AGENTS.md and install the preserved bytes as a local
   regular file without overwriting a newly created path. Atomically replace the
   local manifest with the prepared version. On failure, restore only the local
   link/manifest from the saved originals if they have not changed concurrently;
   otherwise stop for recovery. Never repair a failure by writing the shared target.
6. Verify AGENTS.md is now a regular file with the preserved contents, its entry
   alone is absent from the manifest, and the shared template hash is unchanged.
   Sibling links must remain untouched. Release only this operation's lock and
   remove its temporary files. Then apply and review the project-only diff.

Subsequent authorized shared installs preserve this local file rather than
relinking it. Shared guidance updates now require manual review and integration;
do not reinstall merely to test localization, since installation can update the
shared clone for every connected project. The installer regression uses temporary
repositories to verify preservation on reinstall.

Keep AGENTS.md to workflow/navigation pointers. Put project rules in their
existing standards or ADR locations under
[project governance](../../sdlc/references/project-governance.md).
