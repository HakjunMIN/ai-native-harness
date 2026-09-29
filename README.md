# ai-native-sdlc

Jira 티켓 또는 자연어 요청에서 시작해 **Discovery → Plan → Implement → Verify → Release**로
진행하는 로컬 AI 개발 워크플로우입니다. 30개 스킬과 9개 전문 에이전트를 제공합니다.
각 단계는 단독으로 실행할 수 있고, `sdlc`가 전체 진행·중단·재개를 관리합니다.

대상은 **Grafana datasource/panel/app + React/TypeScript → Spring Boot BFF
(Gradle) → SigNoz query-service** 모노레포입니다. BFF가 ClickHouse에 직접
접근하지 않으며 SigNoz 자체 UI는 노출하지 않습니다.

## 설치

```bash
set -o pipefail; printf 'header = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.github.raw+json"\n' "$(gh auth token)" | curl --config - -fsSL 'https://api.github.com/repos/HakjunMIN/ai-native-harness/contents/install.sh?ref=main' | bash -s -- /absolute/path/to/target-repo
```

[설치 조건·호스트별 설정](docs/install.md)

## 게이트 개요

전체 워크플로우는 아래 게이트를 순서대로 통과합니다. G1/G2/G5b는 사람 승인이
필수이며, 나머지는 에이전트가 증거를 통해 통과시킵니다.

| 게이트 | 단계 | 승인 주체 | 의미 |
|---|---|---|---|
| G0 | discover | 에이전트 | 요구사항/AC/모듈 맵 확정 |
| G1 | discover | **사람** | 요구사항, UI/BE/FE 결정 승인 |
| G2 | plan | **사람** | 계획, 정책, 티켓 manifest 승인 |
| G3 | implement | 에이전트 | 슬라이스 구현·검증·리뷰 완료 |
| G4 | verify | 에이전트 | 통합 검증, spec/standards/security 리뷰 |
| G5a | release | 에이전트 | CI/이미지 digest, dev·staging 프로모션 확인 |
| G5b | release | **사람** | 운영 승인/머지, 배포 상태 확인 |

## 시작

Jira 없이 시작하려면 대상 레포에서 원하는 작업을 자연어로 말하세요.

```text
sdlc 문서 검색 화면의 빈 상태를 개선해줘
```

필요한 사항만 인터뷰한 뒤 원래 요청과 확인한 내용을
`docs/sdlc/local-<slug>/intake.md`에 한 번 기록하고, 같은 디렉터리에
`state.json`을 만듭니다. 별도 요청 파일이나 기록 전 승인은 필요 없습니다.
`sdlc`만 호출하면 기존 실행 상태를 조회합니다. 발견 단계에서 AC/모듈을 확인하고
G0 증거에 요청 해시를 연결합니다. 로컬 실행은 Jira 연동·자식 발행·outbox 없이
진행하지만 G1/G2의 사람 승인과 위험별 검증·리뷰, 실제 운영 변경의 인간 통제는
유지합니다. 파일 입력을 사용하는 자동화 방법은 [운영 절차](docs/operations.md#jira-없는-로컬-시작)를 참고하세요.

Jira 티켓으로 시작하는 기존 경로는 그대로 사용합니다.

```text
sdlc-setup
sdlc ABC-123
```

setup은 실제 모듈 경로, 빌드/테스트 명령, Jira 상태, 모델과 하네스 기능을
`ai-native-sdlc.config.json`에 기록합니다. 토큰은 저장하지 않습니다.
Jira 경로에서만 Atlassian Rovo MCP를 별도로 연결·인증해야 합니다.

| 개별 스킬 | 결과 |
|---|---|
| sdlc-discover | Jira/로컬 요청 AC, 도메인 용어, HTML 비교 → 필요 시 Grafana 샌드박스, FE Gherkin |
| sdlc-plan | 필요한 설계/계약 → 위험 기반 정책·정규 티켓 정의 → G2 승인 |
| sdlc-tickets | 단일 정의에서 manifest/문서 생성; strict만 G2 이후 자식 발행 |
| sdlc-implement | 변경 종류별 검증, light 통합 작성/리뷰 또는 strict 역할 분리 |
| sdlc-verify | 해당 범위 테스트·UX 검증과 독립 spec/standards/security 리뷰 |
| sdlc-release | CI·GitOps 프로모션 확인과 사람이 실행할 운영 배포 제안 |
| sdlc-handoff | 새 세션/에이전트를 위한 증거 기반 인수인계 |

구현 시 준비된 단일 티켓은 현재 checkout의 브랜치에서, 편집 범위와 계약이
독립적인 여러 티켓은 각각 별도의 Git 워크트리에서 진행합니다.
`scripts/workspaces.mjs plan|start`가 준비 상태와 경로 충돌을 확인하고 배정을
기록합니다. 소스 병합과 최종 검증은 컨덕터가 통합 브랜치에서 수행합니다.
명령·재개/정리 절차는 [운영 문서](docs/operations.md#브랜치와-병렬-워크트리)를 참조하세요.

백엔드는 JUnit 기반 유닛/통합/API 테스트만 사용합니다. Gherkin은 FE E2E에만
적용합니다. Strict는 테스트/구현 역할을 분리하고 light는 통합 작성 뒤 독립 리뷰합니다.
역할별 허용 경로는 지침과
diff 감사로 통제합니다. OS 파일 접근 권한을 강제하는 sandbox는 아닙니다.

## 작업 규모에 맞는 경로

- 새 bounded·저위험·단일 결과는 light: Jira 부모 또는 로컬 ID로 G2 → 구현합니다.
- 위험·아키텍처·다중 결과와 기존 policy 없는 기록은 strict를 유지합니다.
- 새 정책의 교차 모델 리뷰는 권고입니다. `review.requireDifferentFamily: true`로 명시적 강제가 가능하며 독립 리뷰·증거는 항상 필요합니다.
- G2는 config에서 생성한 정책 snapshot과 manifest를 승인합니다. 설정만 바꿔 승인 기준을 낮출 수 없습니다.
- 문서/config는 관련 정적 검증, refactor는 before/after 검증을 사용하며 가짜 RED를 요구하지 않습니다.
- 기술 스킬은 독립 사용 가능하며 로딩만으로 전체 SDLC/Jira를 시작하지 않습니다.
- 인간 G1/G2/G5b, 증거 정합성과 운영 배포 통제는 두 경로 모두 유지합니다.

계획 생성·리뷰 정책·영향 범위 재검증은 [운영 절차](docs/operations.md)를 참고하세요.

## SigNoz OSS와 ClickStack 기술 스킬

기존 `signoz-query-service`는 API 계약·응답 해석·제한된 Go 패치를 담당합니다.
공식 [SigNoz 스킬](https://github.com/SigNoz/agent-skills)과
[ClickHouse 스킬](https://github.com/ClickHouse/agent-skills)도 이미 존재하므로,
중복 복제 대신 이 플랫폼에 필요한 적용 조건과 운영·검증 경계를 보완합니다.

| 스킬 | 적용 범위 |
|---|---|
| [signoz-oss](skills/signoz-oss/SKILL.md) | OSS 구성·에디션·포크 버전, collector, 스키마 마이그레이션, 단계별 업그레이드와 복원 |
| [clickstack](skills/clickstack/SKILL.md) | 선택적 ClickStack/HyperDX 비교 또는 기존 배포 작업; OSS·Managed·local mode 구분과 호환성 평가 |

ClickStack은 ClickHouse의 별칭이나 SigNoz의 필수 의존성이 아닙니다.
공식 `clickstack-otel-collector` 스킬은 **Managed ClickStack/ClickHouse Cloud**
대상이므로 OSS 운영을 그대로 대신하지 않습니다. ClickHouse가 있다는 이유만으로
ClickStack 스킬을 실행하지 않으며, 자동 설치·데이터 이전·BFF 경계 변경도 하지 않습니다.

각 스킬에는 [SigNoz 공식 자료 맵](skills/signoz-oss/references/sources.md)과
[ClickStack 공식 자료 맵](skills/clickstack/references/sources.md), 실행 전 체크리스트가
포함되어 있습니다. 현재 문서보다 실제 배포 버전·DDL·API 계약을 우선 확인합니다.
공식 플러그인과 MCP는 자동 설치하지 않으며, 비공개 텔레메트리를 Cloud로 보내지 않습니다.
setup·설계·검증·릴리스에서 해당 범위에만 로드하고 기존 승인·BDD/TDD 규칙을 유지합니다.

## 승인과 재개

Jira light는 **Plan → 정규 결과 정의·G2 승인 → 부모 이슈 구현**, Jira strict/legacy는
**Plan → 상세 티켓 분해·G2 승인 → 자식 발행 → 티켓별 구현**입니다. 로컬 실행은
light/strict 모두 G2 승인 후 자식 발행 없이 로컬 ID로 구현합니다.
결과별 AC·범위·검증 기준·필수 의존성을 기록하고 DB/API/UI 계층만 나누지 않습니다.

Policy/manifest와 필요한 생성 문서가 G2 승인에 함께 묶입니다. Strict의 `publish`
단계는 자식 Jira 티켓과 부모·의존 관계의 실제 반영을 확인합니다. 필수 발행이
미완료·불명확하면 구현하지 않습니다. 선행 티켓의 변경 종류별 검증·리뷰
완료 증거가 있어야 다음 티켓이 실행 가능합니다. 구체적인 수정 경로·명령은
착수 시점의 에이전트 handoff에서 확정합니다.

G1(디스커버리), G2(플랜), G5b(운영 반영)는 사람 승인이 필수입니다.
정책상 필수 리뷰나 테스트 인프라가 없으면 해당 작업을 차단하고, 독립된 허용 작업만 계속합니다.
HTML 클릭, 문서 존재, 이전 세션의 “통과” 요약은 승인이 아닙니다.

산출물은 `docs/sdlc/<ID>/`에 저장합니다. `state.json`은 증거 파일의 SHA256,
코드 revision과 승인 참조를 연결합니다. 새 세션에서는 동일 ID로 재개합니다.
[운영 절차](docs/operations.md)와 [예시 티켓](examples/ABC-123/README.md)을 참고하세요.
상태 형식은 schema 2입니다. 기존 schema 1 실행 기록은
[마이그레이션 절차](docs/operations.md#기존-상태-마이그레이션)를 거쳐야 하며,
기존 G2 승인을 새 상세 티켓 승인으로 간주하지 않습니다.

## 배포 안전 범위

v1 훅은 보수적으로 **모든 shell push/merge와 직접 cluster 변경을 차단**합니다.
개발자가 브랜치 게시와 dev/staging 프로모션을 실행하고, 에이전트는 결과를
확인합니다. 운영 변경안은 `production-proposal/`에만 작성합니다. 실제 prod
values 변경·머지·ArgoCD sync는 사람이 담당합니다.

훅은 일반적인 위험 동작을 막는 보조 장치이지 모든 shell/MCP 우회를 막는
보안 경계가 아닙니다. GitHub 브랜치 보호·필수 CI와 ArgoCD prod RBAC가 필요합니다.
클라우드 coding agent 위임은 사용하지 않습니다.

## 패키지 개발

```bash
npm test
npm run validate
```

상태/훅/로컬 HTTP 서버/패키지 검증을 외부 서비스 없이 실행합니다.
대상 서비스의 Gradle/Grafana E2E나 실제 Jira/ArgoCD 연결을 대신하지 않습니다.
스킬 변경 시 [압박 시나리오](tests/scenarios/pressure.md)도 별도로 실행합니다.
