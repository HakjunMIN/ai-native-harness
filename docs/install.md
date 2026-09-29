# 설치 및 확인

## Copilot CLI + Codex

이 저장소는 비공개입니다. `gh` 로그인과 Git SSH 접근 권한, curl, Git, Bash가
필요하며 대상 디렉터리는 미리 존재해야 합니다. Bash/zsh 터미널에서 `pipefail`을
켜고 README의 `curl | bash` 명령을 실행하세요. `curl` 인증 토큰은 명령 인수가
아닌 표준입력 설정으로 전달됩니다. 인증 없는 `raw.githubusercontent.com` URL은
404를 반환합니다.

파이프로 받은 코드를 바로 실행하는 것이 부담스럽다면 README 명령의 `curl` 부분에
`-o install.sh`를 추가해 스크립트를 저장하고 내용을 검토한 후
`bash install.sh /absolute/path/to/target-repo`를 실행하세요.

이미 리포를 체크아웃했다면 네트워크 연결 없이 다음처럼 설치할 수 있습니다.
하네스 리포와 대상 리포는 서로 다른 디렉터리여야 합니다.

```bash
bash /absolute/path/to/ai-native-harness/install.sh /absolute/path/to/target-repo
```

설치 후 훅과 SDLC 스크립트에는 **Node.js 22 이상**이 필요합니다.
curl 경로에서 스크립트를 스트리밍하면 매번 Git SSH로 지정한 ref의 최신
하네스 소스를 가져옵니다. 같은 명령을 다시 실행하면 대상 프로젝트의
관리 파일을 새 버전으로 갱신합니다. 다른 브랜치·태그를 사용한다면
스크립트 URL의 `ref`와 `AI_NATIVE_SDLC_REF`를 함께 맞추세요.
인증된 다른 Git 원격은 `AI_NATIVE_SDLC_REPO_URL`로 지정합니다.

설치 결과는 대상의 실제 `.ai-native-sdlc/` 파일, `.agents/skills/` 스킬 링크,
Copilot용 `.github/agents/`와 `.github/hooks/ai-native-sdlc.json`,
Codex용 `.codex/agents/`와 `.codex/hooks.json`입니다. `scripts/`와 `templates/`는
프로젝트 안의 런타임 자산이고 `tests/`와 `examples/`는 대상 루트에 복사되지
않습니다. 대상에 `AGENTS.md`가 없으면 프로젝트용 템플릿을 복사해
로컬 스킬 우선 사용, setup, 승인 게이트를 안내합니다. 하네스 루트의
`AGENTS.md`는 하네스 저장소 전용이므로 복사하지 않습니다. 이미 대상에
`AGENTS.md`가 있으면 수정하지 않고 경고만 출력하므로
[프로젝트용 템플릿](../templates/project-AGENTS.md)의 관련 지침을 직접
통합하세요. 관리 대상 설정은 변경되지 않았을 때만 재설치에서 갱신합니다.
기존 경로와 충돌하거나 이전에 설치한 관리 파일이 수정되어 있으면 덮어쓰지
않고 중단합니다. 기존 `.ai-native-sdlc` 공유 캐시 심볼릭 링크 설치는 자동
전환하지 않습니다. 이전 설치를 수동 정리하기 전에 프로젝트별 변경과
기존 훅·스킬 링크를 확인하세요. 다른 프로젝트 설정은 변경하지 않습니다.

대상에서 새 세션을 열어 Copilot `/skills`, `/agent` 또는
`copilot skill list`, Codex `/skills`, `/agent`, `/hooks`를 확인하세요. Codex는
프로젝트 설정과 훅 정의의 신뢰 승인이 필요합니다. 실제로 두 CLI에서 스킬
30개, 에이전트 9개, 훅의 차단 동작을 확인해야 합니다. 훅은 OS 보안 경계가
아니며 Codex는 에이전트 Markdown의 `tools`를 native 권한으로 해석하지
않습니다. 자세한 한계는 [호환성](compatibility.md)을 참고하세요.

## 호스트별 설치 (선택)

Copilot CLI만 사용하는 경우 마켓플레이스 플러그인을 쓸 수 있지만 Codex 설정은
생성되지 않습니다. 프로젝트 설치와 함께 활성화하면 스킬과 훅이 중복될 수
있으므로 한 방식만 사용하세요.

```bash
copilot plugin marketplace add HakjunMIN/ai-native-harness
copilot plugin install ai-native-sdlc@ai-native-sdlc-marketplace
```

Claude Code는 `claude --plugin-dir /absolute/path/to/ai-native-harness` 또는
마켓플레이스 등록 후 `/plugin install ai-native-sdlc@ai-native-sdlc-marketplace`를
사용할 수 있습니다. 스킬은 `/ai-native-sdlc:sdlc-setup`처럼 호출합니다.
Codex의 `.codex-plugin/plugin.json`만으로는 프로젝트 훅과 네이티브 에이전트가
등록되지 않으므로 위 프로젝트 설치를 사용하세요.
