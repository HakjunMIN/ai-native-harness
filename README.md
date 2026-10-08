---
title: "ai-native-sdlc"
description: "프로젝트 공통 기준과 증거 기반 검증, 사람 승인을 연결하는 로컬 SDLC 스킬 프레임워크"
---

**AI가 구현하고, 증거로 검증하며, 사람이 승인하는 로컬 개발 워크플로우.**
Jira 티켓 또는 자연어 요청에서 시작하며, <!-- skill-count -->36개 스킬과 9개 전문 에이전트를 제공합니다.

## 소프트웨어 엔지니어링 원칙

**절차의 양보다 변경 위험에 맞는 검증과 명확한 책임 경계를 중시합니다.**

| 원칙 | 워크플로우에 적용하는 방식 |
|---|---|
| **작은 수직 단위로 전달** | DB/API/UI 계층별 작업 대신, 사용자 결과와 수용 기준(AC)을 갖춘 sub task로 나눕니다. |
| **AC 기반 Verification & Validation** | 사용자 스토리·Jira 티켓 또는 요청에서 AC를 도출합니다. 프런트엔드 관찰 가능 동작은 AC에 연결된 Gherkin 시나리오로, 백엔드 AC는 API 예시와 JUnit(Spring) 또는 Go `testing`(Go) 단위·통합·API 테스트로 연결합니다. 구현 전 G1에서 사람이 AC·시나리오(UI는 프로토타입 포함)로 요구 의도를 확인(Validation)하고, 최종 검증에서 AC별 테스트 결과로 구현 충족을 확인(Verification)합니다. |
| **계약과 경계 우선** | 도메인 용어·API 계약·테스트 기대값을 맞추고, 인증·테넌트·제품 경계를 보존합니다. |
| **위험 기반 검증** | 작고 저위험인 단일 결과는 light, 고위험·아키텍처 변경·다중 결과는 strict로 진행합니다. |
| **변경에 맞는 테스트** | 동작 변경은 TDD(RED → GREEN), 리팩터링은 전후 비교, 문서·설정은 관련 정적 검증을 적용합니다. 동작을 바꾸는 설정은 동작 테스트가 필요합니다. |
| **독립 리뷰와 역할 분리** | 작성자의 자기 검토를 독립 리뷰로 인정하지 않습니다. Strict는 테스트 작성과 구현 역할도 분리합니다. |
| **증거 기반 완료와 추적성** | 테스트·리뷰·승인을 파일 해시와 코드 revision에 연결합니다. 변경으로 무효화된 증거는 재검증하며, 문서 존재나 과거 요약을 통과로 간주하지 않습니다. |
| **사람이 결정하는 승인과 운영** | 요구사항(G1), 계획(G2), 운영 반영(G5b)은 사람이 승인합니다. 에이전트는 스스로 승인하거나 실제 운영 변경을 수행하지 않습니다. |

세부 기준: [공통 원칙](skills/sdlc/references/principles.md) ·
[워크플로우 프로토콜](skills/sdlc/references/protocol.md)

## 대상과 흐름

기본 기술 지침은 **Grafana datasource/panel/app + React/TypeScript → Spring Boot BFF (Gradle)
→ SigNoz query-service** 관측성 스택을 대상으로 합니다.
BFF는 ClickHouse에 직접 접근하지 않으며, SigNoz 자체 UI는 노출하지 않습니다.
Go로 작성한 BFF·백엔드 서비스에는 `go-backend`·`go-testing`을 적용하며 같은 경계를 유지합니다.
모노레포 또는 여러 MSA 서비스 리포에서 사용할 수 있으며, 공유 설치를 사용해도
각 리포의 경로·명령·공통 기준은 `sdlc-setup`으로 별도 확인합니다.

**Discovery → Plan → Implement → Verify → Release**

![단계별 서브에이전트, 필수·조건부 스킬과 G1/G2/G5b 사람 승인 게이트](docs/assets/ai-native-sdlc-skills.svg)

`sdlc`가 진행·중단·재개를 관리합니다. 기술 스킬은 독립적으로 사용할 수 있으며,
호출만으로 전체 SDLC나 Jira 작업이 시작되지는 않습니다.

### 기술 스킬은 실행 시점에 공식 문서 조회

개발 워크플로우 스킬은 로컬 절차·승인·검증 기준을 정의합니다. 반면 Mimir,
Prometheus, SigNoz, ClickStack, OTel, Grafana, React/TypeScript, Spring, Go 및
Helm/ArgoCD 기술 스킬은 **정적 제품 매뉴얼 대신 공식 문서 조회 절차**를 제공합니다.

- 각 기술 스킬의 `references/sources.md`에서 관련 공식 URL을 골라 웹 조회 도구,
  문서 MCP 또는 HTTP GET으로 **현재 작업에서 실제 본문을 가져온 뒤** 적용합니다.
- 로컬 MD에는 URL 라우팅·프로젝트 경계·검증 질문만 유지합니다. API·설정 기본값·
  지원 기능은 가져온 문서와 설치 버전의 소스/설정으로 확인합니다.
- `latest`/`main`은 탐색 시작점입니다. 배포 버전에 맞는 문서·태그를 확인하고,
  결과에 조회 URL·절·조회 시각·대상 버전·적용 근거를 남깁니다.
- 조회 실패 시 정적 요약이나 모델 기억을 최신 문서로 대체하지 않고 의존 작업을
  `BLOCKED`로 보고합니다. 문서 조회는 설치·업그레이드·운영 변경을 허가하지 않습니다.

공통 규칙: [실시간 기술 문서 조회 프로토콜](skills/sdlc/references/live-documentation.md).
티켓의 harness lock은 로컬 지침과 URL 목록만 고정하며, 외부 문서 본문은 고정하지
않습니다. 재현에 필요한 조회 근거는 해당 작업의 증거에 별도로 보존합니다.

## 설치

### MSA: 형제 리포에서 하네스 공유 (Bash / PowerShell)

3~4개 서비스 리포가 같은 상위 디렉터리에 있다면 **공유 클론 + 심볼릭 링크**
설치를 사용하세요. 설치기가 서비스 리포와 같은 레벨에 `ai-native-harness`를
먼저 클론하고, 이미 있으면 `git pull --ff-only`로 갱신합니다.
Git과 **Node.js 22 이상**이 필요합니다.

```text
workspace/
├── ai-native-harness/       # 공통 스킬·훅·에이전트의 Git 클론
├── .ai-native-sdlc-revisions/ # 첫 티켓 생성 시 만드는 공유 리비전 캐시
├── service-api/
├── service-web/
└── service-worker/
    ├── .ai-native-sdlc -> ../ai-native-harness
    ├── AGENTS.md -> .ai-native-sdlc/templates/project-AGENTS.md
    ├── .agents/skills/* -> ../../.ai-native-sdlc/skills/*
    ├── .github/agents/* -> ../../.ai-native-sdlc/agents/*
    └── docs/sdlc/<ID>/      # 해당 서비스의 상태·lock·작업 이력
```

**Bash/zsh** — 대상은 미리 존재하는 리포 경로입니다.

```bash
set -o pipefail
curl -fsSL 'https://raw.githubusercontent.com/HakjunMIN/ai-native-harness/main/install-shared.sh' |
  bash -s -- /workspace/service-api /workspace/service-web /workspace/service-worker
```

**PowerShell 7+** — Windows에서도 Bash 없이 설치하고 훅을 실행합니다.

```powershell
$url = 'https://raw.githubusercontent.com/HakjunMIN/ai-native-harness/main/install-shared.ps1'
& ([scriptblock]::Create((Invoke-WebRequest -Uri $url).Content)) `
  'C:\workspace\service-api' 'C:\workspace\service-web' 'C:\workspace\service-worker'
```

이미 하네스가 있다면 [install-shared.sh](install-shared.sh) 또는
[install-shared.ps1](install-shared.ps1)를 직접 실행할 수 있습니다.
Windows에서 심볼릭 링크를 만들려면 **개발자 모드 또는 관리자 권한**이 필요합니다.
같은 명령을 재실행하면 공통 설치 자산이 갱신됩니다. 새 티켓과 standalone 스킬은
갱신된 자산을 사용하지만, 기존 티켓의 실행 기준은 해당 lock을 유지합니다.
현재 공통 안전 훅은 계속 갱신되며, 스킬·에이전트 추가/삭제와 리포별 설정 변경은
모든 대상 리포를 지정해 재설치해야 반영됩니다.
기존 `AGENTS.md`는 보존하며, 새로 만드는 `AGENTS.md`만 프로젝트용 공통 템플릿에
연결합니다. 훅 실행 코드와 역할 원문은 공유하고, 대상 경로가 들어가는 CLI 훅 설정과
Codex 네이티브 에이전트 TOML은 리포별로 생성합니다.
충돌·기존 복사 설치를 자동 덮어쓰거나 변환하지 않습니다.
옵션, 안전한 업데이트 및 프로젝트별 지침 관리 방법은 [설치 안내](docs/install.md)를 참고하세요.

### 기존 방식: 프로젝트 내부 복사 설치

공개 저장소이므로 인증 없이 설치할 수 있습니다. curl, Git, Bash와
설치 후 실행에 사용할 **Node.js 22 이상**이 필요합니다.
기존 대상 저장소 경로를 지정하세요.

```bash
set -o pipefail
curl -fsSL 'https://raw.githubusercontent.com/HakjunMIN/ai-native-harness/main/install.sh' |
  bash -s -- /absolute/path/to/target-repo
```

원격 스크립트를 바로 실행하지 않는 방법과 호스트별 설정은
[설치 안내](docs/install.md), 권한·훅의 한계는 [호환성](docs/compatibility.md)을 참고하세요.
같은 명령을 다시 실행하면 프로젝트 내부의 관리 파일을 새 버전으로 갱신합니다.
사용자가 수정한 관리 파일이나 공유 링크 설치는 자동으로 덮어쓰지 않습니다.

## 시작

### 티켓별 스킬 리비전

**설치는 공유할 수 있고, 실행 기준은 티켓별로 고정합니다.** 공유·복사 설치 모두
`docs/sdlc/<ID>/harness.lock.json`을 만들며 `state.json`에 lock 파일의 해시를 연결합니다.
서비스 리포 전체에 하나의 버전을 고정하는 방식이 아닙니다.
lock에는 실제 자산의 **콘텐츠 SHA256**과 소스 커밋(확인 가능할 때)을 기록합니다.
미커밋 변경도 포함하므로, 커밋 번호만으로 항상 같은 자산을 복원할 수 있는 것은 아닙니다.

`sdlc` 워크플로우로 시작하면 에이전트가 새 Jira 작업의 상태와 lock을 생성하고,
로컬 자연어 작업은 intake 단계에서 자동으로 lock을 생성합니다. 재개 시에도
에이전트가 기존 리비전과 상태를 검증하므로 **사용자가 별도로 명령을 실행할 필요는 없습니다.**

> [!NOTE]
> **선택 사항: 수동 수행·점검용 명령**
> 아래 명령은 워크플로우의 필수 사전 작업이 아니라, 사용자가 직접 생성·재개·점검할 때의 예시입니다.
> 대상 서비스 리포 루트에서 실행하며 Bash와 PowerShell 모두 동일합니다.
>
> ```sh
> node .ai-native-sdlc/scripts/harness.mjs start ABC-123
> node .ai-native-sdlc/scripts/harness.mjs resolve docs/sdlc/ABC-123/state.json
> node .ai-native-sdlc/scripts/state.mjs check docs/sdlc/ABC-123/state.json
> ```
>
> 첫 줄은 **새 Jira 작업에만** 실행합니다. 기존 작업은 `resolve`부터 실행하며,
> 로컬 자연어 작업에는 `start`를 중복 실행하지 않습니다.
> 선택적인 것은 사용자의 수동 실행입니다. Node.js 런타임과 에이전트의 내부 스크립트 실행은 필요합니다.

생성 시 설치된 자산을 그대로 보관하며, 원격 하네스를 자동으로
pull하지 않고 Jira 조회·동기화나 사람 승인도 대신하지 않습니다.
기존 작업은 `resolve`부터 실행하고, 반환된 `root` 아래의 스킬·역할·템플릿을 읽습니다.
`state.mjs`의 상태 관련 명령은 해당 티켓의 스냅샷 검증기로 자동 연결됩니다.

sub task·서브에이전트는 부모 conductor의 lock과 원본 상태 경로를 상속합니다.
공유 링크는 티켓 전환 시 바꾸지 않으며, 현재 공통 안전 훅과 프로젝트 보안 지침은
과거 스냅샷으로 되돌리지 않습니다.

| 작업 | 명령과 조건 |
|---|---|
| 재개 | `resolve STATE` — lock과 캐시 무결성 확인. 누락·불일치 시 중단하며 최신 버전으로 대체하지 않습니다. |
| 캐시 복구 | `restore STATE --source PATH` — 정확한 이전 자산 또는 해당 커밋을 포함한 로컬 Git 소스 필요. 원격 fetch는 하지 않습니다. |
| 과거 작업에 최초 적용 | `adopt STATE --reason "이유" --confirm` — lock 없는 작업에 현재 기준을 명시적으로 설정합니다. |
| 진행 중 기준 변경 | `upgrade STATE --reason "이유" --confirm` — 기본은 현재 설치본, 다른 소스는 `--source PATH`로 지정합니다. |

표의 명령은 `node .ai-native-sdlc/scripts/harness.mjs` 뒤에 붙이며, `STATE`는 티켓의
상태 파일 경로입니다. `adopt`와 `upgrade`는 이전 상태·lock을 `harness-history/`에
보존하고 **G0부터 모든 게이트를 재검증**하도록 초기화합니다. `--confirm`은 버전 변경
의사 표시이지 게이트 승인이 아니며, 완료된 작업은 변경하지 않습니다.
기존 integration 브랜치가 있으면 재승인된 계획을 commit하고 이전 작업 공간을
보존·정리한 뒤 `workspaces.mjs reconcile STATE`로 재개합니다.
상세 조건은 [브랜치·워크트리 운영 절차](docs/operations.md#브랜치와-병렬-워크트리)를 따릅니다.

스냅샷 캐시는 `.ai-native-sdlc-revisions/<SHA256>/`에 둡니다. 공유 설치는 실제 하네스
클론 옆에서 여러 서비스가 공유하고, 복사 설치는 각 서비스 리포 내부에 보관합니다.
**lock·상태·작업 이력은 함께 커밋하고 캐시는 제외**하세요. 참조 중인 캐시는 임의로
지우거나 편집하지 마세요. 미커밋 자산으로 만든 스냅샷은 복구용 원본도 보존해야 합니다.

Windows와 함께 사용한다면 대상 서비스의 기존 `.gitattributes`에 다음 규칙을 추가해
새 lock·증거 파일의 줄바꿈을 유지하세요. 하네스 리포의 설정은 서비스에 자동 적용되지
않으며, 과거 증거의 줄바꿈이나 해시는 임의로 다시 쓰지 않습니다.

```gitattributes
docs/sdlc/** text=auto eol=lf
```

상세 복구 절차·PowerShell 예제·제약은 [티켓 리비전 관리](skills/sdlc/references/harness-revisions.md)를 참고하세요.

### 워크플로 시작

대상 저장소에서 **최초 한 번 `sdlc-setup`**으로 모듈 경로·테스트 명령·모델과
공통 표준·ADR의 위치·담당자를 확인하고 설정한 뒤, Jira 키 또는 자연어 요청으로
시작합니다. 설정에 토큰은 저장하지 않습니다.

```text
sdlc-setup

sdlc ABC-123
또는
sdlc 문서 검색 화면의 빈 상태를 개선해줘
```

- **Jira:** Atlassian Rovo MCP 연결·인증이 필요합니다. Light는 부모 이슈로, strict는 G2 승인 후 자식 티켓을 발행해 구현합니다.
- **로컬:** 필요한 사항만 확인해 원래 요청과 답변을 `intake.md`에 기록합니다. Jira 없이 진행하되 사람 승인과 검증 기준은 동일하게 유지합니다.
- **재개:** 산출물과 상태는 `docs/sdlc/<ID>/`에 저장합니다. `sdlc`로 목록을 보고, `sdlc <ID>`로 이어갑니다.

**sub task는 AC·범위·의존성을 가진 실행 단위이고, Jira 티켓은 원격 이슈입니다.**
큰 티켓이나 요청은 여러 sub task로 나누며, 작은 범위의 작업은 하나의 sub task로
진행합니다. `sdlc-subtasks`가 sub task 정의와 필요한 Jira 발행을 담당합니다.
이 명칭은 Jira의 특정 이슈 타입을 강제하지 않습니다. 로컬 작업은 Jira 발행이 없고,
Jira light는 부모 티켓을 사용하며 Jira strict/legacy만 승인 후 자식 티켓을 발행합니다.
단일 sub task는 현재 checkout의 브랜치에서, 독립적인 병렬 sub task는 별도 Git 워크트리에서
수행한 뒤 통합 검증합니다. 백엔드는 JUnit(Spring) 또는 Go `testing`(Go), 프런트엔드 E2E는 Gherkin을 사용합니다.

기존 실행과의 호환성을 위해 `tasks`, `taskPlan`, `slices`, `tasks.json`, `tasks/` 및
`tasks.mjs` 명령은 유지합니다. 상세 대응은 [sub task 계약](skills/sdlc-subtasks/references/sub-task-contract.md)을 참고하세요.

### PR 본문과 회고

**리뷰가 끝난 diff는 `pr`로 설명하고, 어려웠던 실행은 `retro`로 환경 개선에 연결합니다.**
흐름은 `… → sdlc-verify(G4 최종 리뷰) → sdlc-release(pr) → done → retro(사람 호출)`입니다.

- **`pr`**: 릴리스·GitOps 프로모션·운영 제안 PR 본문을 같은 형식으로 작성합니다.
  Summary(가장 작은 시각화), Evidence(전/후 실행 증거), Merge Danger(one-way/two-way
  door와 blast radius), Traceability로 구성합니다. 위험은 승인된 계획의 위험 기록보다
  낮게 표시하지 않으며, 본문만 작성하고 push·merge는 하지 않습니다.
- **`retro`**: 사용자가 명시적으로 호출할 때만 실행합니다. 세션과 `docs/sdlc/<ID>/`
  기록에서 실제 마찰 지점을 찾아 개선 후보를 심각도 순으로 제안합니다. 기계적
  위반은 자동 검사로, 판단이 필요한 규칙은 프로젝트 표준(`Enforcement: review`)으로
  보내며 AGENTS.md에는 탐색 포인터만 둡니다. 별도 회고 보고서는 남기지 않고,
  채택된 변경만 소유자 승인을 거쳐 표준·검사에 영속화합니다.

## 프로젝트 공통 기준과 ADR

**표준은 현재 지켜야 할 규칙, ADR은 그 결정을 내린 이유입니다.**
여러 기능에 영향을 주는 결정은 프로젝트 차원에 두고, 기능별 계획은 이를 참조합니다.
첫 기능에서 도입하더라도 인증·테넌트·공유 API 같은 공통 경계는 프로젝트 ADR입니다.

대상 프로젝트의 기존 문서 위치를 우선 사용합니다. 별도 관례가 없다면 다음 구조를
사용하며, 설치된 하네스 내부가 아니라 대상 프로젝트에 필요한 문서만 작성합니다.

```text
AGENTS.md                         # 실제 문서 위치와 읽기 규칙
docs/
  architecture/
    overview.md                   # 현재 시스템 경계와 의존성
    adr/
      README.md                   # 공통 결정 목록·상태·담당자
      ADR-0001-<decision>.md       # 공통 결정의 근거·대안·승인
  standards/
    README.md                     # 표준 목록과 적용 범위
    <topic>.md                    # 현재 규칙과 검증 방법
  sdlc/
    <ID>/
      state.json                 # 진행 상태와 lock 해시
      harness.lock.json          # 티켓별 하네스 콘텐츠 리비전
      02-plan.md                  # 공통 기준 참조와 기능 설계
      adr/<feature-decision>.md   # 필요한 경우에만 기능 한정 결정
```

Discovery에서 적용 기준과 충돌을 식별하고, Plan의 `Project baseline`에 문서
경로·절·기준 commit을 기록합니다. 미커밋 문서는 실제 내용 해시를 사용합니다.
구현·리뷰·검증·재개 시 기준 이후 변경과 예외 유효성을 확인하고, 릴리스·인계에는
공통 결정 변경과 남은 마이그레이션 의무를 전달합니다.

- 공통 규칙은 기능별로 복사하지 않고 원문을 참조합니다. 일반 구현 선택은 계획에 남깁니다.
- 공통 변경과 한시적 예외는 해당 소유자의 명시적 승인이 필요합니다. 기능 G2 승인만으로 대신하지 않습니다.
- 기능 결정의 공통 승격은 프로젝트 ADR로 기록하고 원래 작업을 연결합니다. 결정 대체 시 `superseded` 관계와 현재 표준을 갱신하며 과거 증거는 보존합니다.
- 표준 규칙은 적용 범위·상태·소유자·출처와 함께 **강제 방식**(`check: <자동 검사>` 또는 `review`)을 기록합니다. 기존 `CODING_STANDARDS.md`·`CONTRIBUTING.md`는 별도 문서를 만들지 않고 표준 색인에 등록합니다. `retro` 제안은 `proposed`로 시작해 소유자 승인 후 적용됩니다.

설치기는 빈 표준·ADR을 자동 생성하지 않습니다. 기존 설치본은 업데이트 후
`sdlc-setup`으로 프로젝트 지침을 연결하며, 기존 AGENTS.md는 덮어쓰지 않고 diff로
검토합니다. **공통 문서 변경 확인은 스킬 절차이며, 상태 검증기가 자동 감지하지는
않습니다.** 비교 결과는 작업 내부 보고서에 남겨 기존 게이트 증거로 연결합니다.

세부 규칙: [프로젝트 거버넌스](skills/sdlc/references/project-governance.md)

## 안전 범위

**v1 훅은 `git push`·`gh pr merge`와 직접 cluster 변경을 보수적으로 차단합니다.**
로컬 `git merge`에 대한 훅의 중립 응답은 실행 허가가 아닙니다. 사용자 허가와
프로젝트 보호규칙 아래 컨덕터만 검토된 소스 작업을 integration 브랜치에 통합하며,
작업자·릴리스 역할은 직접 merge하지 않습니다.
브랜치 게시와 dev/staging 프로모션은 사람이 실행합니다. 에이전트는 운영 변경안을
`production-proposal/`에만 작성하며, 실제 prod values 변경·머지·ArgoCD sync는 사람이 담당합니다.

훅과 역할별 경로 제한은 **보안 샌드박스가 아닙니다.**
GitHub 브랜치 보호·필수 CI·ArgoCD prod RBAC가 별도로 필요합니다.
필수 검증이나 리뷰가 불가능하면 해당 작업은 차단하며, 통과로 처리하지 않습니다.

## 상세 안내

| 문서 | 내용 |
|---|---|
| [설치 안내](docs/install.md) | MSA 공유·기존 복사 설치, Bash/PowerShell, 업데이트와 충돌 처리 |
| [티켓 리비전 관리](skills/sdlc/references/harness-revisions.md) | 티켓별 lock, 캐시, 재개·복구·명시적 버전 전환과 sub task 상속 |
| [고객 리포 적용 사전 탐색](docs/customer-repository-discovery.md) | 인터뷰 질문, 산출물 양식, 도구·권한 조사, 개발 프로세스 매핑과 파일럿 도입 기준 |
| [운영 절차](docs/operations.md) | light/strict 정책, 승인·재개, 병렬 워크트리, 기존 상태 마이그레이션 |
| [프로젝트 거버넌스](skills/sdlc/references/project-governance.md) | 공통 표준·ADR, 기준 버전, 승인·예외·승격·대체와 변경 영향 확인 |
| [sub task 예시](examples/ABC-123/README.md) | 계획·sub task·증거 산출물 구조 |
| [기술 스킬](skills/) | 독립적으로 사용 가능한 스택별 개발·테스트·운영 지침 |
| [SigNoz OSS](skills/signoz-oss/SKILL.md) · [ClickStack](skills/clickstack/SKILL.md) | 자체 호스팅 운영과 선택적 대안 평가. ClickStack은 필수 의존성이 아니며 자동 설치·이전하지 않습니다. |
| [Mimir OSS](skills/mimir-oss/SKILL.md) · [Prometheus Query API](skills/prometheus-query-api/SKILL.md) | 메트릭 저장소·쿼리 서비스 전환 평가와 운영, PromQL·BFF 쿼리 계약. 승인된 결정 없이 운영 전환하지 않습니다. |
| [Go Backend](skills/go-backend/SKILL.md) · [Go Testing](skills/go-testing/SKILL.md) | Go BFF·백엔드 구현과 `go test` 증거. [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang)은 작업 시 조회하는 비공식 체크리스트로만 쓰며, 의존성·`go` 버전 변경을 허가하지 않습니다. |

## 패키지 개발

```bash
npm test
npm run validate
```

외부 서비스 없이 패키지를 검증하며, 대상 서비스의 테스트나 실제 Jira/ArgoCD 연결을
대신하지 않습니다. 스킬 변경 시 [압박 시나리오](tests/scenarios/pressure.md)도 실행합니다.
