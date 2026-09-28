---
name: helm-argocd-release
description: Use when preparing Helm GitOps promotions, checking release readiness, observing ArgoCD health, or proposing rollback.
---

# Helm and ArgoCD Release

Produce reviewable promotion evidence; humans control application and production approval.

Read the [shared protocol](../sdlc/references/protocol.md). Import this plugin's `verification-gate` and `jira-sync` references natively or from exact plugin-root files; reuse active references without executing their workflows.

## Procedure

1. Run `node <PLUGIN_ROOT>/scripts/state.mjs check <ticket-state>`. Require current G4 evidence, required different-family review, verified approvals, and known release scope.
2. Record three separate identities: **source candidate SHA** with exact-SHA required CI and immutable image digest; **promotion commit** containing chart/values changes and their checks; **observed ArgoCD desired revision** resolved for each environment. Do not equate these revisions.
3. Draft PR text with Jira/verification links, revision identities, digest, risks, and rollback criteria. Humans publish branches. An agent may create a draft non-production PR only on an already-published, explicitly selected branch.
4. Prepare allowed dev/staging changes using the candidate digest. If actual charts/values change, have the conductor invalidate affected gates and reverify rendered manifests, required chart checks, and review against the new promotion commit before resuming. Proposal-only text is not an applied chart change. Source changes additionally require refreshed source verification, exact-SHA CI, and image provenance.
5. Humans merge dev/staging promotion PRs and control application. Observe desired and synced revisions, workload image digest, health, readiness, and smoke results. Match ArgoCD's resolved revision to the intended promotion commit, not automatically to the source candidate SHA.
6. Require healthy dev **and staging** before production handoff. Put production diffs, PR text, and rollback proposals **only in `docs/sdlc/<KEY>/production-proposal/`**. A human applies/reviews the actual production PR, approves G5b, merges, and controls sync. Observe production revision/digest and health; PR existence is not Done.
7. Record confirmed outcomes in `05-release.md`; synchronize only verified facts.

## Bounded example

An image built from source commit A is promoted by values commit B. Verify B's chart changes and ArgoCD's resolved B revision while retaining A's image provenance. A green A build cannot validate newly edited charts.

## Stop and output

Return all three revision identities, digest, corresponding CI/chart/health evidence, proposal paths, human decisions, and blockers.

**Never edit actual production desired-state**, including indirect production configuration. No alternate writes or emergency `kubectl patch` bypass.

The v1 guard denies **all** shell pushes/merges and direct Helm/kubectl/ArgoCD mutations. Agents never push, merge, deploy, or sync in any environment—even with urgent authorization.

Failed/unavailable checks or mismatched provenance are `BLOCKED`. Human actions require `NEEDS_HUMAN`; keep release incomplete until approval and production health are confirmed.
