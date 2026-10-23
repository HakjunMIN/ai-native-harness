import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const discovery = `---
description: "Synthetic discovery for automated tests, not human approval"
---

# Test discovery

## Approval summary

### Goal

Make the requested behavior understandable.

### Scope

One bounded outcome.

### Non-goals

Deployment and unrelated behavior.

### Behavior

\`\`\`mermaid
flowchart TD
    request["Request"] --> result["@AC-1 Expected result"]
\`\`\`

### Review

| ID | Status | Summary |
|---|---|---|
| AC-1 | defined | The expected result is observable. |

### Approval

Approve these requirements, not implementation or deployment.

## Acceptance criteria

| ID | Criterion | Verification |
|---|---|---|
| AC-1 | The expected result is observable. | Focused behavior test |

## Decisions

| ID | Timing | Impact | Status | Choice | Owner | Evidence |
|---|---|---|---|---|---|---|

## Risks

| ID | Risk | Mitigation | Decision |
|---|---|---|---|

## Context and evidence

Detailed test-only rationale, not part of the compact review.
`;

export function bindDiscovery(root, state, body = discovery) {
  writeFileSync(join(root, '01-discovery.md'), body);
  const evidence = {path:'01-discovery.md',sha256:createHash('sha256').update(body).digest('hex')};
  state.gates.G1.evidence = [evidence];
  return evidence;
}

export function withDecision({timing = 'g1', impact = 'standard', status = 'recommended',
  choice = 'Show no data instead of zero', evidence = '-', id = 'D-1'} = {}) {
  return discovery
    .replace('| AC-1 | defined |', `| ${id} | ${status} | ${choice}; owner: Product owner. |\n| AC-1 | defined |`)
    .replace('|---|---|---|---|---|---|---|\n',
      `|---|---|---|---|---|---|---|\n| ${id} | ${timing} | ${impact} | ${status} | ${choice} | Product owner | ${evidence} |\n`);
}
