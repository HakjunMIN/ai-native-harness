# ai-native-sdlc

**AI가 구현하고, 증거로 검증하며, 사람이 승인하는 로컬 개발 워크플로우.**
Jira 티켓 또는 자연어 요청에서 시작하며, 30개 스킬과 9개 전문 에이전트를 제공합니다.

## 소프트웨어 엔지니어링 원칙

**절차의 양보다 변경 위험에 맞는 검증과 명확한 책임 경계를 중시합니다.**

| 원칙 | 워크플로우에 적용하는 방식 |
|---|---|
| **작은 수직 단위로 전달** | DB/API/UI 계층별 작업 대신, 사용자 결과와 수용 기준(AC)을 갖춘 구현 태스크로 나눕니다. |
| **계약과 경계 우선** | 도메인 용어·API 계약·테스트 기대값을 맞추고, 인증·테넌트·제품 경계를 보존합니다. |
| **위험 기반 검증** | 작고 저위험인 단일 결과는 light, 고위험·아키텍처 변경·다중 결과는 strict로 진행합니다. |
| **변경에 맞는 테스트** | 동작 변경은 TDD(RED → GREEN), 리팩터링은 전후 비교, 문서·설정은 관련 정적 검증을 적용합니다. 동작을 바꾸는 설정은 동작 테스트가 필요합니다. |
| **독립 리뷰와 역할 분리** | 작성자의 자기 검토를 독립 리뷰로 인정하지 않습니다. Strict는 테스트 작성과 구현 역할도 분리합니다. |
| **증거 기반 완료와 추적성** | 테스트·리뷰·승인을 파일 해시와 코드 revision에 연결합니다. 변경으로 무효화된 증거는 재검증하며, 문서 존재나 과거 요약을 통과로 간주하지 않습니다. |
| **사람이 결정하는 승인과 운영** | 요구사항(G1), 계획(G2), 운영 반영(G5b)은 사람이 승인합니다. 에이전트는 스스로 승인하거나 실제 운영 변경을 수행하지 않습니다. |

세부 기준: [공통 원칙](skills/sdlc/references/principles.md) ·
[워크플로우 프로토콜](skills/sdlc/references/protocol.md)

## 대상과 흐름

**Grafana datasource/panel/app + React/TypeScript → Spring Boot BFF (Gradle)
→ SigNoz query-service** 모노레포를 대상으로 합니다.
BFF는 ClickHouse에 직접 접근하지 않으며, SigNoz 자체 UI는 노출하지 않습니다.

**Discovery → Plan → Implement → Verify → Release**

![단계별 필수·조건부 스킬과 G1/G2/G5b 사람 승인 게이트](docs/assets/ai-native-sdlc-skills.svg)

`sdlc`가 진행·중단·재개를 관리합니다. 기술 스킬은 독립적으로 사용할 수 있으며,
호출만으로 전체 SDLC나 Jira 작업이 시작되지는 않습니다.

## 설치

`gh` 로그인, Git SSH 접근 권한, curl, Bash, **Node.js 22 이상**이 필요합니다.
기존 대상 저장소 경로를 지정하세요.

```bash
set -o pipefail
printf 'header = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.github.raw+json"\n' "$(gh auth token)" |
  curl --config - -fsSL 'https://api.github.com/repos/HakjunMIN/ai-native-harness/contents/install.sh?ref=main' |
  bash -s -- /absolute/path/to/target-repo
```

원격 스크립트를 바로 실행하지 않는 방법과 호스트별 설정은
[설치 안내](docs/install.md), 권한·훅의 한계는 [호환성](docs/compatibility.md)을 참고하세요.
같은 명령을 다시 실행하면 프로젝트 내부의 관리 파일을 새 버전으로 갱신합니다.
사용자가 수정한 관리 파일이나 이전 공유 캐시 링크 설치는 자동으로 덮어쓰지 않습니다.

## 시작

대상 저장소에서 **최초 한 번 `sdlc-setup`**으로 모듈 경로·테스트 명령·모델을
설정한 뒤, Jira 키 또는 자연어 요청으로 시작합니다. 설정에 토큰은 저장하지 않습니다.

```text
sdlc-setup

sdlc ABC-123
또는
sdlc 문서 검색 화면의 빈 상태를 개선해줘
```

- **Jira:** Atlassian Rovo MCP 연결·인증이 필요합니다. Light는 부모 이슈로, strict는 G2 승인 후 자식 티켓을 발행해 구현합니다.
- **로컬:** 필요한 사항만 확인해 원래 요청과 답변을 `intake.md`에 기록합니다. Jira 없이 진행하되 사람 승인과 검증 기준은 동일하게 유지합니다.
- **재개:** 산출물과 상태는 `docs/sdlc/<ID>/`에 저장합니다. `sdlc`로 목록을 보고, `sdlc <ID>`로 이어갑니다.

**구현 태스크는 AC·범위·의존성을 가진 실행 단위이고, Jira 티켓은 원격 이슈입니다.**
`sdlc-tasks`가 태스크 정의와 필요한 Jira 발행을 담당합니다.
단일 태스크는 현재 checkout의 브랜치에서, 독립적인 병렬 태스크는 별도 Git 워크트리에서
수행한 뒤 통합 검증합니다. 백엔드는 JUnit, 프런트엔드 E2E는 Gherkin을 사용합니다.

## 안전 범위

**v1 훅은 모든 shell push/merge와 직접 cluster 변경을 보수적으로 차단합니다.**
브랜치 게시와 dev/staging 프로모션은 사람이 실행합니다. 에이전트는 운영 변경안을
`production-proposal/`에만 작성하며, 실제 prod values 변경·머지·ArgoCD sync는 사람이 담당합니다.

훅과 역할별 경로 제한은 **보안 샌드박스가 아닙니다.**
GitHub 브랜치 보호·필수 CI·ArgoCD prod RBAC가 별도로 필요합니다.
필수 검증이나 리뷰가 불가능하면 해당 작업은 차단하며, 통과로 처리하지 않습니다.

## 상세 안내

| 문서 | 내용 |
|---|---|
| [운영 절차](docs/operations.md) | light/strict 정책, 승인·재개, 병렬 워크트리, 기존 상태 마이그레이션 |
| [구현 태스크 예시](examples/ABC-123/README.md) | 계획·태스크·증거 산출물 구조 |
| [기술 스킬](skills/) | 독립적으로 사용 가능한 스택별 개발·테스트·운영 지침 |
| [SigNoz OSS](skills/signoz-oss/SKILL.md) · [ClickStack](skills/clickstack/SKILL.md) | 자체 호스팅 운영과 선택적 대안 평가. ClickStack은 필수 의존성이 아니며 자동 설치·이전하지 않습니다. |

## 패키지 개발

```bash
npm test
npm run validate
```

외부 서비스 없이 패키지를 검증하며, 대상 서비스의 테스트나 실제 Jira/ArgoCD 연결을
대신하지 않습니다. 스킬 변경 시 [압박 시나리오](tests/scenarios/pressure.md)도 실행합니다.
