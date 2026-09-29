# ai-native-sdlc Implementation Plan

> 초기 구현의 이력 문서입니다. 현재 규범은 [통합 설계 명세](../specs/2026-09-28-ai-native-sdlc-design.md)와
> [위험 기반 변경 계획](2026-09-28-risk-based-workflow.md)을 따릅니다. 아래 과거 지시를 추가 정책으로 적용하지 않습니다.

**Goal:** Jira 기반 SDLC를 개별 스킬과 컨덕터로 실행하는 로컬 플러그인 제공.

**Architecture:** 공통 스킬과 상태/핸드오프 계약을 공유한다. Node 표준 라이브러리로 상태 검사, 훅, 비주얼 컴패니언을 구현하고 하네스 어댑터는 별도로 둔다.

**Tech Stack:** Markdown, JSON, Node.js 22+, Bash, node:test.

**Spec:** `docs/specs/2026-09-28-ai-native-sdlc-design.md`

**상태:** 구현 완료. 새 checkout 대신 현재 디렉터리의 `feat/ai-native-sdlc`
브랜치에서 작업했다. 공통 agent 프로필을 두 하네스가 읽도록 구성하여 별도
복제 adapter는 만들지 않았다. 훅은 Copilot/Claude 형식을 분리했다.

## Global Constraints

- 스킬/에이전트 지침은 영어, 사용자 문서는 한국어.
- BFF → SigNoz query-service 경계 유지. 백엔드 Gherkin 없음.
- 로컬 서브에이전트만 사용. 모델 ID는 확인된 사용자 설정에서만 선택.
- G1/G2/G5b 사람 승인. prod PR 작성은 가능하지만 merge/sync는 금지.
- 지침·로컬 훅·state.json은 보안 경계가 아니다. 실제 권한은 GitHub/ArgoCD RBAC로 제한한다.
- 다른 하네스에서 모델 라우팅이 불가능하면 교차 모델 게이트는 BLOCKED. 조용히 같은 모델로 대체하지 않는다.
- 원본 코드 복사 없이 독립 작성. 도구 제작 경위를 제품 문서에 넣지 않는다.

## 작업 1: 상태 계약과 검증기

**Files:** `scripts/state.mjs`, `tests/state.test.mjs`, `templates/state.json`, `templates/ai-native-sdlc.config.json`, `skills/sdlc/references/protocol.md`

**Interfaces:** `validateState(state, root)`는 오류 배열을 반환한다. `nextPhase(state)`는 첫 미통과 게이트의 단계 또는 `done`을 반환한다. CLI: `node scripts/state.mjs check|next|invalidate <state.json> [gate reason]`.

- [x] 테스트: 누락 선행 게이트, 위조 형태 승인, 빈 슬라이스, 없는 증거 파일, 오래된 SHA256, 잘못된 상태/경로를 거부한다.
- [x] RED: `node --test tests/state.test.mjs`에서 검증기 부재 확인.
- [x] 구현: 명시적 게이트 순서, 사람 승인 record, 증거 SHA256, 하류 무효화, atomic write. 실행 결과는 직접 기록하고 거짓 증거를 생성하지 않는다.
- [x] GREEN: 같은 명령으로 실행한다.

```js
assert.notEqual(nextPhase({gates: {}}), 'done');
assert.ok(validateState({ticket: '../bad'}, root).length > 0);
```

## 작업 2: 스킬 및 에이전트 패키지

**Files:** `skills/*/SKILL.md` (설계 카탈로그 27개), `agents/*.agent.md` (9개), `plugin.json`, `.claude-plugin/{plugin,marketplace}.json`, `.codex-plugin/plugin.json`, `adapters/claude/agents/*.md`

**Interfaces:** 모든 단계는 protocol을 읽고 `check` 이후 `next` 결과와 대조. 에이전트 입력과 출력은 `templates/handoff.md` 계약. 일반 이름 충돌 시 현재 플러그인의 파일 경로를 명시한다.

- [x] RED: no-guidance 시나리오 28개 실행. 관측한 차이: 같은 계열 리뷰 허용, 테스트 수정 허용, 승인된 prod merge 허용, HTML 승격 허용.
- [x] 각 스킬을 이 차이와 기술별 경계에 맞게 작성한다.
- [x] 모델 미지원은 BLOCKED, 편집 경로는 지침+diff 감사이지 OS sandbox가 아님을 명시한다.
- [x] GREEN: 시나리오 simulation과 UI happy-path 점검 후 발견한 phase-cycle 수정.
- [x] 패키지 검증: `node scripts/validate.mjs`로 frontmatter, 참조, 매니페스트 경로, 에이전트 수 확인.

## 작업 3: 하네스 훅과 비주얼 컴패니언

**Files:** `hooks/{hooks.json,claude.json,session-start.sh,gate-guard.sh,guard.mjs,session.mjs}`, `scripts/visual-server.mjs`, `tests/{hooks,visual}.test.mjs`, `skills/visual-companion/templates/index.html`

**Interfaces:** Copilot hook stdin camelCase와 Claude snake_case를 어댑트한다. 출력은 해당 하네스의 allow/deny JSON이다. 비주얼 서버 `node scripts/visual-server.mjs <prototype-dir> [port]`는 loopback에만 bind, 선택을 `selection.json`에 기록한다.

- [x] RED: hook payload, protected push/merge, prod write/sync, malformed 입력; 서버의 traversal/symlink/Origin 거부, 선택 저장을 테스트한다.
- [x] 구현: 일반적인 위험 명령을 보수적으로 차단하고 임의 shell 우회 방지 보장을 하지 않는다. prod 변경안은 별도 proposal 파일로만 작성한다.
- [x] 비주얼 HTML은 로컬 mock만 사용하며 선택을 승인으로 취급하지 않는다.
- [x] GREEN: `node --test tests/hooks.test.mjs tests/visual.test.mjs`.

## 작업 4: 설치, 예시, 회귀 검증

**Files:** `README.md`, `docs/{compatibility,operations}.md`, `examples/ABC-123/**`, `tests/scenarios/pressure.md`, `scripts/{validate.mjs,validate.sh}`, `.github/workflows/validate.yml`, `package.json`

**Interfaces:** `npm test`는 외부 서비스 없이 node:test, `npm run validate`는 패키지 검증. 실제 Grafana/Gradle/Atlassian 연결 검증은 대상 모노레포에서 setup 후 별도 수행한다.

- [x] RED: 누락 스킬/깨진 link/잘못된 매니페스트를 validator가 거부하는 테스트.
- [x] 예시 티켓은 simulation으로 표시하고 prod는 pending으로 유지한다. 로그/승인/배포를 실제 실행처럼 꾸미지 않는다.
- [x] README에 세 하네스 설치, setup, 단독/컨덕터 실행, 재개, 승인/증거 무효화, Jira outbox, 배포 RBAC 설명.
- [x] `npm test && npm run validate && git diff --check` 수행.
- [x] 독립 리뷰의 유효 지적을 회귀 테스트로 재현하고 수정. 외부 push/배포 없음.
