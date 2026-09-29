# ai-native-sdlc

Jira 티켓 또는 로컬 요청서에서 시작해 **Discovery → Plan → Implement → Verify → Release**로
진행하는 로컬 AI 개발 워크플로우입니다. 30개 스킬과 9개 전문 에이전트를 제공합니다.
각 단계는 단독으로 실행할 수 있고, `sdlc`가 전체 진행·중단·재개를 관리합니다.

대상은 **Grafana datasource/panel/app + React/TypeScript → Spring Boot BFF
(Gradle) → SigNoz query-service** 모노레포입니다. BFF가 ClickHouse에 직접
접근하지 않으며 SigNoz 자체 UI는 노출하지 않습니다.

## 설치

설치에는 Bash가 필요하며, `curl` 설치에는 Git과 curl도 필요합니다.
**설치기 자체는 Node.js를 사용하지 않지만**, 설치 후 SDLC 훅과 스크립트 실행에는
Node.js 22 이상이 필요합니다. 패키지 검증에는 외부 npm 의존성이 없습니다.
대상 서비스의 Java/Grafana/SigNoz 버전과 테스트 명령은 setup에서 확인합니다.

### Copilot CLI + Codex: 프로젝트에 한 번 설치

두 CLI를 같은 대상 저장소에서 사용하려면 **플러그인 설치 대신** Bash 설치기를
실행합니다. 이미 스킬 리포를 내려받았다면 원본과 대상 저장소를 서로 다른
디렉터리에 두고 다음처럼 설치하세요.

```bash
bash /absolute/path/to/ai-native-harness/install.sh /absolute/path/to/target-repo
```

리포를 아직 내려받지 않았다면, 다운로드한 스크립트를 **검토한 뒤** 실행하세요.
스크립트가 공개 GitHub 저장소를 내려받아 `~/.cache/ai-native-sdlc/main`에
보관하고 대상 프로젝트를 연결합니다.

```bash
curl -fsSLo install.sh https://raw.githubusercontent.com/HakjunMIN/ai-native-harness/main/install.sh
bash install.sh /absolute/path/to/target-repo
```

대상에 `.ai-native-sdlc` 링크(원본 리포 전체), `.agents/skills/` 링크,
Copilot용 `.github/agents/` 및 `.github/hooks/ai-native-sdlc.json`,
Codex용 `.codex/agents/` 및 `.codex/hooks.json`을 생성합니다.
`scripts/`와 `templates/`는 링크된 스킬의 실행에 필요한 자산입니다.
`tests/`와 `examples/`는 원본 개발 자료로, 대상 프로젝트 루트에는 복사되지 않습니다.
기존 파일과 충돌하면 덮어쓰지 않고 설치를 중단합니다. 같은 설치 명령을 다시 실행해도
내용이 동일하면 변경하지 않습니다. **원본을 이동하거나 생성 설정 형식이 바뀌면**
링크/설정 경로를 확인하고 다시 설치해야 합니다. 기존 생성 설정과 새 설정이 충돌하면
내용을 검토한 뒤 해당 생성 파일만 직접 교체하세요. 다른 프로젝트 설정이나 `AGENTS.md`
는 변경하지 않습니다. 원본 리포를 지우면 링크도 동작하지 않습니다.
curl 경로에서 재실행하면 같은 캐시를 사용하며 자동으로 업데이트하지 않습니다.
다른 리비전을 설치하려면 다운로드할 스크립트 URL과 `AI_NATIVE_SDLC_REF`(브랜치/
태그 이름), `AI_NATIVE_SDLC_CACHE_DIR`를 함께 맞추고 기존 링크 충돌을 먼저
해결하세요. `AI_NATIVE_SDLC_REPO_URL`로 저장소 URL도 지정할 수 있습니다.
캐시에는 설치된 실행 코드가 남으므로 신뢰할 수 있는 리포에서만 설치하세요.

두 CLI를 **대상 저장소에서 새 세션**으로 실행해 Copilot `/skills`, `/agent`와
Codex `/skills`, `/agent`, `/hooks`에서 발견 상태를 확인하세요. Copilot은
`copilot skill list`로도 확인할 수 있습니다. Codex는 프로젝트 구성 계층을
신뢰하고 각 훅 정의를 `/hooks`에서 검토·승인해야 실행됩니다. 양쪽에서 스킬
30개·전문 에이전트 9개의 발견 및 훅의 실제 차단 동작을 확인하기 전에는 설치
완료로 간주하지 마세요. 훅은 OS 권한 경계가 아니며 Codex 에이전트가 Markdown의
`tools` 목록을 네이티브 권한으로 강제하는 것도 아닙니다.

### Copilot CLI 전용 플러그인 설치 (선택)

Copilot CLI에서만 쓰는 경우에는 팀 마켓플레이스를 통한 플러그인 설치도 가능합니다.
이 방법은 Codex 프로젝트의 스킬·에이전트·훅을 설정하지 않습니다.

```bash
copilot plugin marketplace add HakjunMIN/ai-native-harness
copilot plugin install ai-native-sdlc@ai-native-sdlc-marketplace
```

대상 저장소에서 Copilot 프로젝트 설치와 플러그인 설치를 동시에 활성화하면
동일 스킬/훅이 중복될 수 있으므로 한 방식만 사용하세요.

### Claude Code

```bash
claude --plugin-dir /absolute/path/to/ai-native-harness
```

또는 `/plugin marketplace add <경로>` 후
`/plugin install ai-native-sdlc@ai-native-sdlc-marketplace`.
스킬은 `/ai-native-sdlc:sdlc-setup`처럼 호출합니다.

### Codex

위 프로젝트 설치 명령을 사용하세요. `.codex-plugin/plugin.json`은 별도
패키징 매니페스트로 유지하지만, 이것만으로 대상 저장소의 Codex 훅이나
9개 네이티브 에이전트가 등록되지는 않습니다.

공통 스킬은 이식 가능하지만 **훅의 신뢰 승인·도구 권한·교차 모델 실행까지
자동 호환되는 것은 아닙니다.**
신규 light/strict에서 교차 모델 리뷰는 권고이며 같은 모델의 독립 세션을 사용할 수 있습니다.
명시적 강제 정책 또는 policy 없는 기존 기록은 교차 모델 미지원 시 해당 리뷰가 BLOCKED입니다.
인간 리뷰는 정책이 허용할 때만 사용할 수 있습니다. [호환성](docs/compatibility.md)을
확인하세요.

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

Jira 없이 시작하려면 대상 레포에 요구사항 파일을 작성한 뒤 로컬 ID로 초기화합니다.
파일에는 실제 사용자 요청과 범위를 적고 비밀정보는 넣지 마세요. 초기화는
G0/G1을 통과시키거나 Jira 이슈를 만들지 않습니다.

```bash
# 대상 레포에서 실행 (PLUGIN_ROOT는 설치된 플러그인 절대 경로)
node "$PLUGIN_ROOT/scripts/intake.mjs" start local-doc-update ./request.md
```

그다음 스킬을 호출합니다.

```text
sdlc local-doc-update
```

요청서 사본은 `docs/sdlc/local-doc-update/intake.md`, 상태는 같은 디렉터리의
`state.json`에 저장됩니다. 발견 단계에서 AC/모듈을 확인하고 G0 증거에 원본 요청
해시를 연결합니다. 로컬 실행은 Jira 연동·자식 발행·outbox 없이 진행하지만 G1/G2와
위험별 검증·리뷰, 실제 운영 변경의 인간 통제는 유지합니다.

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
