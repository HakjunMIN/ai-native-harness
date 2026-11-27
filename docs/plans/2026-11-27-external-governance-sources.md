# External Governance Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow this repository's maintainer workflow and approval boundaries.

**Goal:** SDLC로 시작하든 기술 스킬을 직접 호출하든, 프로젝트 범위에서 승인된 같은 결정을 찾아 같은 결과물에 적용한다.

**Architecture:** 프로젝트의 기존 표준 색인에 공식 출처와 관할 범위를 등록한다. 결정 판정 절차는 `project-governance.md`에 한 번만 정의한다. SDLC는 계획의 기준선을, 단독 호출은 첫 담당 스킬이 선별한 근거를 하위 작업에 전달한다.

**Tech Stack:** 기존 Markdown 스킬·참조·템플릿, Node.js 22+ `node:test`, 인가된 호스트의 읽기 도구. 새 서비스·패키지 없음.

**Spec:** [기존 업무 시스템의 승인된 결정 적용](../specs/2026-11-27-external-governance-sources-design.md)

## Global Constraints

- 공식 출처의 명시적 승인과 적용 범위를 확인하면 재승인하지 않는다. 등록 자체, 최신 메시지, 이모지, Jira `Done`은 승인이 아니다.
- Confluence, Slack, Jira는 이 기능에서 읽기 전용이다. 신규 커넥터·검색 서버·토큰·자동 설치·권한 요청·Jira 쓰기 없음.
- 조회와 공유 권한을 분리한다. 저장·전달 가능한 최소 근거만 사용하고, 조회를 제한할 수 없으면 허용 범위 밖으로 검색하지 않는다.
- 기존 상태/설정/게이트 스키마와 고정 티켓은 변경하지 않는다. 단독 호출은 티켓·게이트를 만들지 않는다. 원격 주소는 run-local 게이트 증거 파일이 아니다.
- 구현 전 격리된 하네스 소스 체크아웃과 계획 승인을 확인한다. 설치본·소비 프로젝트·기존 티켓 수정, 커밋·푸시·배포는 별도 허가 없이는 하지 않는다.

## Review Focus

1. 공식 공간에 게시됐지만 소유자가 승인하지 않은 메시지: 정책으로 적용하지 않는다 (Task 1).
2. 원문 열람은 가능하지만 저장소 독자에게는 비공개: 제목·식별자·요약까지 전달하지 않는다 (Task 1).
3. 등록한 공간의 링크가 다른 공간을 가리키거나 검색 도구가 범위를 제한하지 못함: 광역 검색·무단 열람 없이 의존 작업만 보류한다 (Task 1).
4. `go-backend`가 `api-contract`를 하위 호출: 같은 근거를 중복 조회하지 않고 범위가 달라질 때만 담당자에게 반환한다 (Task 2).
5. 판본이 없는 원문의 편집 또는 읽기 권한 회수: 저장된 해시를 현재 승인으로 오인하지 않고 실질 변경·무관한 편집·확인 불가를 구분한다 (Task 3).

---

### Task 1: 공식 출처 등록과 판정

**Files:** `skills/sdlc/references/project-governance.md` (판정 원본), `skills/sdlc-setup/SKILL.md` §8 및 `templates/project-AGENTS.md` (등록·탐색), `docs/customer-repository-discovery.md` (도입 안내), `tests/package.test.mjs`, `tests/scenarios/pressure.md`.

**Interfaces:** 입력은 `source ID | allowed scope | applicability | decision owner | accepted approval record | registration evidence` 색인 행과 실제 원문. 결과는 `applicable`(현재 적용), `context only`(논의·범위 밖), `unresolved`(필수 근거 미확인·충돌) 중 하나와 독자에게 공개 가능한 근거. 이는 문서상 분류이며 상태 enum이 아니다.

- [ ] 격리된 프로젝트에서 합성 자료로 기존 릴리스의 setup·discovery 동작을 관찰한다. Confluence `DEP-1` 승인 규칙, Slack의 동의 반응만 있는 생략 제안, Jira의 이전 릴리스 예외를 제시한다. 실제 선택과 누락을 기록하고 실패를 가정하지 않는다.
- [ ] `tests/package.test.mjs`에 계약 연결 테스트 `external governance source registration`을 추가한다. 프로젝트 표준 색인을 유일한 진입점으로 유지하고 setup과 설치 안내가 같은 판정 원본에 연결되는지 확인한다. 아래 핵심 검사를 추가한 뒤 `node --test --test-name-pattern='external governance source registration' tests/package.test.mjs`로 기존 릴리스의 누락 지점에서 실패하는지 확인한다.

  ```js
  const gov = readFileSync('skills/sdlc/references/project-governance.md', 'utf8');
  assert.match(gov, /^## External governance sources$/m);
  assert.match(gov, /registration evidence/i);
  ```

- [ ] `## External governance sources`에서 행 형식과 판정 절차를 정의한다. 공간 등록과 개별 결정 승인을 구분하고, 등록 소유자 확인 전에는 후보로만 둔다. setup은 후보와 변경안을 만들며 비어 있는 색인을 강제하지 않는다. 기존 설치의 `AGENTS.md` 심볼릭 링크 안전 절차를 유지한다. 고객 안내에서 ‘Jira 티켓 연동’과 ‘선택적 Jira 정책 읽기’를 구분한다.
- [ ] 같은 사례에서 `DEP-1`만 적용되는지 관찰한다. 이어서 지정 Slack 채널의 유효한 소유자 승인은 적용, 외부 공간 링크와 범위 없는 검색은 미실행, 비공개 식별자는 하위 인계와 산출물에 없음, 필수 근거 미확인 시 독립 작업은 계속됨을 각각 확인한다. 테스트를 재실행해 PASS를 확인한다.

### Task 2: 공통 진입점과 단독 호출

**Files:** `skills/sdlc/references/principles.md`, `skills/sdlc/references/protocol.md`, `tests/package.test.mjs`, `tests/scenarios/pressure.md`. `skills/go-backend/SKILL.md`, `skills/api-contract/SKILL.md`, `skills/code-review/SKILL.md`는 대표 호출 경로다. 공통 진입점으로 연결된 스킬에 같은 절차를 복사하지 않는다.

**Interfaces:** Task 1의 판정 결과 → `rule and scope | source and revision | approved exception | sharing limit` 작업 근거. 단독 호출은 응답 또는 원래 요청한 산출물에, SDLC는 기존 인계에 전달한다. 새 영구 캐시나 스킬 API는 없다.

- [ ] `standalone governance entrypoints` 테스트에 아래 검사를 넣고 `node --test --test-name-pattern='standalone governance entrypoints' tests/package.test.mjs`로 실행한다. 단순히 37이라는 개수를 확인하지 말고 실제 진입 경로를 확인한다.

  ```js
  const read = path => readFileSync(path, 'utf8');
  for (const name of readdirSync('skills')) {
    assert.match(read(`skills/${name}/SKILL.md`), /references\/(?:principles|protocol)\.md/, name);
  }
  for (const doc of ['principles', 'protocol']) {
    assert.match(read(`skills/sdlc/references/${doc}.md`), /\]\(project-governance\.md\)/);
  }
  ```

- [ ] `principles.md`에 프로젝트 결과물을 만들거나 검토하는 경우의 역할 분기를 추가한다. SDLC 담당자는 인계된 기준선을 사용하고 단독 호출의 첫 담당자는 표준 색인에서 해당 범위만 확인한다. 같은 범위·권한의 하위 스킬은 재조회하지 않는다. 새 범위·상충 근거는 담당자에게 반환한다. `protocol.md`의 단계 담당자 안내와 연결한다. 공개 기술 문서 조회 의무와 독립 실행 경계를 유지한다.
- [ ] 합성 공식 규칙 `API-7`(목록 응답에서 결과가 없으면 `[]`, `null` 금지)을 같은 Go API 변경에 적용한다. `go-backend` 단독과 SDLC 인계 양쪽에서 같은 판본과 실제 응답 계약을 확인한다. 단독 `code-review`에 `null`을 반환하는 변경을 주면 위반을 지적해야 한다. 호출 기록에서 하위 `api-contract`의 중복 조회, 단독 실행의 상태 생성, 단순 공개 사용법 질문의 사내 조회가 없어야 한다. 정적 테스트도 재실행해 PASS를 확인한다.

### Task 3: 계획 기준선·변경 감지·호환성

**Files:** `skills/sdlc/references/project-governance.md` §SDLC integration, `skills/sdlc-discover/SKILL.md`, `skills/sdlc-plan/SKILL.md`, `skills/sdlc-implement/SKILL.md`, `skills/sdlc-verify/SKILL.md`, `skills/code-review/SKILL.md`, `skills/sdlc-handoff/SKILL.md`, `skills/sdlc-release/SKILL.md`, `templates/handoff.md`, `tests/package.test.mjs`, `tests/scenarios/pressure.md`. 기존 회귀: `tests/harness-revision.test.mjs`.

**Interfaces:** Task 2 근거 → 기존 `02-plan.md` Project baseline 및 인계. 로컬 규칙은 기존 Git commit/SHA 표현을 유지한다. 외부 행은 출처 ID·결정 참조, 적용 범위·승인자/승인 근거, UTC 조회 시각, 원격 판본 또는 내용 SHA256을 기록한다.

- [ ] 기존 패키지 테스트 근처에 `external decision baseline handoff`를 추가한다. `templates/handoff.md`에 `assert.match(handoff, /external decision reference/i)`와 `assert.match(handoff, /revision or content SHA256/i)`를 적용한다. `node --test --test-name-pattern='external decision baseline handoff' tests/package.test.mjs`에서 기존 누락으로 실패하는지 확인한다.
- [ ] Discovery에는 현재 적용 규칙·충돌을, 계획에는 외부 기준선 행을, 검토·재개·인계에는 비교 결과와 만료 예외를 남기도록 연결한다. 판본이 없을 때는 공개 가능한 동일 필드 배열 `[rule, scope, owner, approval, status, expiryOrExit]`를 같은 순서·UTF-8 JSON으로 표현하고 SHA256을 비교한다(없는 선택 필드는 `null`, 판정 필수값 누락은 `unresolved`). 근거를 안전하게 식별할 수 없으면 해시로 공개 제한을 우회하지 않는다. 요구사항/G1, 계획·정책/G2 영향 판정은 기존 절차를 사용하고 승인된 계획을 직접 수정하지 않는다.
- [ ] 모의 원문을 순서대로 제공한다: 승인 시 `API-7` → 무관한 다른 절 수정 → 적용 응답 규칙 대체 → 권한 회수. 각각 기준선 기록 → 영향 없음 → 해당 계획 재승인 → 의존 작업 보류를 보여야 한다. 출처 미등록 로컬 프로젝트에는 새 조회·Jira outbox·상태 필드가 없어야 한다.
- [ ] `node --test tests/package.test.mjs tests/harness-revision.test.mjs`, `npm run validate`, `git diff --check`를 실행한다. 유지 중인 구 릴리스 fixture에서 start/resolve/resume/restore가 원래 스냅샷을 사용하고, 구 티켓 계획을 고쳐 쓰지 않는지 별도 확인한다. fixture 미확보는 호환성 미확인으로 기록한다.
- [ ] 격리된 소비 프로젝트에서 Copilot CLI·Claude Code·Codex별로 설치/발견, 프로젝트 작업에서의 선택과 공개질문의 비선택, 위 사례의 결과를 구분해 기록한다. 모의 조회 결과를 실제 Slack/Atlassian 연동 성공으로 보고하지 않는다. 허가·도구가 없는 호스트는 미검증이다. 롤백은 새 실행의 하네스 참조를 기존 릴리스로 복귀시키는 방식이며 기존 티켓 잠금·승인 이력은 변경하지 않는다. 별도 배포 승인 전에는 소비자 환경에 적용하지 않는다.
