# 설치 및 확인

## MSA 공유 설치: 형제 리포 + 심볼릭 링크

이 방식은 같은 부모 디렉터리 아래의 여러 서비스 리포가 한 하네스 Git 클론을
공유할 때 사용합니다. 기존 복사 설치와 별개의 선택지이며, 두 방식 모두
Copilot CLI와 Codex에 스킬·에이전트·훅을 등록합니다.

### 실행

대상 리포를 먼저 체크아웃하고 Git, Node.js 22 이상을 준비하세요.
아래 명령은 하네스가 없어도 형제 경로에 클론한 뒤 연결합니다.
스트리밍 실행은 README의 Bash/PowerShell 예제를 사용합니다. 원격 코드를 검토하려면
설치 스크립트를 저장한 뒤 실행하고, 부트스트랩이 내려받는
[공통 설치 로직](../scripts/install-shared.mjs)도 함께 검토하세요.
하네스를 이미 체크아웃한 경우에는 네트워크에서 설치 로직을 내려받지 않습니다.

```bash
bash /workspace/ai-native-harness/install-shared.sh \
  /workspace/service-api /workspace/service-web /workspace/service-worker
```

```powershell
& 'C:\workspace\ai-native-harness\install-shared.ps1' `
  'C:\workspace\service-api' 'C:\workspace\service-web' 'C:\workspace\service-worker'
```

PowerShell 7+를 권장합니다. macOS/Linux에서도 PowerShell 스크립트를 사용할 수 있습니다.
Windows는 디렉터리·파일 심볼릭 링크 모두를 생성하므로 개발자 모드를 활성화하거나
관리자 PowerShell에서 실행해야 합니다. 권한이 없으면 오류와 함께 대상의 설치 변경을
되돌리며, junction이나 복사로 조용히 대체하지 않습니다. 공유 설치의 훅은
Node 모듈을 직접 실행하므로 Windows에 Bash를 추가 설치할 필요가 없습니다.

| 옵션 | 기본값 / 동작 |
|---|---|
| `TARGET [TARGET ...]` | 이미 존재하는 하나 이상의 형제 리포 경로. 공백이 있으면 따옴표 사용 |
| `--shared-dir PATH` | 대상들의 부모 경로 아래 `ai-native-harness`. 다른 이름의 형제 경로 지정 가능 |
| `--repo-url URL` | `AI_NATIVE_SDLC_REPO_URL` 또는 공개 GitHub 저장소 |
| `--ref BRANCH` | `AI_NATIVE_SDLC_REF` 또는 `main`. 공유 설치에서는 브랜치 사용 |
| `--help` | 사용법 출력 |

```bash
bash /workspace/ai-native-harness/install-shared.sh \
  /workspace/service-api /workspace/service-web \
  --shared-dir /workspace/team-harness --ref stable --repo-url https://github.com/your-org/ai-native-harness.git
```

PowerShell도 동일한 옵션을 사용합니다. 스트리밍/다운로드한 설치기에서 다른 브랜치의
부트스트랩 코드까지 사용할 때는 스크립트 URL과 `AI_NATIVE_SDLC_REF` 환경변수를
함께 맞추세요. 커스텀 원격의 부트스트랩은 `AI_NATIVE_SDLC_INSTALLER_URL`로
설치 로직의 raw URL을 지정하거나, 해당 원격의 설치기와 공통 설치 로직을 함께
체크아웃한 뒤 실행합니다. `--repo-url`만 바꾸면 부트스트랩 코드 URL은 바뀌지 않습니다.

### 연결 구조와 프로젝트별 지침

| 대상 경로 | 설치 방식 |
|---|---|
| `.ai-native-sdlc` | 형제 하네스 클론으로 향하는 상대 심볼릭 링크. `skills/`, `hooks/`, `agents/`, `scripts/`, `templates/` 공유 |
| `.agents/skills/<name>` | 공유 스킬 디렉터리로 향하는 상대 링크 |
| `.github/agents/*.agent.md` | 공유 서브에이전트 역할 원문으로 향하는 상대 링크 |
| `AGENTS.md` (없을 때만) | 공유 `templates/project-AGENTS.md`로 향하는 상대 링크 |
| `.codex/agents/*.toml` | 대상 리포의 공유 역할 원문 경로를 읽도록 생성한 네이티브 에이전트 설정 |
| `.github/hooks/ai-native-sdlc.json`, `.codex/hooks.json` | 공유 Node 훅을 호출하는 리포별 설정. Copilot은 `bash`와 `powershell` 모두 제공 |
| `.ai-native-sdlc.links.json` | 링크·설정 소유권과 변경 검사용 리포별 매니페스트 |

하네스 루트의 `AGENTS.md`는 하네스 개발용이므로 서비스 리포에 연결하지 않습니다.
대상에 기존 `AGENTS.md`가 있으면 그대로 보존하고 공통 지침 통합 안내만 출력합니다.
**링크된 `AGENTS.md`를 편집하면 모든 리포의 공통 템플릿이 변경됩니다.**
프로젝트별 지침은 `sdlc-setup`과 `retro`가 공통으로 따르는
[안전한 프로젝트 지침 절차](../skills/sdlc-setup/references/project-instructions.md)를
먼저 적용하세요. `lstat`·소유권·설치 lock을 확인하고 원본 내용을 보존한 뒤
**대상 리포의 링크만 일반 파일로 전환**합니다. 매니페스트에서는 `AGENTS.md`
항목만 제거해야 재설치가 사용자 파일로 보존합니다. 이후 공통 지침 변경은
직접 검토·통합합니다. 프로젝트 설정 파일, 상태, 문서,
애플리케이션 코드는 각 서비스 리포에 남습니다.

### 업데이트·충돌·기존 설치

- 티켓 lock이 있는 SDLC 작업은 설치된 최신 자산이 아니라 고정된 스냅샷을
  사용합니다. 공유 업데이트는 새 작업과 standalone 스킬, 현재 공통 훅에 반영되며
  기존 티켓을 자동 전환하지 않습니다. [티켓 리비전 관리](../skills/sdlc/references/harness-revisions.md)를 참고하세요.
- 첫 작업 생성 시 `.ai-native-sdlc-revisions/<SHA256>/`에 실행 자산을 보관합니다.
  공유 설치는 실제 하네스 클론 옆에서 여러 서비스가 공유하고, 복사 설치는 각
  서비스 리포 내부에 둡니다. 캐시는 애플리케이션 커밋에서 제외하고 티켓 lock과
  상태·이력은 함께 관리하세요. 설치기는 이 캐시를 정리하지 않습니다.
- 공유 클론이 있으면 원격 주소와 현재 브랜치를 확인하고 `git pull --ff-only`를
  실행합니다. 로컬 변경, 다른 원격/브랜치, 분기된 이력은 중단하며 강제 리셋하지 않습니다.
- 한 리포만 지정해도 공유 스킬·훅 코드·역할·공통 지침 업데이트는 모든 연결 리포에
  반영됩니다. 스킬/에이전트 추가·삭제와 리포별 설정 변경은 전체 대상을 지정하여
  설치기를 다시 실행해야 연결 목록에 반영됩니다. 업데이트 전에 영향과 신뢰를 검토하세요.
- 대상 전체를 사전 검사한 후 설치하며, 기존 파일 충돌이나 수정된 관리 설정은
  덮어쓰지 않습니다. 설치 중 실패하면 대상 파일 변경을 되돌립니다.
  **이미 수행한 공유 클론/풀은 되돌리지 않으므로**, 실패해도 연결된 기존 리포의
  공유 자산은 업데이트된 상태일 수 있습니다.
- 설치 잠금은 동시 설치를 차단합니다. 강제 종료로 잠금이 남으면 실행 중인 설치가
  없는지 확인한 후 해당 `.install-lock` / `.shared-install-lock` 디렉터리만 제거하세요.
- 기존 `install.sh`의 복사 설치와 과거의 매니페스트 없는 공유 캐시 링크는 자동 전환하지
  않습니다. 프로젝트별 변경을 백업하고, 이전 관리 파일·링크와 설정을 직접 검토·정리한 뒤
  새 방식을 실행하세요. 공유 설치 위에 복사 설치를 실행해도 자동 전환하지 않습니다.
- 공유 클론을 이동/삭제하면 링크가 끊깁니다. 형제 디렉터리 구조를 유지하고,
  개발자마다 하네스 설치를 수행하세요. 훅·Codex 설정은 절대 경로를 포함하므로
  다른 머신에서 그대로 재사용하지 마세요. 설치 산출물을 Git으로 관리할지는 팀 정책에
  따라 결정하며, 필요하면 `.git/info/exclude` 등으로 로컬 전용 처리합니다.

설치 후 CLI를 재시작하고 아래의 스킬·에이전트·훅 확인 절차를 동일하게 적용하세요.

## 기존 Copilot CLI + Codex 복사 설치

이 저장소는 공개되어 있어 GitHub 인증 없이 설치할 수 있습니다. curl, Git,
Bash가 필요하며 대상 디렉터리는 미리 존재해야 합니다. Bash/zsh 터미널에서
`pipefail`을 켜고 README의 `curl | bash` 명령을 실행하세요.

파이프로 받은 코드를 바로 실행하는 것이 부담스럽다면 README 명령의 `curl` 부분에
`-o install.sh`를 추가해 스크립트를 저장하고 내용을 검토한 후
`bash install.sh /absolute/path/to/target-repo`를 실행하세요.

이미 리포를 체크아웃했다면 네트워크 연결 없이 다음처럼 설치할 수 있습니다.
하네스 리포와 대상 리포는 서로 다른 디렉터리여야 합니다.

```bash
bash /absolute/path/to/ai-native-harness/install.sh /absolute/path/to/target-repo
```

설치 후 훅과 SDLC 스크립트에는 **Node.js 22 이상**이 필요합니다.
curl 경로에서 스크립트를 스트리밍하면 매번 공개 HTTPS Git 저장소에서 지정한 ref의 최신
하네스 소스를 가져옵니다. 같은 명령을 다시 실행하면 대상 프로젝트의
관리 파일을 새 버전으로 갱신합니다. 다른 브랜치·태그를 사용한다면
스크립트 URL의 브랜치 경로와 `AI_NATIVE_SDLC_REF`를 함께 맞추세요.
다른 Git 원격을 사용할 때는 `AI_NATIVE_SDLC_REPO_URL`로 지정합니다.

설치 결과는 대상의 실제 `.ai-native-sdlc/` 파일, `.agents/skills/` 스킬 링크,
Copilot용 `.github/agents/`와 `.github/hooks/ai-native-sdlc.json`,
Codex용 `.codex/agents/`와 `.codex/hooks.json`입니다. 설치본에는 스킬·에이전트·훅과
`scripts/`, `templates/`, 런타임 참조 문서 `docs/operations.md`, `docs/compatibility.md`를
포함합니다. 이 경로들은 `.ai-native-sdlc/` 내부이며 서비스의 `docs/`를 덮어쓰지 않습니다.
`tests/`와 `examples/`는 대상 루트에 복사되지
않습니다. 대상에 `AGENTS.md`가 없으면 프로젝트용 템플릿을 복사해
로컬 스킬 우선 사용, setup, 승인 게이트를 안내합니다. 하네스 루트의
`AGENTS.md`는 하네스 저장소 전용이므로 복사하지 않습니다. 이미 대상에
`AGENTS.md`가 있으면 수정하지 않고 경고만 출력하므로
[프로젝트용 템플릿](../templates/project-AGENTS.md)의 관련 지침을 직접
통합하세요. 관리 대상 설정은 변경되지 않았을 때만 재설치에서 갱신합니다.
기존 경로와 충돌하거나 이전에 설치한 관리 파일이 수정되어 있으면 덮어쓰지
않고 중단합니다. 새 공유 설치나 기존 `.ai-native-sdlc` 공유 캐시 심볼릭 링크 설치는 자동
전환하지 않습니다. 이전 설치를 수동 정리하기 전에 프로젝트별 변경과
기존 훅·스킬 링크를 확인하세요. 다른 프로젝트 설정은 변경하지 않습니다.

대상에서 새 세션을 열어 Copilot `/skills`, `/agent` 또는
`copilot skill list`, Codex `/skills`, `/agent`, `/hooks`를 확인하세요. Codex는
프로젝트 설정과 훅 정의의 신뢰 승인이 필요합니다. 실제로 두 CLI에서 스킬
<!-- skill-count -->36개, 에이전트 9개, 훅의 차단 동작을 확인해야 합니다. 훅은 OS 보안 경계가
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
