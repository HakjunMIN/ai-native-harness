---
name: helm-argocd-release
description: Use when preparing Helm GitOps promotions, checking release readiness, observing ArgoCD health, or proposing rollback.
---

# Helm and ArgoCD Release

## Required live documentation

Before technical advice, code, configuration or queries, follow the
[live-documentation protocol](../sdlc/references/live-documentation.md) and
**fetch the relevant official URLs** in [sources](references/sources.md) during
this task. Local guidance below defines project policy and verification questions,
not current upstream facts. Record fetched URL/section/date and matching version;
failed retrieval blocks dependent guidance rather than falling back to memory.

Produce reviewable promotion evidence; humans control application and production approval.

Read the [shared principles](../sdlc/references/principles.md). Import this plugin's
`verification-gate` and, only for Jira runs, `jira-sync` references natively or
from exact plugin-root files; reuse references without executing their workflows.

## Procedure

1. Establish authorized release/observation scope and required evidence. In SDLC
   the conductor supplies valid G4 and policy-required review/approvals. Standalone
   rendering or health observation needs no ticket and authorizes no deployment.
2. Record three separate identities: **source candidate SHA** with exact-SHA required CI and immutable image digest; **promotion commit** containing chart/values changes and their checks; **observed ArgoCD desired revision** resolved for each environment. Do not equate these revisions.
3. Draft PR text with verification links (Jira links only when applicable),
   revision identities, digest, risks and rollback criteria. Humans publish
   branches. Draft non-production PRs require an already-published selected branch.
4. Prepare allowed dev/staging changes using the candidate digest. If actual charts/values change, have the conductor invalidate affected gates and reverify rendered manifests, required chart checks, and review against the new promotion commit before resuming. Proposal-only text is not an applied chart change. Source changes additionally require refreshed source verification, exact-SHA CI, and image provenance.
5. Humans merge dev/staging promotion PRs and control application. Observe desired and synced revisions, workload image digest, health, readiness, and smoke results. Match ArgoCD's resolved revision to the intended promotion commit, not automatically to the source candidate SHA.
6. For SDLC production handoff require healthy dev/staging; write proposals only
   in `docs/sdlc/<KEY>/production-proposal/`. Standalone proposals use explicitly
   authorized non-live paths. Humans apply/review/merge and control production sync.
   Observe digest/health; PR existence is not deployment or G5b.
7. Report only observed outcomes (SDLC: `05-release.md`). Read-only observations
   do not implicitly start promotion or Jira synchronization.

## Bounded example

An image built from source commit A is promoted by values commit B. Verify B's chart changes and ArgoCD's resolved B revision while retaining A's image provenance. A green A build cannot validate newly edited charts.

## Stop and output

Return all three revision identities, digest, corresponding CI/chart/health evidence, proposal paths, human decisions, and blockers.

**Never edit actual production desired-state**, including indirect production configuration. No alternate writes or emergency `kubectl patch` bypass.

The v1 guard denies **all** shell pushes/merges and direct Helm/kubectl/ArgoCD mutations. Agents never push, merge, deploy, or sync in any environment—even with urgent authorization.

Failed/unavailable checks or mismatched provenance are `BLOCKED`. Human actions require `NEEDS_HUMAN`; keep release incomplete until approval and production health are confirmed.
