# Helm and Argo CD live sources

Follow the [live-documentation protocol](../../sdlc/references/live-documentation.md).
Fetch relevant URLs before rendering guidance or interpreting observed health.
Retrieval never authorizes deployment, sync or production desired-state edits.

| Topic | Official URL to fetch | Verify for installed versions |
|---|---|---|
| Helm | [Helm docs](https://helm.sh/docs/) | Chart syntax, values, rendering and major-version behavior |
| Argo CD | [Argo CD docs](https://argo-cd.readthedocs.io/en/stable/) | Desired revisions, sync, health and multi-source behavior |
| Kubernetes | [Kubernetes docs](https://kubernetes.io/docs/home/) | API compatibility, probes and workload rollout observations |

For chart-specific values, retrieve the chart publisher's official documentation
and source at the exact chart version found in the project. Do not infer chart
keys from Helm's general documentation.
