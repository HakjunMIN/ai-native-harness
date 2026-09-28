# ai-native-sdlc

Jira 티켓에서 시작해 **Discovery → Plan → Implement → Verify → Release**로
진행하는 로컬 AI 개발 워크플로우입니다. 27개 스킬과 9개 전문 에이전트를 제공합니다.
각 단계는 단독으로 실행할 수 있고, `sdlc`가 전체 진행·중단·재개를 관리합니다.

대상은 **Grafana datasource/panel/app + React/TypeScript → Spring Boot BFF
(Gradle) → SigNoz query-service** 모노레포입니다. BFF가 ClickHouse에 직접
접근하지 않으며 SigNoz 자체 UI는 노출하지 않습니다.

## 설치

Node.js 22 이상과 Bash가 필요합니다. 패키지 검증에는 외부 npm 의존성이 없습니다.
대상 서비스의 Java/Grafana/SigNoz 버전과 테스트 명령은 setup에서 확인합니다.

### GitHub Copilot CLI

팀 마켓플레이스 방식으로 이 플러그인 디렉터리의 절대 경로를 등록합니다.

```bash
copilot plugin marketplace add /absolute/path/to/ai-native-harness
copilot plugin install ai-native-sdlc@ai-native-sdlc-marketplace
```

현재 CLI의 직접 경로 설치(`copilot plugin install <절대 경로>`)도 가능하지만
deprecated 경고가 있으므로 위 마켓플레이스 방식을 권장합니다.

새 세션에서 대상 모노레포를 열고 `/skills`, `/agent`, `/plugin`에서 로딩을
확인합니다. 명령 표시가 namespace를 포함하면 표시된 이름을 사용합니다.

### Claude Code

```bash
claude --plugin-dir /absolute/path/to/ai-native-harness
```

또는 `/plugin marketplace add <경로>` 후
`/plugin install ai-native-sdlc@ai-native-sdlc-marketplace`.
스킬은 `/ai-native-sdlc:sdlc-setup`처럼 호출합니다.

### Codex

`.codex-plugin/plugin.json`은 스킬 패키지 호환 매니페스트입니다. 조직에서
설정한 Codex 마켓플레이스로 설치하거나, 아래처럼 모든 스킬을 프로젝트에서
발견하게 할 수 있습니다. 기존 경로는 덮어쓰지 않고 건너뜁니다.

```bash
# 대상 모노레포에서 실행
mkdir -p .agents/skills
for skill in /absolute/path/to/ai-native-harness/skills/*; do
  name="$(basename "$skill")"
  if [ -e ".agents/skills/$name" ] || [ -L ".agents/skills/$name" ]; then
    printf '기존 경로 유지: %s\n' "$name"
  else
    ln -s "$skill" ".agents/skills/$name"
  fi
done
```

공통 스킬은 이식 가능하지만 **훅·전문
에이전트 등록·교차 모델 실행까지 자동 호환되는 것은 아닙니다.**
지원되지 않는 교차 모델 게이트는 BLOCKED입니다. [호환성](docs/compatibility.md)을
확인하세요.

## 시작

```text
sdlc-setup
sdlc ABC-123
```

setup은 실제 모듈 경로, 빌드/테스트 명령, Jira 상태, 모델과 하네스 기능을
`ai-native-sdlc.config.json`에 기록합니다. 토큰은 저장하지 않습니다.
Atlassian Rovo MCP는 사용자가 별도로 연결·인증해야 합니다.

| 개별 스킬 | 결과 |
|---|---|
| sdlc-discover | Jira AC, 도메인 용어, HTML 비교 → 실제 Grafana 샌드박스, FE Gherkin |
| sdlc-plan | 아키텍처/계약/ADR, 수직 슬라이스, 테스트 매트릭스 |
| sdlc-implement | 테스트 작성자 RED → 구현자 GREEN/refactor → 스펙/표준 리뷰 |
| sdlc-verify | JUnit/API, Jest/RTL, Playwright BDD, axe/시각 회귀, 교차·보안 리뷰 |
| sdlc-release | CI·GitOps 프로모션 확인과 사람이 실행할 운영 배포 제안 |
| sdlc-handoff | 새 세션/에이전트를 위한 증거 기반 인수인계 |

백엔드는 JUnit 기반 유닛/통합/API 테스트만 사용합니다. Gherkin은 FE E2E에만
적용합니다. 테스트 변경과 구현은 역할을 분리하며, 역할별 허용 경로는 지침과
diff 감사로 통제합니다. OS 파일 접근 권한을 강제하는 sandbox는 아닙니다.

## 승인과 재개

G1(디스커버리), G2(플랜), G5b(운영 반영)는 사람 승인이 필수입니다.
다른 계열 모델 리뷰를 지원하지 않거나 테스트 인프라가 없으면 진행을 중단합니다.
HTML 클릭, 문서 존재, 이전 세션의 “통과” 요약은 승인이 아닙니다.

산출물은 `docs/sdlc/ABC-123/`에 저장합니다. `state.json`은 증거 파일의 SHA256,
코드 revision과 승인 참조를 연결합니다. 새 세션에서도 `sdlc ABC-123`으로 재개합니다.
[운영 절차](docs/operations.md)와 [예시 티켓](examples/ABC-123/README.md)을 참고하세요.

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
