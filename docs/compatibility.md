# 하네스 호환성

## 지원 범위

| 기능 | Copilot CLI | Claude Code | Codex |
|---|---|---|---|
| SKILL.md | 프로젝트 `.agents/skills` 또는 플러그인 | 플러그인 namespace | 프로젝트 `.agents/skills` |
| 전문 에이전트 | 프로젝트 `.github/agents` 또는 플러그인 | 같은 Markdown 프로필 | 설치 시 `.codex/agents/*.toml` 생성 |
| 역할별 도구 선언 | 공식 호환 alias | native 도구 이름 | Markdown `tools` 미적용 |
| 훅 | 프로젝트 `.github/hooks` 또는 플러그인 | hooks/hooks.json | 프로젝트 `.codex/hooks.json`, 신뢰 승인 필요 |
| 모델 선택 | 런타임 지원 + 사용자 설정 확인 | 지원 모델 범위 확인 | 지원 모델 범위 확인 |
| 정책 기반 독립 리뷰 | 실제 독립 세션/도구 확인 | 동일 모델 독립 세션 가능 | 동일 모델 독립 세션 가능 |
| 외부 CLI 호출 | 사용 안 함 | 사용 안 함 | 사용 안 함 |

프로젝트 설치의 진입점은 루트 `install.sh`이며 설치 과정에서는 Node.js를
실행하지 않습니다. 공개 저장소의 curl 다운로드와 HTTPS Git clone에는
GitHub 인증이 필요하지 않습니다. 필요한 소스 파일을 대상 프로젝트의
`.ai-native-sdlc/`에 설치하며, 다시 실행하면 변경되지 않은 관리 파일을
갱신합니다. 설치 후 훅·워크플로우의 Node.js 22+ 요구는 그대로 유지됩니다.
기존 Node 설치기는 제거했습니다.

Copilot의 모델 선택 기능과 별도 Codex/Claude Code CLI 하네스 실행은 다릅니다.
이 패키지는 **로컬 역할별 모델 라우팅**을 사용하며 다른 CLI나 클라우드
coding agent를 호출하지 않습니다. 모델 ID를 고정하지 않습니다.

신규 light/strict 모두 교차 계열 리뷰는 권고이며 기본
`requireDifferentFamily: false`에서는 같은 모델의 독립 세션을 허용합니다.
실제 세션·모델·리뷰 증거는 여전히 필요합니다. 인간 검토는 승인 정책의
`allowHumanReview: true`일 때만 허용합니다.
명시적 `requireDifferentFamily: true` 또는 policy 없는 legacy 기록은 교차 계열
라우팅 미지원 시 해당 리뷰가 BLOCKED입니다. 새 기본값이 기존 승인을 바꾸지는 않습니다.
특정 이름의 호스트 보안 에이전트가 없어도 독립 리뷰어가 보안을 검토할 수 있지만,
필요한 전문성이나 검토 증거까지 없으면 해당 검토는 차단합니다.

repo config를 썼다고 런타임 설정이 자동 변경되지 않습니다. 컨덕터가 실제
지원되는 dispatch 인터페이스로 전달하고 반환 provenance를 확인해야 합니다.
역할 profile의 도구 이름은 공통 별칭(Read/Grep/Glob/Edit/Write/Bash)을 사용합니다.
호스트에서 인식되지 않는 권한은 setup에서 확인하고 부족한 기능을 보고합니다.

## 서브에이전트 도구 호환성

9개 프로필은 읽기 전용 3개(spec/code/cross reviewer)와 편집·실행 가능한
6개(architect/ux-designer/test-writer/implementer/verifier/release-engineer)로 나뉩니다.
모두 아래 6가지 이름만 선언하며 모델을 고정하지 않습니다.

| 현재 선언 | Claude Code | Copilot 공식 alias | Codex의 이 패키지 적용 |
|---|---|---|---|
| `Read` | 파일 읽기 | `read` | 호스트의 파일 읽기 기능으로 수행 |
| `Grep`, `Glob` | 내용/파일 검색 | `search` | 호스트의 검색 기능으로 수행 |
| `Edit`, `Write` | 파일 변경/생성 | `edit` | 호스트의 편집 기능으로 수행 |
| `Bash` | shell 실행 | `execute` | 호스트의 shell 실행 기능으로 수행 |

Claude Code는 `tools`에 YAML 배열을 지원하고 Copilot은 이 이름들을 공식
호환 alias로 문서화합니다. 따라서 **현재 선언은 두 하네스의 명세와 호환**됩니다.
허용 경로와 “테스트 파일 수정 금지” 같은 세부 범위는 이 선언만으로 강제되지
않으므로 컨덕터의 diff 감사와 실제 호스트 권한 설정이 별도로 필요합니다.

Codex의 native custom agent는 `.codex/agents/*.toml` 설정을 사용합니다.
프로젝트 설치 스크립트가 이 파일을 생성하고 각 Markdown 프로필을 읽도록 지시합니다.
`.agents/skills` 연결만으로는 에이전트가 등록되지 않으며 `tools` 배열이
native allowlist가 되지는 않습니다. 기본 도구 동작은 이식 가능해도 **동일한
도구 제한까지 자동 호환되지는 않습니다.** `sandbox_mode: "read-only"`도
shell 도구 자체를 제거한다는 뜻은 아니며 부모의 런타임 권한도 확인해야 합니다.

모든 프로필의 명시적 도구 목록에는 Skill·Agent/Task·웹·MCP·브라우저 도구가
없습니다. 스킬은 native 호출이 없으면 정확한 `SKILL.md` 경로를 읽고,
중첩 위임은 하지 않습니다. Jira/GitHub/브라우저 등의 증거가 필요한 역할은
컨덕터가 확인한 결과를 전달받거나 setup에서 실제 지원을 확인해야 합니다.
읽기 전용 리뷰어는 shell로 hash/git/test를 실행하지 않고 컨덕터의 결과를
검토합니다. Codex에서도 shell 검색밖에 없다면 이를 “읽기 전용 도구 허용”
이라고 추정하지 말고 컨덕터가 읽기 자료를 제공해야 합니다.
필수 증거가 없으면 관련 검사만 BLOCKED이며, 도구 이름을 임의로 추측하지 않습니다.

호스트를 바꿀 때는 `sdlc-handoff`로 상태·증거·미완료 변경을 보존하고 같은
소스 revision에서 `sdlc <ID>`로 재개합니다. 대상 호스트에서 역할 발견 여부,
실제 노출 도구와 권한, 파일/검색 동작, 작성 역할의 제한된 편집·테스트 동작을
각각 확인하세요. 스킬 로딩 성공을 서브에이전트 도구 검증으로 보고하지 않습니다.

## 검증 수준

`npm test`는 각 훅 입력/출력 어댑터와 loopback 서버, 증거/상태 계약을 검사합니다.
매니페스트의 구조 검사와 실제 설치 로딩은 구별합니다. 조직의 인증/허용 모델/
정책까지 동일하다고 보장하지 않으며 setup에서 실제 환경을 확인해야 합니다.
Codex 프로젝트 설치는 native 훅 설정과 에이전트 TOML을 생성하지만 실제 로딩,
훅 신뢰 승인 및 명령 차단 여부는 Codex 세션에서 별도로 확인해야 합니다.

이 저장소 구현 시에는 별도 `COPILOT_HOME`으로 로컬 경로 설치를 실행해 당시
스킬 27개의 발견과 로컬 마켓플레이스 등록을 확인했습니다. 이후 구현 태스크
스킬(현재 `sdlc-tasks`), `signoz-oss`, `clickstack`, `mimir-oss`,
`prometheus-query-api`를 추가해 현재 32개이며,
추가분은 `npm run validate` 구조 검사만 거쳤고 설치 로딩은 재확인하지 않았습니다. Claude 실행
파일은 현재 환경에서 사용할 수 없어 native validator를 실행하지 못했습니다.
Claude/Codex 실환경 실행은 검증되지 않았으며 구조/어댑터 테스트와 구별합니다.

2026-09-29 추가 점검:
- 공식 문서와 9개 프로필의 도구 선언을 대조했습니다. 새 Codex native 어댑터는 추가하지 않았습니다.
- Copilot CLI 1.0.88에서 `copilot --plugin-dir /absolute/path/to/ai-native-harness plugin list`가
  이 플러그인을 외부 플러그인으로 인식했습니다. 설치나 설정 변경은 하지 않았습니다.
- `claude --version`은 PATH의 shim에서 `claude not found in PATH`로 실패했습니다.
  따라서 Claude의 실제 로딩·도구 실행은 확인하지 못했습니다.
- Codex CLI 0.149.1의 version/help는 확인했습니다. `codex agents --help`에서는
  cmux wrapper 오류도 발생했습니다. 이 결과는 native 프로필 등록이나 도구 실행의 증거가 아닙니다.
- 세 하네스에서 9개 에이전트의 실제 도구 호출을 모두 실행한 end-to-end 검증은 하지 않았습니다.
  명세 호환, 플러그인 발견, 실제 실행 보장을 구분합니다.

프로젝트 설치 추가 점검:
- 임시 프로젝트에서 Copilot `skill list --json`으로 프로젝트 스킬 30개를 확인했고,
  Copilot `--agent sdlc-architect` 실행과 pre-tool 훅의 안전한 `echo` 차단을 확인했습니다.
- Codex `debug prompt-input`에 프로젝트 스킬 30개가 나타났습니다. Codex
  `doctor`는 구성 로딩에 성공했지만 인증 실패를 보고했습니다. 따라서 native
  에이전트 9개의 실행과 Codex 훅 신뢰 승인/실제 차단은 아직 검증되지 않았습니다.
  생성된 JSON 및 훅 명령 테스트가 이 실환경 검증을 대신하지 않습니다.

Copilot legacy manifest는 선택적 플러그인 설치용으로 유지합니다. Agent Plugins
1.0의 고정 component 경로와 섞지 않습니다. Claude는 기본 `agents/`, `skills/`,
`hooks/hooks.json` 검색을 사용하고 프로젝트 설치의 Copilot은 `.github/agents`,
`.github/hooks` 및 `.agents/skills` 경로를 사용합니다.

## 문서 근거

- [Copilot plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference)
- [Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [Custom agents](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [Claude Code subagents and tools](https://code.claude.com/docs/en/sub-agents)
- [Codex subagents and custom agent configuration](https://developers.openai.com/codex/subagents)
- [Claude plugin manifest](https://code.claude.com/docs/en/plugins-reference)
- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins)

제품 형식은 변경될 수 있습니다. 배포 시 설치된 CLI의 도움말·validator와
로컬 smoke 결과를 우선 확인합니다.
