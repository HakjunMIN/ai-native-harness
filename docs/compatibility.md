# 하네스 호환성

## 지원 범위

| 기능 | Copilot CLI | Claude Code | Codex |
|---|---|---|---|
| SKILL.md | 플러그인 로딩 | 플러그인 namespace | 스킬 설치/연결 |
| 전문 에이전트 | agents/*.agent.md | 같은 Markdown 프로필 | 로컬 역할 프롬프트로 읽기 |
| 훅 | hooks/copilot.json | hooks/hooks.json | 자동 등록하지 않음 |
| 모델 선택 | 런타임 지원 + 사용자 설정 확인 | 지원 모델 범위 확인 | 지원 모델 범위 확인 |
| 교차 계열 리뷰 | 실제 라우팅 검증 후 사용 | 미지원 시 BLOCKED | 미지원 시 BLOCKED |
| 외부 CLI 호출 | 사용 안 함 | 사용 안 함 | 사용 안 함 |

Copilot의 모델 선택 기능과 별도 Codex/Claude Code CLI 하네스 실행은 다릅니다.
이 패키지는 **로컬 역할별 모델 라우팅**을 사용하며 다른 CLI나 클라우드
coding agent를 호출하지 않습니다. 모델 ID를 고정하지 않습니다.

repo config를 썼다고 런타임 설정이 자동 변경되지 않습니다. 컨덕터가 실제
지원되는 dispatch 인터페이스로 전달하고 반환 provenance를 확인해야 합니다.
역할 profile의 도구 이름은 공통 별칭(Read/Grep/Glob/Edit/Write/Bash)을 사용합니다.
호스트에서 인식되지 않는 권한은 setup에서 확인하고 부족한 기능을 보고합니다.

## 검증 수준

`npm test`는 각 훅 입력/출력 어댑터와 loopback 서버, 증거/상태 계약을 검사합니다.
매니페스트의 구조 검사와 실제 설치 로딩은 구별합니다. 조직의 인증/허용 모델/
정책까지 동일하다고 보장하지 않으며 setup에서 실제 환경을 확인해야 합니다.
Codex에는 native hook·agent 변환기를 추측해서 제공하지 않습니다.

이 저장소 구현 시에는 별도 `COPILOT_HOME`으로 로컬 경로 설치를 실행해 27개
스킬 발견을 확인했고 로컬 마켓플레이스 등록도 확인했습니다. Claude 실행
파일은 현재 환경에서 사용할 수 없어 native validator를 실행하지 못했습니다.
Claude/Codex 실환경 실행은 검증되지 않았으며 구조/어댑터 테스트와 구별합니다.

Copilot legacy manifest를 유지합니다. Agent Plugins 1.0의 고정 component
경로와 섞지 않습니다. Claude는 기본 `agents/`, `skills/`, `hooks/hooks.json`
검색을 사용하고 Copilot은 명시된 `hooks/copilot.json`을 사용합니다.

## 문서 근거

- [Copilot plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference)
- [Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [Custom agents](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [Claude plugin manifest](https://code.claude.com/docs/en/plugins-reference)
- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins)

제품 형식은 변경될 수 있습니다. 배포 시 설치된 CLI의 도움말·validator와
로컬 smoke 결과를 우선 확인합니다.
