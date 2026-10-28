[한국어](README.md)

# ai-native-sdlc

**A local development workflow where AI implements, evidence verifies, and people approve.**
Start from a Jira ticket or a natural-language request, with <!-- skill-count -->37 skills
and 9 specialized agents.

## Software Engineering Principles

**Prioritize verification proportional to change risk and clear ownership boundaries over procedural volume.**

| Principle | How the workflow applies it |
|---|---|
| Deliver small vertical increments | Split work into sub tasks with user outcomes and acceptance criteria (AC), rather than separate database, API, and UI layers. |
| AC-based verification and validation | Derive AC from user stories, Jira tickets, or requests. Connect observable frontend behavior to AC-linked Gherkin scenarios, and backend AC to API examples and unit, integration, and API tests using JUnit for Spring or Go `testing`. Before implementation, people validate intent at G1 through AC and scenarios, including prototypes for UI work. Final verification checks implementation against test results for each AC. |
| Contracts and boundaries first | Align domain terminology, API contracts, and test expectations. Preserve authentication, tenant, and product boundaries. |
| Risk-based verification | Use light mode for a small, low-risk, single outcome. Use strict mode for high-risk changes, architectural changes, or multiple outcomes. |
| Tests appropriate to the change | Use TDD (RED to GREEN) for behavior changes, before-and-after comparisons for refactoring, and relevant static checks for documentation and configuration. Configuration that changes behavior requires behavioral tests. |
| Independent review and separated roles | An author's self-review does not count as independent review. Strict mode also separates test writing from implementation. |
| Evidence-based completion and traceability | Bind tests, reviews, and approvals to file hashes and code revisions. Revalidate evidence invalidated by changes. Document existence or an earlier summary is not a pass. |
| Human approval and operations | People approve requirements (G1), plans (G2), and operational changes (G5b). Agents cannot approve their own work or perform actual production changes. |

Details: [Shared principles](skills/sdlc/references/principles.md) and
[workflow protocol](skills/sdlc/references/protocol.md).

## Scope and Flow

The default technical guidance targets an observability stack:
**Grafana datasource/panel/app + React/TypeScript -> Spring Boot BFF (Gradle)
-> SigNoz query-service**.
The BFF does not access ClickHouse directly, and the SigNoz UI is not exposed.
Go BFFs and backend services use `go-backend` and `go-testing` with the same boundaries.
Use the harness in a monorepo or across multiple microservice repositories.
Even with a shared installation, run `sdlc-setup` separately for each repository's
paths, commands, and project baseline.

**Discovery -> Plan -> Implement -> Verify -> Release**

![Stage-specific agents, required and conditional skills, and G1/G2/G5b human approval gates](docs/assets/ai-native-sdlc-skills.svg)

`sdlc` manages progress, pauses, and resumption. Technical skills can run independently;
invoking one does not start the full SDLC workflow or Jira work.

### Technical Skills Retrieve Official Documentation at Execution Time

Workflow skills define local procedures, approvals, and verification criteria.
Technical skills for Mimir, Prometheus, SigNoz, ClickStack, OTel, Grafana,
React/TypeScript, Spring, Go, and Helm/ArgoCD provide **official documentation
retrieval procedures rather than static product manuals**.

- Select relevant official URLs from each skill's `references/sources.md` and
  retrieve the actual content during the current task through a web tool,
  documentation MCP, or HTTP GET before applying it.
- Local Markdown keeps URL routing, project boundaries, and verification questions.
  Confirm APIs, configuration defaults, and supported capabilities against retrieved
  documentation and the installed version's source or configuration.
- `latest` and `main` are starting points. Find documentation or tags matching the
  deployed version. Record the URL, section, retrieval time, target version, and
  rationale for applying the guidance.
- If retrieval fails, report dependent work as `BLOCKED`. Do not substitute static
  summaries or model memory for current documentation. Retrieval does not authorize
  installation, upgrades, or operational changes.

Shared rule: [Live documentation protocol](skills/sdlc/references/live-documentation.md).
A ticket's harness lock pins local guidance and URL lists, not external documentation
content. Preserve retrieval evidence separately with the task when reproducibility
requires it.

## Installation

### Microservices: Share the Harness Across Sibling Repositories

For three or four service repositories under the same parent directory, use a
**shared clone with symbolic links**. The installer first clones `ai-native-harness`
alongside the service repositories, or updates an existing clone with
`git pull --ff-only`. Git and **Node.js 22 or later** are required.

```text
workspace/
├── ai-native-harness/        # Shared Git clone of skills, hooks, and agents
├── .ai-native-sdlc-revisions/ # Shared revision cache created with the first ticket
├── service-api/
├── service-web/
└── service-worker/
    ├── .ai-native-sdlc -> ../ai-native-harness
    ├── AGENTS.md -> .ai-native-sdlc/templates/project-AGENTS.md
    ├── .agents/skills/* -> ../../.ai-native-sdlc/skills/*
    ├── .github/agents/* -> ../../.ai-native-sdlc/agents/*
    └── docs/sdlc/<ID>/       # This service's state, lock, and task history
```

Bash/zsh: pass paths to repositories that already exist.

```bash
set -o pipefail
curl -fsSL 'https://raw.githubusercontent.com/HakjunMIN/ai-native-harness/main/install-shared.sh' |
  bash -s -- /workspace/service-api /workspace/service-web /workspace/service-worker
```

PowerShell 7+: install and run hooks on Windows without Bash.

```powershell
$url = 'https://raw.githubusercontent.com/HakjunMIN/ai-native-harness/main/install-shared.ps1'
& ([scriptblock]::Create((Invoke-WebRequest -Uri $url).Content)) `
  'C:\workspace\service-api' 'C:\workspace\service-web' 'C:\workspace\service-worker'
```

If the harness is already available, run [install-shared.sh](install-shared.sh) or
[install-shared.ps1](install-shared.ps1) directly.
On Windows, symbolic links require **Developer Mode or administrator privileges**.
Rerunning the command updates shared installation assets. New tickets and standalone
skills use updated assets; existing tickets retain their locked execution baseline.
Current shared safety hooks continue to update. To apply skill or agent additions
and removals, or repository-specific configuration changes, reinstall with all target
repositories specified.

Existing `AGENTS.md` files are preserved. Only newly created files link to the shared
project template. Hook execution code and role definitions are shared, while CLI hook
configuration containing target paths and Codex native agent TOML are generated per
repository. Conflicts and existing copy installations are not overwritten or converted
automatically. See [Installation](docs/install.md) for options, safe updates, and
project-specific guidance management.

### Existing Method: Copy Into a Project

The repository is public, so installation requires no authentication. You need curl,
Git, Bash, and **Node.js 22 or later** for execution after installation.
Specify an existing target repository.

```bash
set -o pipefail
curl -fsSL 'https://raw.githubusercontent.com/HakjunMIN/ai-native-harness/main/install.sh' |
  bash -s -- /absolute/path/to/target-repo
```

For alternatives to executing a remote script directly and host-specific configuration,
see [Installation](docs/install.md). For permission and hook limitations, see
[Compatibility](docs/compatibility.md). Rerunning the command updates managed files
inside the project. User-modified managed files and shared-link installations are not
overwritten automatically.

## Getting Started

### Per-Ticket Skill Revisions

**Share the installation, but pin the execution baseline per ticket.** Both shared and
copy installations create `docs/sdlc/<ID>/harness.lock.json` and bind its hash in
`state.json`. This does not pin one version for the entire service repository.
The lock records each asset's **content SHA256** and source commit when available.
It includes uncommitted changes, so a commit ID alone may not reproduce the assets.

When you start through `sdlc`, the agent creates state and a lock for a new Jira task.
Local natural-language tasks receive a lock automatically during intake. The agent
also verifies the existing revision and state on resumption, so **you do not need to
run separate commands manually**.

> [!NOTE]
> Optional commands for manual execution and inspection
>
> These examples are not mandatory workflow prerequisites. Use them when creating,
> resuming, or inspecting a task yourself. Run them from the target service repository
> root; the commands are the same in Bash and PowerShell.
>
> ```sh
> node .ai-native-sdlc/scripts/harness.mjs start ABC-123
> node .ai-native-sdlc/scripts/harness.mjs resolve docs/sdlc/ABC-123/state.json
> node .ai-native-sdlc/scripts/state.mjs check docs/sdlc/ABC-123/state.json
> ```
>
> Run the first command only for a new Jira task. For existing tasks, start with
> `resolve`. Do not also run `start` for a local natural-language task. Only the user's
> manual execution is optional; the Node.js runtime and the agent's internal script
> execution are required.

Creation preserves the installed assets as they are. It does not automatically pull
the remote harness, query or synchronize Jira, or grant human approvals.
For existing work, start with `resolve` and read skills, roles, and templates under
the returned `root`. State-related commands in `state.mjs` automatically delegate to
that ticket's snapshot validator.

Sub tasks and subagents inherit the parent conductor's lock and original state path.
Shared links do not change when switching tickets. Current shared safety hooks and
project security instructions are never rolled back to an older snapshot.

| Operation | Command and conditions |
|---|---|
| Resume | `resolve STATE`: verify lock and cache integrity. Stop on missing or mismatched assets; do not substitute the latest version. |
| Recover cache | `restore STATE --source PATH`: requires the exact previous assets or a local Git source containing that commit. Does not fetch remotely. |
| First adoption for older work | `adopt STATE --reason "reason" --confirm`: explicitly apply the current baseline to work without a lock. |
| Change an active baseline | `upgrade STATE --reason "reason" --confirm`: use the installed version by default, or select another source with `--source PATH`. |

Append these commands to `node .ai-native-sdlc/scripts/harness.mjs`.
`STATE` is the ticket's state file path. `adopt` and `upgrade` preserve earlier state
and locks in `harness-history/` and reset **all gates for revalidation starting at G0**.
`--confirm` confirms the version change, not gate approval. Completed tasks are not
changed. If an integration branch already exists, commit the reapproved plan, preserve
and clean up earlier workspaces, then resume with `workspaces.mjs reconcile STATE`.
Follow the [Branch and worktree procedure](docs/operations.md#브랜치와-병렬-워크트리).

Snapshots live in `.ai-native-sdlc-revisions/<SHA256>/`. Shared installations keep the
cache next to the actual harness clone for reuse across services. Copy installations
keep it inside each service repository. **Commit locks, state, and task history
together; exclude the cache.** Do not delete or edit referenced caches arbitrarily.
Preserve recovery sources for snapshots created from uncommitted assets.

When working with Windows, add this rule to the target service's existing
`.gitattributes` to preserve line endings for new locks and evidence. The harness
repository's settings do not automatically apply to services. Do not rewrite line
endings or hashes of historical evidence.

```gitattributes
docs/sdlc/** text=auto eol=lf
```

For recovery procedures, PowerShell examples, and limitations, see
[Ticket revisions](skills/sdlc/references/harness-revisions.md).

### Start a Workflow

Run **`sdlc-setup` once initially** in the target repository to confirm and configure
module paths, test commands, models, and the locations and owners of shared standards
and ADRs. Then start with a Jira key or a natural-language request. Tokens are not
stored in configuration.

```text
sdlc-setup

sdlc ABC-123
or
sdlc Improve the empty state of the document search screen
```

- Jira requires an authenticated Atlassian Rovo MCP connection. Light mode uses the
  parent issue; strict mode creates child tickets after G2 approval.
- Local tasks ask only necessary questions and record the original request and
  answers in `intake.md`. They need no Jira, but use the same human approvals and
  verification criteria.
- To resume, use `sdlc` to list saved work and `sdlc <ID>` to continue. Artifacts and
  state are stored in `docs/sdlc/<ID>/`.

### Discovery Questions and Approval

The agent first investigates what it can establish from code, existing answers, and
project standards. It batches only decisions that prevent safe progress without an
answer now. Human-owned decisions that can be drafted become recommendations at G1.
Reversible, low-risk implementation choices are recorded with their rationale.
There may be no preliminary questions.

At G1, chat shows the goal, scope and exclusions, a small Mermaid behavior diagram,
and a summary of AC, decisions, and risks instead of a long list of document paths.
Detailed evidence stays in the same discovery document, connected by IDs.
Ordinary recommendations and approval share a form; high-risk choices require
individual confirmation from the decision owner. Checks block mismatched IDs or
statuses, omissions, and unresolved decisions. Approval binds to the whole document's
hash.

```sh
node .ai-native-sdlc/scripts/state.mjs discovery docs/sdlc/ABC-123/state.json
node .ai-native-sdlc/scripts/state.mjs discovery docs/sdlc/ABC-123/state.json --text
```

These commands are read-only. Use the text summary on hosts without Mermaid support.
Existing runs retain their pinned revision and do not upgrade automatically.
See the [Approval example](examples/ABC-123/01-discovery.md),
[format and question criteria](skills/sdlc/references/discovery-review.md), and
[operating procedure](docs/operations.md#discovery-승인-요약).

### Track Progress in Chat

For status requests, session resumption, phase changes, approval waits, blockers,
and completion, the agent shows a concise Mermaid progress diagram with the task ID
in chat. It distinguishes completed, current, pending, awaiting approval, and blocked
states, and reports sub task counts and the next action. `sdlc` summarizes saved work;
it does not query the host's live session list.

Manual inspection does not change files or approval state:

```sh
node .ai-native-sdlc/scripts/state.mjs progress docs/sdlc/ABC-123/state.json
node .ai-native-sdlc/scripts/state.mjs progress docs/sdlc/ABC-123/state.json --text
```

Use `--text` without Mermaid support. Completion depends on saved gates and evidence
validation. Validation failures, including evidence mismatches, show `BLOCKED` and an
error and exit with a failure code. A current-phase marker does not mean a worker is
running. A completed research spike is distinct from completed implementation or
deployment. The summary does not replace approval, state checks, or project baseline
change checks. If an older pinned revision lacks the command, the agent reports that
revision's validation results as text rather than changing the execution baseline
automatically to display progress.

### Sub Tasks and Parallel Execution

**A sub task is an execution unit with AC, scope, and dependencies; a Jira ticket is
a remote issue.** Large tickets or requests become multiple sub tasks. Small work
uses one. `sdlc-subtasks` defines sub tasks and handles Jira issuance when required;
the name does not mandate a particular Jira issue type. Local tasks create no Jira
issues. Jira light uses the parent ticket; Jira strict and legacy create child tickets
only after approval.

A single sub task runs on the current checkout's branch. Independent parallel sub
tasks run in separate Git worktrees and undergo integration verification afterward.
Backend tests use JUnit for Spring or Go `testing`; frontend E2E uses Gherkin.

For compatibility, `tasks`, `taskPlan`, `slices`, `tasks.json`, `tasks/`, and
`tasks.mjs` commands remain. See the
[Sub task contract](skills/sdlc-subtasks/references/sub-task-contract.md).

### PR Bodies and Retrospectives

**Use `pr` to explain a reviewed diff, and `retro` to turn difficult execution into
environment improvements.** The flow is:
`... -> sdlc-verify (G4 final review) -> sdlc-release (pr) -> done -> retro (human-invoked)`.

- `pr` writes release, GitOps promotion, and operational proposal PR bodies using
  Summary (the smallest useful visualization), Evidence (before-and-after execution),
  Merge Danger (one-way or two-way door and blast radius), and Traceability. Risk
  cannot be rated below the approved plan's risk record. It writes the body only;
  it does not push or merge.
- `retro` runs only when explicitly invoked by the user. It identifies actual
  friction in the session and `docs/sdlc/<ID>/` records and proposes improvements
  by severity. Mechanical violations go to automated checks; judgment-based rules
  go to project standards with `Enforcement: review`. `AGENTS.md` holds discovery
  pointers only. No separate retrospective report is created. Only accepted changes
  persist in standards or checks after owner approval.

### Manually Audit Unused Code and Skills

[prune-unused](skills/prune-unused/SKILL.md) is a human-invoked cleanup skill.
You can run it periodically, such as monthly or around releases, but it is not
registered with a scheduler, CI, or an automatic SDLC phase. The default is a
read-only audit.

```text
prune-unused: Audit unused code and skills in this repository; report candidates with evidence and risk.
```

The audit checks not only calls and imports, but also public APIs, dynamic loading,
CLI and configuration entrypoints, and direct invocation and discovery of skills.
Missing references or usage records alone do not justify deletion. It reports
candidate IDs, evidence, risk, associated changes, and a verification plan, then
cleans up only what a person selects. Each new run checks current code and usage
evidence rather than reusing earlier approval.

Shared installation links, ticket snapshots, historical evidence, and other people's
uncommitted changes are preserved. Reports go to chat by default. The skill does not
automatically commit or push.

## Project Baselines and ADRs

**Standards define current rules; ADRs explain why a decision was made.** Decisions
affecting multiple features belong at project level, with feature plans referencing
them. Shared boundaries such as authentication, tenancy, and shared APIs require
project ADRs even when introduced by the first feature.

Prefer the target project's existing documentation locations. Without an established
convention, use this structure. Create only necessary documents in the target project,
not inside the installed harness.

```text
AGENTS.md                         # Actual documentation locations and reading rules
docs/
  architecture/
    overview.md                   # Current system boundaries and dependencies
    adr/
      README.md                   # Shared decisions, status, and owners
      ADR-0001-<decision>.md       # Rationale, alternatives, and approval
  standards/
    README.md                     # Standards index and scope
    <topic>.md                    # Current rules and verification methods
  sdlc/
    <ID>/
      state.json                  # Progress state and lock hash
      harness.lock.json           # Per-ticket harness content revision
      02-plan.md                  # Baseline references and feature design
      adr/<feature-decision>.md   # Feature-only decisions when needed
```

Discovery identifies applicable standards and conflicts. The plan's `Project baseline`
records document paths, sections, and baseline commits. Uncommitted documents use
their content hash. Implementation, review, verification, and resumption check changes
since that baseline and the validity of exceptions. Release and handoff communicate
shared decision changes and remaining migration obligations.

- Reference shared rules instead of copying them into each feature. Record ordinary
  implementation choices in the plan.
- Shared changes and temporary exceptions require explicit approval from their owner.
  Feature-level G2 approval cannot substitute for it.
- Promote feature decisions to project ADRs when they become shared, linking the
  original task. When replacing a decision, update the `superseded` relationship and
  current standards while preserving historical evidence.
- Record each standard's scope, status, owner, source, and enforcement method:
  `check: <automated check>` or `review`. Register existing `CODING_STANDARDS.md` and
  `CONTRIBUTING.md` in the standards index rather than creating replacements.
  `retro` proposals start as `proposed` and take effect after owner approval.

The installer does not create empty standards or ADRs. After updating an existing
installation, use `sdlc-setup` to connect project guidance and review changes to
existing `AGENTS.md` as a diff rather than overwriting it.
**Checking shared document changes is a skill procedure; the state validator does
not detect them automatically.** Record comparisons in the task's internal report
and connect them to existing gate evidence.

Details: [Project governance](skills/sdlc/references/project-governance.md).

## Safety Boundaries

**v1 hooks conservatively block `git push`, `gh pr merge`, and direct cluster changes.**
A neutral hook response to local `git merge` is not execution permission. Under user
authorization and project protection rules, only the conductor integrates reviewed
source work into an integration branch. Worker and release roles do not merge directly.
People publish branches and promote dev or staging. Agents write production change
proposals only under `production-proposal/`; people change actual production values,
merge, and synchronize ArgoCD.

Hooks and role-specific path restrictions are **not a security sandbox**.
GitHub branch protection, required CI, and ArgoCD production RBAC are still required.
If required verification or review is unavailable, the task is blocked, not passed.

## Further Reading

The linked guides retain their existing language.

| Resource | Coverage |
|---|---|
| [Installation](docs/install.md) | Shared microservice and copy installations, Bash/PowerShell, updates, and conflicts. |
| [Ticket revisions](skills/sdlc/references/harness-revisions.md) | Per-ticket locks, caches, resumption, recovery, explicit version changes, and inheritance. |
| [Customer repository discovery](docs/customer-repository-discovery.md) | Interview questions, artifact templates, tool and permission discovery, process mapping, and pilot criteria. |
| [Operations](docs/operations.md) | Light/strict policy, approvals, resumption, parallel worktrees, and existing state migration. |
| [Project governance](skills/sdlc/references/project-governance.md) | Shared standards and ADRs, baseline versions, approvals, exceptions, promotion, supersession, and impact checks. |
| [Sub task example](examples/ABC-123/README.md) | Plans, sub tasks, and evidence artifact structure. |
| [Technical skills](skills/) | Independently usable stack-specific development, testing, and operational guidance. |
| [Prune Unused](skills/prune-unused/SKILL.md) | Human-invoked unused code and skill audits. Only selected candidates are cleaned up and verified after evidence review and approval. |
| [SigNoz OSS](skills/signoz-oss/SKILL.md) and [ClickStack](skills/clickstack/SKILL.md) | Self-hosted operations and optional alternative evaluation. ClickStack is not a required dependency and is not installed or migrated to automatically. |
| [Mimir OSS](skills/mimir-oss/SKILL.md) and [Prometheus Query API](skills/prometheus-query-api/SKILL.md) | Metrics storage and query-service evaluation, operations, PromQL, and BFF query contracts. No operational migration without an approved decision. |
| [Go Backend](skills/go-backend/SKILL.md) and [Go Testing](skills/go-testing/SKILL.md) | Go BFF/backend implementation and `go test` evidence. [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang) is a non-authoritative checklist retrieved during a task, not authorization to change dependencies or the Go version. |

## Package Development

```bash
npm test
npm run validate
```

These commands validate the package without external services. They do not replace
target-service tests or actual Jira/ArgoCD connectivity checks. When changing skills,
also run the [Pressure scenarios](tests/scenarios/pressure.md).