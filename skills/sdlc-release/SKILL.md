---
name: sdlc-release
description: Use when a verified Jira ticket or local run needs release PR preparation, CI evidence, GitOps promotion, or production handoff.
---

# Release

Read [protocol](../sdlc/references/protocol.md). Require `next=release`, valid G4,
unchanged source and fresh verification. Invoke `helm-argocd-release` and `pr`,
and use `jira-sync` only for Jira-originated work. Dispatch `sdlc-release-engineer`
with the handoff and production denylist when specialized work is needed.

Apply [project governance](../sdlc/references/project-governance.md): confirm the
verified Project baseline remains applicable and exceptions have not expired.
Carry approved shared ADR/standard changes, migration obligations and exception
owners/exit conditions into `05-release.md` and the production handoff. Material
drift returns to the affected gate; release approval does not waive shared rules.

1. Prepare PR title/body with `pr`: Summary, Evidence from AC/test/UX reports,
   Merge Danger from compatibility and plan risks, and Traceability with the Jira
   link only for Jira work, release artifact and rollback. Rewrite it when the
   candidate SHA changes. Human publishes the branch; v1 hooks deny
   `git push` and `gh pr merge`. Release work never merges; conductor-owned,
   user-authorized local source integration belongs to implement, not promotion.
   Agents may create a draft PR only on an already-published,
   explicitly selected non-production branch with authorization.
2. Inspect GitHub Actions required checks for the exact PR head SHA, including
   dependency/security/build/chart checks required by repository rules. Pending,
   skipped required jobs or a green result from another SHA do not qualify.
3. Prepare dev/staging Helm promotion changes with immutable image digest. Any
   source/chart edit invalidates G3/G4; reverify the final revision. Human merges
   promotion PRs; observe ArgoCD desired revision, Synced/Healthy and smoke tests.
   ArgoCD auto-sync means merge is a deployment action.
4. Record G5a only after current-SHA CI and both dev/staging promotion evidence.
5. Write production proposed patch and PR text (`pr` shape) ONLY under
   `docs/sdlc/<ID>/production-proposal/`. Do not edit live prod values, push,
   merge, sync, kubectl patch or assume chat approval grants deployment authority.
   Human applies/reviews/merges the prod PR and controls ArgoCD.
6. On resumption, observe the human approval/merge, deployed digest, sync/health and
   smoke evidence. Only then record G5b with
   `deployment: {digest, sync: "Synced", health: "Healthy"}`. Mark Jira Done
   only for Jira-originated work; local runs retain local release status.
   Until then keep release
   pending and explicitly say “production handoff prepared,” not “deployed.”

Write `05-release.md` including every environment's revision/digest/status, PRs,
CI links, approvals, rollback target and (Jira runs only) pending outbox. For local
runs do not create Jira issues or claim Jira Done. If health regresses,
stop promotion and hand off rollback via GitOps to the human operator; never
perform an emergency direct cluster mutation.
