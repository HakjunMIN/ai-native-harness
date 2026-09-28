# ai-native-sdlc 설계 문서

- 작성일: 2026-09-28
- 상태: 승인됨 (설계 리뷰 완료)
- 대상: SigNoz 커스터마이징 Observability 플랫폼 모노레포

## 1. 목적

Jira 티켓 하나를 입력으로 받아 **Discovery → Plan → Implement → Verify → Release** 단계를 AI 에이전트가 사람과 협업하며 진행하는 스킬 워크플로우를 GitHub Copilot CLI 플러그인으로 제공한다.

핵심 원칙:

1. **사람이 통제권을 갖는다** — 각 단계는 단독 호출 가능하고, 단계 사이에 게이트가 있다.
2. **테스트가 먼저다** — 프론트엔드는 BDD(Gherkin E2E) + TDD, 백엔드는 TDD(JUnit 유닛/통합/API 테스트). 백엔드에는 Gherkin을 쓰지 않는다.
3. **화면으로 먼저 합의한다** — UI 변경은 비주얼 컴패니언과 프로토타입으로 합의 후 구현한다.
4. **증거 없이는 완료가 없다** — 모든 게이트 통과는 명령 실행 결과로 증명한다.
5. **작성자와 다른 계열 모델이 리뷰한다** — 교차 모델 리뷰.

## 2. 대상 시스템

| 영역 | 기술 |
|---|---|
| 레포 | 모노레포 (backend + frontend + plugins) |
| 백엔드 | Java Spring Boot (Gradle), **BFF 역할**: Grafana 플러그인 → Spring BFF → SigNoz Go query-service |
| 쿼리 엔진 | SigNoz Go query-service (업스트림 활용, 가끔 패치), ClickHouse는 query-service 뒤에만 존재 (BFF 직접 접근 없음) |
| 프론트엔드 | Grafana 플러그인 (datasource / panel / app), React + TypeScript |
| SigNoz UI | 사용자에게 노출하지 않음 |
| CI | GitHub Actions |
| 배포 | Kubernetes + Helm + ArgoCD (GitOps), dev → staging → prod |
| 이슈 트래커 | Jira (Atlassian Rovo MCP 서버) |

## 3. 배포 형태

- **Copilot CLI 플러그인** (레거시 매니페스트 형식, `plugin.json` 루트) 이름: `ai-native-sdlc`
- Claude Code (`.claude-plugin/plugin.json`), Codex (`.codex-plugin/plugin.json`) 매니페스트도 제공 — `SKILL.md` 표준 준수로 세 하네스에서 동일 스킬 동작.
- 스킬 본문은 **영어**, 생성되는 산출물 문서(스펙, 플랜, 리포트, Jira 코멘트)는 **한국어**.

## 4. 패키지 구조

```
ai-native-sdlc/
  plugin.json
  .claude-plugin/plugin.json
  .claude-plugin/marketplace.json
  .codex-plugin/plugin.json
  hooks/hooks.json
  hooks/session-start.sh          # 부트스트랩: sdlc 스킬 존재 안내 + 진행 중 티켓 요약
  hooks/gate-guard.sh             # PreToolUse: 보호 브랜치 push/merge, prod 변경 차단
  agents/*.agent.md
  skills/<name>/SKILL.md (+ references/, templates/, scripts/)
  templates/ai-native-sdlc.config.json
  scripts/validate.sh
  tests/scenarios/*.md
  examples/ABC-123/...
  README.md
```

## 5. 스킬 카탈로그

스킬은 두 종류로 나눈다.

- **User-invoked (오케스트레이션)**: 사용자가 `/이름`으로 호출. 다른 user-invoked 스킬을 직접 호출하지 않는다 (예외: 컨덕터 `sdlc`는 단계 스킬로 라우팅).
- **Model-invoked (규율/기술)**: 에이전트가 필요 시 자동으로 로드. 재사용 가능한 규율과 지식.

### 5.1 오케스트레이션 스킬 (user-invoked)

| 스킬 | 역할 |
|---|---|
| `sdlc` | 컨덕터. `docs/sdlc/<KEY>/state.json`을 읽어 현재 단계/게이트 상태를 보고하고 다음 단계 스킬로 라우팅. 인자 없으면 진행 중 티켓 목록 표시. |
| `sdlc-setup` | 레포당 1회. Jira 프로젝트 키, 상태 매핑, 모듈 맵(경로 ↔ 컴포넌트), 빌드/테스트 명령, 모델 라우팅을 `ai-native-sdlc.config.json`에 기록. `CONTEXT.md`(도메인 용어집) 초기화. |
| `sdlc-discover` | Phase 0~1. Jira 인테이크 → 분류 → 그릴링 → 도메인 용어 정리 → (UI 변경 시) 프로토타입 → Gherkin/API AC 초안 → G1. |
| `sdlc-plan` | Phase 2. 설계(C4, ADR, OpenAPI 계약) → 수직 슬라이스 태스크 → 테스트 플랜 → 교차 모델 리뷰 → G2. |
| `sdlc-implement` | Phase 3. 슬라이스별 RED → GREEN → REFACTOR → 스펙/표준 리뷰 → G3. |
| `sdlc-verify` | Phase 4. 전체 테스트, E2E BDD, UX 게이트, 교차 모델 리뷰, 보안 리뷰 → G4. |
| `sdlc-release` | Phase 5. PR → CI → Helm/ArgoCD dev·staging 프로모션 PR → prod 프로모션 PR 초안 → G5. |
| `sdlc-handoff` | 현재 대화/상태를 핸드오프 문서로 압축해 다른 세션·에이전트가 이어받게 함. |

### 5.2 규율 스킬 (model-invoked)

| 스킬 | 내용 |
|---|---|
| `grilling` | 한 번에 한 질문, 설계 트리의 모든 분기가 해소될 때까지 인터뷰. 가능하면 객관식. |
| `domain-context` | `CONTEXT.md` 용어집과 `docs/adr/` 유지. 새 용어 등장 시 정의 합의 후 기록. 코드/문서 네이밍에 용어집 사용. |
| `visual-companion` | 로컬 정적 HTML 서버로 목업/다이어그램/비교안을 브라우저에 띄움. 질문별로 "보여주는 게 나은가?" 판단. 선택 결과를 파일로 회수. |
| `prototype` | 설계 질문에 답하기 위한 throwaway 프로토타입. (a) 단일 HTML (Grafana 다크/라이트 테마 흉내) 여러 변형 토글, (b) 확정안을 실제 `@grafana/ui`로 만든 샌드박스 플러그인을 로컬 Grafana(docker compose) + mock 데이터로 검증. 프로토타입 코드는 절대 프로덕션으로 승격하지 않는다. |
| `bdd-gherkin` | 프론트엔드 E2E 시나리오 작성 규칙. 선언형 스텝, 도메인 용어 사용, 한 시나리오 한 행동, Background 최소화, playwright-bdd 스텝 재사용. |
| `tdd` | RED-GREEN-REFACTOR, 수직 슬라이스, 실패를 반드시 눈으로 확인, 인터페이스 경계에서 테스트, 모킹은 경계(외부 시스템)에서만. |
| `api-contract` | BFF ↔ 플러그인 OpenAPI 계약 우선. 계약 변경 시 소비자(플러그인) 타입 생성 및 계약 테스트. |
| `code-review` | 두 축 리뷰: **Spec**(티켓/Gherkin/플랜 충실도)와 **Standards**(레포 컨벤션 + 코드 스멜). 병렬 서브에이전트로 분리 실행. 심각도 분류(blocking / should-fix / nit). |
| `verification-gate` | 완료 주장 전 실제 명령 실행, 출력 인용. "될 것이다" 금지. 게이트 체크리스트를 state.json에 기록. |
| `jira-sync` | Atlassian MCP로 티켓 조회, 코멘트, 상태 전이, 링크 추가. MCP 미연결 시 `jira-outbox.md`에 적재. |
| `diagnosing-bugs` | 버그를 재현하는 실패 피드백 루프 구축 → 최소화 → 가설 → 계측 → 수정 → 회귀 테스트. |

### 5.3 기술 스택 스킬 (model-invoked)

| 스킬 | 내용 |
|---|---|
| `spring-boot-bff` | Gradle 멀티모듈 컨벤션, 레이어(controller/service/client), WebClient로 query-service 호출, 타임아웃/재시도/서킷브레이커, 에러 매핑(ProblemDetail), 인증 전파, 설정 프로파일. |
| `spring-testing` | JUnit 5, `@WebMvcTest`/`@SpringBootTest` 슬라이스, WireMock으로 query-service 스텁, Testcontainers, REST Assured 기반 API 테스트, 테스트 데이터 빌더. |
| `signoz-query-service` | SigNoz Query API(Query Builder v3/v4, PromQL, ClickHouse SQL 패스스루), 요청/응답 스키마, OTel 데이터 모델(traces/metrics/logs 테이블), Go 패치 시 최소 변경·업스트림 추적 원칙. |
| `grafana-plugin-dev` | `@grafana/create-plugin` 구조, datasource(`DataSourceApi`, query editor, `DataFrame`), panel(`PanelProps`, options builder), app(pages, routing), `@grafana/ui`/`useStyles2`/테마, backend-less datasource로 BFF 호출. |
| `grafana-plugin-testing` | Jest + React Testing Library, `@grafana/plugin-e2e` + Playwright, `playwright-bdd`로 Gherkin 실행, `@axe-core/playwright`, 스크린샷 비교, 로컬 Grafana docker 프로비저닝. |
| `react-ts` | TS strict, 훅 규칙, 상태 위치, 메모이제이션 기준, 대용량 DataFrame 렌더링 주의점. |
| `otel-observability` | OTel 시맨틱 컨벤션, 자체 코드 계측(BFF 트레이싱), 로그-트레이스 상관. |
| `helm-argocd-release` | 차트 values 구조, 이미지 태그 범프, 환경별 values 프로모션 PR, ArgoCD sync/health 확인, 롤백 절차. |

## 6. 단계와 게이트

### 6.1 산출물 위치

```
docs/sdlc/<JIRA-KEY>/
  state.json
  01-discovery.md
  prototype/            # HTML 변형, 샌드박스 스크린샷
  features/*.feature    # 프론트엔드 E2E Gherkin
  02-plan.md
  openapi.yaml          # 계약 변경 시
  adr/                  # 이 티켓에서 생긴 ADR (확정 시 docs/adr/로 이동)
  03-impl-log.md
  04-verify-report.md
  05-release.md
  handoff-<n>.md
  jira-outbox.md        # MCP 미연결 시
```

### 6.2 state.json 스키마

```json
{
  "ticket": "ABC-123",
  "title": "…",
  "classification": "bounded | architectural | spike",
  "uiChange": true,
  "phase": "discover | plan | implement | verify | release | done",
  "gates": {
    "G0": { "status": "passed | pending | failed", "at": "ISO8601", "by": "agent | <human>", "evidence": "…" },
    "G1": {}, "G2": {}, "G3": {}, "G4": {}, "G5a": {}, "G5b": {}
  },
  "slices": [
    { "id": 1, "title": "…", "status": "pending | red | green | reviewed | done", "attempts": 0 }
  ],
  "history": [ { "at": "ISO8601", "event": "…" } ]
}
```

G3는 모든 슬라이스가 `done`일 때 `passed`가 된다.

### 6.3 단계별 상세

| 단계 | 주요 활동 | 산출물 | 게이트 |
|---|---|---|---|
| **0 Intake** (discover 내부) | Atlassian MCP로 티켓/링크/첨부 조회 → 분류(spike / bounded / architectural), UI 변경 여부 판단, 영향 모듈 식별 | state.json | **G0 Ticket Ready**: AC 존재, 영향 모듈 식별. 불충분하면 PO 질문을 Jira 코멘트로 남기고 중단 |
| **1 Discover** | 그릴링 → `CONTEXT.md` 용어 갱신 → (UI 변경 시) 비주얼 컴패니언 제안 → HTML 목업 2~3안 비교 → 선택안을 Grafana 샌드박스 + mock 데이터로 검증 → UX 에이전트 휴리스틱 리뷰 → 프론트 Gherkin 초안 + 백엔드 API AC 초안 | 01-discovery.md, prototype/, features/*.feature | **G1 Discovery Approved 👤**: 선택한 프로토타입, Gherkin, BE AC를 사람이 승인 |
| **2 Plan** | 아키텍트 에이전트: C4(비주얼 컴패니언), BFF↔플러그인 OpenAPI 계약, query-service 호출 매핑, ADR → 수직 슬라이스 분해(슬라이스마다 테스트→구현→검증 가능) → 테스트 플랜(유닛/통합/API/E2E 매트릭스) → 교차 모델 플랜 리뷰 | 02-plan.md, openapi.yaml, adr/ | **G2 Plan Approved 👤** + 교차 리뷰 blocking 0건 |
| **3 Implement** | 슬라이스마다: test-writer가 실패 테스트 작성 및 실패 확인(RED) → implementer가 GREEN → REFACTOR → spec-reviewer → code-reviewer | 커밋, 03-impl-log.md | **G3 (슬라이스별)**: RED 증거, GREEN 증거, 두 리뷰 blocking 0건. 3회 실패 시 diagnosing-bugs → 그래도 실패 시 사람에게 에스컬레이션 |
| **4 Verify** | `./gradlew test`, API 테스트, Jest, playwright-bdd E2E, axe, 스크린샷 diff, Grafana 가이드라인 점검 → 전체 diff 교차 모델 리뷰 → 보안 리뷰 | 04-verify-report.md | **G4 Verified**: 모든 항목 green, 명령 출력 첨부 |
| **5 Release** | PR 생성(Jira 링크, verify 리포트) → GitHub Actions 대기 → Helm values 이미지 태그 범프 → dev→staging 프로모션 PR → prod 프로모션 PR 초안만 작성 | 05-release.md, PR | **G5a** CI green. **G5b 👤** prod 승인·머지는 사람만 |

### 6.4 분류별 차이

- **spike**: discover에서 질문 → 조사 → 권고로 종료. 코드는 throwaway로 표시, 이후 구현은 새 분류.
- **bounded** (기존 흐름의 작은 변경): 프로토타입, ADR, C4 생략 가능. G1/G2는 채팅 내 짧은 설계 제시 + 명시적 승인으로 대체하되 **생략 불가**.
- **architectural**: 전체 절차.
- 진행 중 숨은 복잡도 발견 시 분류는 상향만 가능 (하향 불가).

### 6.5 게이트 강제 방식

1. **스킬 선행 검사**: 각 단계 스킬의 첫 단계는 이전 게이트가 `passed`인지 state.json에서 확인. 아니면 거부하고 `/sdlc`로 안내.
2. **훅**: `gate-guard.sh`(PreToolUse)가 보호 브랜치(`main`, `release/*`) 대상 `git push`, `gh pr merge`, prod values 파일 수정, `argocd app sync *-prod`를 차단.
3. **사람 게이트(👤)**: `ask_user`(또는 하네스의 동등 기능)로 명시적 승인을 받고 승인자/시각을 state.json에 기록. 에이전트가 스스로 👤 게이트를 통과 처리하지 않는다.
4. **Jira 반영**: 게이트 통과 시 jira-sync가 코멘트(산출물 요약 + 링크)와 상태 전이.

### 6.6 Jira 상태 매핑 (기본값, sdlc-setup에서 변경 가능)

| 이벤트 | Jira 상태 |
|---|---|
| discover 시작 | Discovery |
| G1 통과 | In Design |
| G2 통과 | In Progress |
| G3 통과, verify 시작 | In Review |
| G4 통과 | Ready for Release |
| G5b 통과 (prod 반영 확인) | Done |

### 6.7 되돌아가기

게이트 실패 시 원인 단계로 복귀한다. 예: verify에서 스펙 누락 발견 → plan 복귀(G2 재승인), 요구사항 오해 발견 → discover 복귀(G1 재승인). 복귀 이벤트는 state.json history와 Jira 코멘트에 기록.

## 7. 전문 에이전트

| 에이전트 | 역할 | 기본 모델 계열 | 사용 스킬 | 편집 권한 |
|---|---|---|---|---|
| `sdlc-architect` | C4, ADR, OpenAPI, 슬라이싱 | Claude (Opus급) | domain-context, api-contract, 기술 스택 스킬 | `docs/**` |
| `sdlc-ux-designer` | 목업 변형, 휴리스틱·a11y·Grafana 가이드라인 리뷰 | Claude | prototype, visual-companion, grafana-plugin-dev | `docs/sdlc/**/prototype/**`, 샌드박스 |
| `sdlc-test-writer` | RED 테스트만 작성 | Claude | tdd, bdd-gherkin, spring-testing, grafana-plugin-testing | 테스트 경로만 (`**/src/test/**`, `**/*.test.ts(x)`, `**/e2e/**`, `**/*.feature`) |
| `sdlc-implementer` | GREEN + REFACTOR (테스트 수정 금지) | GPT-Codex | tdd, spring-boot-bff, react-ts, grafana-plugin-dev, signoz-query-service | 프로덕션 코드 경로만 |
| `sdlc-spec-reviewer` | 티켓/Gherkin/플랜 충실도 | 구현자와 다른 계열 (Claude) | code-review (spec 축) | 읽기 전용 |
| `sdlc-code-reviewer` | 표준, 스멜, 컨벤션 | 구현자와 다른 계열 (Claude) | code-review (standards 축) | 읽기 전용 |
| `sdlc-cross-reviewer` | 플랜·최종 diff 교차 리뷰 | 작성자의 반대 계열 (GPT ↔ Claude) | code-review, verification-gate | 읽기 전용 |
| `sdlc-verifier` | 전체 테스트 실행, 증거 수집 | 경량 모델 | verification-gate, spring-testing, grafana-plugin-testing | 쉘 실행, 리포트 작성 |
| `sdlc-release-engineer` | PR, CI 감시, Helm/ArgoCD PR | GPT | helm-argocd-release, jira-sync | 쉘, gh, `deploy/**` (prod 제외) |

- **모델 라우팅**: 에이전트 frontmatter `model`에 기본값. 레포의 `ai-native-sdlc.config.json`의 `models` 섹션이 우선하며, 컨덕터/단계 스킬이 서브에이전트 호출 시 해당 값을 전달한다. 하네스가 `model`을 지원하지 않으면 무시되고 기능은 동일하게 동작한다.
- **교차 리뷰 규칙**: 리뷰어 모델 계열 ≠ 작성자 모델 계열. config에서 계열을 바꾸면 리뷰어도 반대 계열을 선택.
- **직무 분리**: test-writer와 implementer는 서로의 경로를 편집할 수 없다. implementer가 테스트가 잘못됐다고 판단하면 `BLOCKED`로 반환하고 test-writer/사람에게 되돌린다.
- **클라우드 위임 없음**: Copilot cloud coding agent(`/delegate`)로 위임하지 않는다. 모든 작업은 로컬 세션의 서브에이전트로 수행.

## 8. 핸드오프 계약

모든 서브에이전트 호출/반환은 다음 형식을 따른다.

```
## Handoff: <from> → <to>
Ticket: ABC-123 | Phase: implement | Slice: 2/5
Goal: <한 문장>
Inputs: <파일 경로 목록>
Constraints: <허용 편집 경로, 금지 행동>
Done when: <검증 가능한 조건>
--- return ---
Status: DONE | BLOCKED | NEEDS_HUMAN
Evidence: <실행한 명령 + 출력 발췌>
Changed: <파일 목록>
Open questions: <…>
```

- **단계 간 핸드오프**: 단계 산출물 문서 + state.json 자체가 핸드오프다. 다음 단계는 이 파일들만으로 시작 가능해야 한다.
- **세션 간 핸드오프**: `sdlc-handoff`가 `handoff-<n>.md` 생성. 새 세션에서 `/sdlc ABC-123`으로 재개.

## 9. 오류 처리

| 상황 | 동작 |
|---|---|
| Atlassian MCP 미연결 | jira-sync가 `jira-outbox.md`에 코멘트/전이 요청 적재, 사용자에게 알림. 워크플로우는 계속 진행 |
| 서브에이전트 `BLOCKED` / `NEEDS_HUMAN` | 컨덕터 즉시 중단, 사용자에게 질문 |
| 같은 슬라이스 3회 실패 | diagnosing-bugs 발동 → 실패 시 사람 에스컬레이션 |
| state.json과 산출물 불일치 | `/sdlc`가 감지해 해당 단계 재실행 제안 |
| 테스트 인프라 미가동 (docker, Grafana) | verifier가 원인과 기동 명령 제시, 게이트는 `pending` 유지 (통과 처리 금지) |

## 10. 스킬 자체의 검증

- `tests/scenarios/`: 압박 시나리오. 예) "급하니까 테스트는 나중에" → tdd가 거부하는가, "G1 건너뛰고 바로 plan" → plan이 거부하는가, "prod까지 배포해줘" → release가 PR 초안에서 멈추는가.
- `scripts/validate.sh`: 모든 SKILL.md frontmatter(name, description, 트리거 문구) 검사, 에이전트가 참조하는 스킬 존재 여부, 세 하네스 매니페스트 JSON 유효성, 훅 스크립트 실행 권한.
- `examples/ABC-123/`: 전 단계 산출물의 완성 예시(가상의 "서비스 맵 패널에 에러율 임계치 하이라이트" 티켓).

## 11. 범위

**v1 포함**: 5장의 모든 스킬, 7장의 모든 에이전트, 훅 2종, 3개 하네스 매니페스트, config 템플릿, validate.sh, 압박 시나리오, 예시 티켓, 한국어 README.

**v1 제외**: Jira 웹훅 자동 트리거, 클라우드 에이전트 위임, prod 자동 배포, Go query-service 풀 개발 스킬(경량 패치 가이드만 `signoz-query-service`에 포함).

## 12. 구현 시 확정한 호환성·안전 제약

이 절은 앞선 초안의 구현 가정을 구체화하며 충돌 시 우선한다.

- 세 하네스에서 공통인 것은 스킬 내용이다. 에이전트·훅·모델 라우팅이 자동으로
  동일하게 동작하지 않는다. Copilot/Claude 훅은 별도 설정 형식을 사용하고,
  Codex는 공통 스킬을 제공하되 native hook 등록은 하지 않는다.
- 실제 모델 ID는 설치 환경과 사용자 설정으로 확인한다. 기본 ID를 하드코딩하지
  않으며 다른 계열 리뷰를 제공할 수 없으면 BLOCKED이다.
- 역할별 편집 범위는 지침과 diff 감사이다. 파일시스템 접근을 강제하는
  sandbox로 표현하지 않는다.
- v1 훅은 보호 브랜치 추론 대신 모든 shell push/merge와 직접 배포 변경을
  보수적으로 차단한다. 사람이 브랜치 게시와 환경 프로모션을 수행한다.
  운영 패치/PR 본문은 `production-proposal/`로만 작성하여 prod 파일 편집 금지와
  충돌하지 않게 한다.
- 증거 SHA256, subject revision, 실제 승인 참조, 하류 무효화를 상태 계약에
  추가한다. 로컬 JSON은 승인 신원을 인증하지 않으므로 GitHub/ArgoCD 권한이 필요하다.
- SigNoz API 버전과 지원 쿼리 언어는 실제 pinned fork에서 확인하며 추측하지 않는다.
- 예시 산출물은 simulation으로 표시하고 실행·승인·배포를 꾸며내지 않는다.
