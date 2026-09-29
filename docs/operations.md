# 운영 절차

## 상태 검사

대상 모노레포에서 실행합니다. `PLUGIN_ROOT`는 설치 디렉터리의 실제 절대 경로입니다.

### Jira 없는 로컬 시작

일반 사용자는 대상 레포에서 `sdlc <자연어 요청>`으로 시작합니다. 필요한 내용만
인터뷰하고 원문·확인된 범위·질문과 답변·미해결 질문을 기록합니다. `sdlc`만
호출하면 기존 실행 상태를 조회합니다. CLI는 인터뷰를 수행하지 않으며 아래 명령은
자동화나 수동 초기화에 사용합니다. 비밀정보는 입력에서 제외하세요. 로컬 ID는
소문자/숫자/하이픈으로 구성한 `local-<slug>`이며 기존 ID를 덮어쓰지 않습니다.

```bash
# 인터뷰 결과 Markdown을 표준입력으로 전달 (대상 레포에서 실행)
printf '# Request\n\nUpdate documentation without Jira.\n' |
  node "$PLUGIN_ROOT/scripts/intake.mjs" start-text local-doc-update

# 이미 작성된 요청 파일을 사용하는 선택적 자동화 방식 (서로 다른 ID 사용)
node "$PLUGIN_ROOT/scripts/intake.mjs" start local-doc-update-file ./request.md

node "$PLUGIN_ROOT/scripts/state.mjs" check docs/sdlc/local-doc-update/state.json
node "$PLUGIN_ROOT/scripts/state.mjs" next docs/sdlc/local-doc-update/state.json
```

초기화는 입력 내용을 `intake.md`에 저장하고 해시를 `state.intake.request`에
기록하지만 G0·G1을 pending으로 남깁니다. Discovery에서 AC/모듈을 확인한 후
G0 evidence에 같은 요청서 참조를 넣어야 합니다. 내용 변경은 해시 불일치로 차단합니다.
초기 분류는 보수적으로 architectural이며 `uiChange: false`는 미확인 기본값이므로
발견 단계에서 실제 위험/화면 변경 여부를 판단해 수정합니다.
Jira 프로젝트/MCP 없이 시작할 수 있으며 strict 계획도 G2 후 publish를 건너뜁니다.
`ready` 결과의 `key`에는 로컬 ID가 표시되며 Jira 키나 원격 발행 증거가 아닙니다.
로컬 실행은 Jira writeback/outbox/Done을 요구하거나 보고하지 않습니다.
G1/G2/G5b 인간 승인과 실제 운영 배포 권한은 그대로 유지됩니다. 기존 Jira 실행을
로컬로 재표기하지 말고 필요하면 별도 ID로 시작하세요.

### Jira 키로 상태 검사

```bash
node "$PLUGIN_ROOT/scripts/state.mjs" check docs/sdlc/ABC-123/state.json
node "$PLUGIN_ROOT/scripts/state.mjs" next docs/sdlc/ABC-123/state.json
node "$PLUGIN_ROOT/scripts/state.mjs" ready docs/sdlc/ABC-123/state.json
node "$PLUGIN_ROOT/scripts/state.mjs" invalidate docs/sdlc/ABC-123/state.json G2 "API 계약 변경"
```

승인 명령은 제공하지 않습니다. 인간의 실제 승인 메시지/PR 참조와 시각을 기록하고
승인 대상 파일 hash를 증거에 포함합니다. 해시 검사로 파일 변경을 감지할 수 있지만,
에이전트가 쓰는 JSON만으로 승인자의 신원을 인증할 수는 없습니다.

게이트 기록 후에는 `next`의 출력을 `phase`에 반영하고 `check`를 다시 실행합니다.
`next`는 이전 단계명이 남아 있어도 다음 단계를 계산하지만 파일을 수정하지 않습니다.
증거·승인·선행 게이트·revision 검사는 그대로 수행하며, 알 수 없는 단계명은 거부합니다.
`check`와 `ready`는 기록된 단계까지 일치해야 통과합니다.

G3 이후는 필요한 사용자 허가를 받아 코드 commit을 확정하고 그 SHA로 증거를 수집합니다.
워크플로우 필요만으로 임의 commit하지 않습니다. source 변경이
생기면 하류 게이트를 무효화하고 다시 확인합니다. 문서-only commit으로 HEAD가
바뀐 경우에도 diff를 확인한 뒤 바인딩을 갱신합니다. CI는 항상 현재 PR SHA에서
실행돼야 합니다. `docs/sdlc/` 밖의 uncommitted 변경은 보수적으로 차단합니다.

## 브랜치와 병렬 워크트리

G2 승인 계획과 manifest를 사용자 허가를 받아 **먼저 commit**하고, 구현 직전에
`ready` 결과와 실제 코드·테스트·공유 계약의 영향 범위를 검토합니다. 단일 작업
또는 겹쳐서 순차 실행해야 할 작업에는 현재 checkout의
`sdlc/<ID>/integration` 브랜치만 사용합니다. 독립적인 여러 작업에는 같은
integration HEAD에서 `sdlc/<ID>/t<N>` 브랜치와 별도 워크트리를 만듭니다.
경로가 달라도 공통 API/스키마/설정/동작에 영향을 주면 병렬 처리하지 않습니다.

```bash
# 한 개의 준비된 작업: 별도 워크트리 없음
node "$PLUGIN_ROOT/scripts/workspaces.mjs" plan docs/sdlc/local-doc-update/state.json
node "$PLUGIN_ROOT/scripts/workspaces.mjs" start docs/sdlc/local-doc-update/state.json

# 여러 작업: docs/sdlc/ABC-123/scopes.json = {"1":["src/a","tests/a"],"2":["src/b","tests/b"]}
node "$PLUGIN_ROOT/scripts/workspaces.mjs" plan docs/sdlc/ABC-123/state.json docs/sdlc/ABC-123/scopes.json
node "$PLUGIN_ROOT/scripts/workspaces.mjs" start docs/sdlc/ABC-123/state.json docs/sdlc/ABC-123/scopes.json
```

범위 파일은 준비된 ID별 정확한 레포 상대 경로 목록입니다(글롭 불가).
`docs/sdlc/`, `.git`, 겹치는 파일/상위 디렉터리는 공동 수정 범위로 취급합니다.
`plan`은 선택/보류 ID와 `branch`/`worktree`/`waiting`을 출력합니다.
`start`는 깨끗한 소스 checkout과 commit된 G2 계획을 확인하고, 브랜치/워크트리를
만든 뒤 상태를 `in_progress`로 기록합니다. commit·merge·push·작업자 dispatch는
하지 않습니다. 워크트리는 레포 옆 `<repo>.sdlc-worktrees/<ID>/t<N>`에 생성됩니다.
공유 state/증거는 기존 checkout의 컨덕터만 수정합니다. 각 작업자는 할당된
워크트리와 허용 경로만 변경하고 SHA/검증 증거를 반환합니다. 재개 시 기록된
branch/path와 진행 중인 작업을 확인하고 `start`를 다시 호출해 중복 생성하지 않습니다.

컨덕터는 결과와 충돌을 검토하고 commit 허가가 있을 때만 워크트리 커밋을
integration 브랜치에 한 개씩 통합합니다. 자동 merge/commit은 없습니다.
`git merge --no-commit --no-ff <slice-branch>`로 검토·충돌 해결 후 허가된
commit을 만들 수 있습니다. 작업자가 기록한 `slice.subjectHead`는 원본
슬라이스 커밋으로 유지하고, 통합 HEAD는 G3의 `subjectHead`에 기록합니다.
통합 후에만 의존 슬라이스를 시작합니다. 충돌 해결·추가 수정 후에는 영향받는
검사와 리뷰를 새 revision에 맞춰 다시 수행합니다. 모든 슬라이스를 통합한 뒤
전체 검사/G4 검증을 실행하고 `state.mjs check`로 선행 커밋의 조상 관계를
확인합니다. 통합 완료·증거 보존 후에만 `git worktree remove <path>`와
`git branch -d <slice-branch>`로 작업 공간을 정리합니다.
G3 무효화 후에도 승인 계획이 같으면 기존 integration 브랜치에서 재검증을
시작합니다. 이전 슬라이스 워크트리가 남아 있으면 변경사항을 먼저 대조하고
통합/보관한 뒤 정리하세요. 기존 워크트리 경로·슬라이스 브랜치를 무조건
덮어쓰지 않으며, 충돌이 있으면 `start`가 중단됩니다.

## 정책과 계획 생성

새 bounded·저위험·단일 결과는 `workflow.boundedProfile: "light"`로 Jira 부모
또는 로컬 ID를 사용합니다. 위험·아키텍처·다중 결과 작업과 기존 policy 없는
기록은 strict입니다.
Light는 테스트/구현 작성자 통합과 독립 combined 리뷰를 허용합니다.
신규 light/strict 모두 `review.requireDifferentFamily`와 `allowHumanReview`가
실제 정책에 반영됩니다. 교차 모델은 권고이며 `requireDifferentFamily`의 기본값은
false입니다. 같은 모델이라도 작성자와 독립된 세션에서 리뷰하고 실제 신원·세션·증거를
기록해야 합니다. Strict의 계획/최종 리뷰와 spec/standards 축 분리는 유지합니다.
명시적으로 true를 설정하면 교차 계열이 필수이며 인간 리뷰로 대체할 수 없습니다.
false일 때 인간 리뷰는 `allowHumanReview: true`인 경우에만 허용합니다
(이 필드가 없으면 false, 제공되는 설정 템플릿은 true). 인간 G1/G2/G5b는 모두 유지합니다.

G1 승인 후 [구현 태스크 정의 템플릿](../templates/task-plan.json)으로 draft를 작성합니다.
정규 정의의 `tasks`와 상태의 `taskPlan`을 생성기가 연결합니다.
구현 태스크는 Jira 발행 전에도 존재하며, 로컬 실행에서는 Jira 티켓을 만들지 않습니다.

```bash
node "$PLUGIN_ROOT/scripts/tasks.mjs" prepare docs/sdlc/ABC-123/state.json ai-native-sdlc.config.json docs/sdlc/ABC-123/task-draft.json
```

도구는 `plans/<revision>/tasks.json`과 strict 상세 Markdown을 생성하고 해시와
policy를 state에 등록합니다. AC를 두 파일에서 수동 관리하지 않습니다.
승인·Jira 작업은 수행하지 않습니다. G2가 manifest와 policy를 함께 승인하며,
config 편집만으로 승인된 정책이 바뀌지 않습니다. 변경은 G2 무효화·재생성·재승인합니다.
기존 `requireDifferentFamily: true` snapshot과 policy 없는 legacy 기록의
교차 계열 요건도 유지합니다. 이를 권고로 전환하려면 config의
`review.requireDifferentFamily`를 false로 정한 뒤 아래 순서로 새 정책을 승인합니다.

```bash
node "$PLUGIN_ROOT/scripts/state.mjs" invalidate docs/sdlc/ABC-123/state.json G2 "교차 모델을 권고 정책으로 전환"
node "$PLUGIN_ROOT/scripts/tasks.mjs" prepare docs/sdlc/ABC-123/state.json ai-native-sdlc.config.json docs/sdlc/ABC-123/task-draft.json
```

새 manifest·리뷰를 확인하고 **사람의 G2 재승인**을 받은 후 재개합니다.
이전 승인/구현 증거를 자동 승계하지 않으며 기존 Jira 발행 기록은 동일 키로
재조정·재확인합니다. 이미 끝난 실행 이력은 변경하지 않습니다.

Behavior는 RED/GREEN, refactor는 before/GREEN, 문서·config는 의미 있는 정적·스키마
또는 관련 검사 증거를 사용합니다. 비동작 모드는 `verificationReason`이 필요하며
실제 동작 변경을 config/refactor로 포장할 수 없습니다. G4는 보안 검토까지 필요하지만
특정 호스트 보안 에이전트는 필수가 아닙니다. Light combined 리뷰는 동일 revision과
전체 범위·보안 coverage가 확인될 때만 G4에서 재사용합니다.

## Jira 장애

### Jira 자식 티켓 발행

Strict/legacy의 `sdlc-plan`은 설계 뒤 `sdlc-tasks` draft를 사용합니다. 생성된
manifest·문서 해시·AC·의존성 그래프를 리뷰하고 사람이 G2 승인합니다.
`taskPlan`에는 manifest 경로/해시를 넣고 G2 evidence에도 같은 참조를 넣습니다.
생성된 구현 태스크 뷰의 의미는 [안내](../templates/task.md), 상태 필드는
[구현 태스크 계약](../skills/sdlc-tasks/references/task-contract.md)을 따릅니다.

Strict/legacy는 G2 이후 `phase=publish`, light는 `phase=implement`이며 자식을 만들지
않습니다. Strict 발행은 setup에서 확인한 Jira 이슈 타입·필수 필드·
부모 관계·blocks 관계를 사용하며, 지원하지 않는 관계는 운영자와 명시적으로
합의해야 합니다. 권한이 없다고 임의 이슈 타입이나 로컬 파일로 대체하지 않습니다.
G2가 승인한 범위만 발행하고 모든 내용/관계의 원격 반영 확인 후 구현합니다.

생성 전에 안정적인 `sdlc:<PARENT>:ticket:<id>` marker와 요청을 outbox에 저장하고,
전송 직전 `unknown`으로 기록합니다. 생성 응답의 key는 즉시 보존합니다.
내용/관계 readback까지 성공해야 `publications`가 confirmed입니다. timeout 후에는
marker로 재조회하고, 이미 존재하면 그 Jira 티켓을 복구합니다. 조회 0건도 색인 지연일 수
있으므로 불명확한 생성 결과를 즉시 재시도하지 않습니다. 중복은 사람에게 인계합니다.

`ready`는 구현 단계에서만 실행하며 `[{ "id": 1, "key": "ABC-124" }]` 형태의
준비된 구현 태스크를 반환합니다(light의 key는 부모 `ABC-123`; 로컬 실행의 key는
로컬 ID). 부모 state 하나가 실행/승인을 관리합니다. 의존 Jira 티켓의 상태가
아니라 선행 태스크의 실제 로컬 done 증거로 다음 태스크를 판단합니다.
G3 무효화는 ID/발행 정보를 유지하고 실행만 초기화합니다. 영향 분석이 있으면:

```bash
node "$PLUGIN_ROOT/scripts/state.mjs" invalidate docs/sdlc/ABC-123/state.json G3 "국소 코드 수정" --slices 1,2 --impact evidence/impact.md
```

선택한 슬라이스와 전이 의존자만 초기화하고 무관한 완료 증거는 유지합니다.
영향 문서는 실행 디렉터리 내부의 실제 파일이어야 하며 해시를 검증합니다. 공통 경계 영향이
불명확하면 전체 초기화를 사용합니다. 어느 경우든 통합 G3/G4는 새로 검증합니다.
G2 이전 무효화는
기존 발행 기록을 stale로 보존하고, 재승인 뒤 동일 Jira key를 갱신·재확인합니다.

G3 재검증에서는 이미 완료된 구현 태스크의 historical RED를 별도 보존합니다.
변경 없는 동작·테스트는 담당 작성자(strict: test-writer)가 출처를 확인한 뒤 새 GREEN·리뷰와
함께 사용할 수 있습니다. 새 회귀 수정이나 테스트 변경은 새 RED가 필요합니다.
이미 정상인 테스트를 일부러 실패시키거나 이전 출력을 새 실행으로 표시하지 않습니다.
G2 무효화는 낡은 manifest 참조를 history에 보관하고 active 참조를 null로
초기화하므로, 문서가 이미 바뀐 경우에도 승인 없이 draft 복구를 시작할 수 있습니다.

### 기존 상태 마이그레이션

schema 1은 자동 승인 승계 없이 명시적으로 차단합니다. 원본 state·문서·로그를
별도 감사용 파일로 보존한 뒤, 재개할 실행에 대해서만 다음 절차를 적용합니다.

1. 기존 G2 이후로 진행된 실행은 먼저 `invalidate <state> G2 "구현 태스크 워크플로우로 전환"`을 실행합니다. 이미 끝난 릴리스 기록은 재개하지 말고 보관합니다.
2. `schemaVersion`을 2로 바꾸고 `taskPlan: null`, `publications: []`를 추가합니다. 기존 Jira 자식이 있다면 빈 목록으로 잊지 말고 실제 키·marker·증거를 검토하여 stale 기록으로 옮깁니다. 기존 증거로 현재 승인을 꾸미지 않습니다.
3. G0/G1의 유효한 원본 증거는 보존합니다. 상세 구현 태스크 draft와 pending slices를 만들고 `taskPlan` 해시를 등록합니다. 요구사항이 바뀌었으면 G1부터 재승인합니다.
4. 새 계획·구현 태스크 그래프를 정책에 따라 독립 리뷰하고 G2를 다시 받습니다. 교차 계열은 새 정책의 명시적 강제 또는 policy 없는 legacy 기록일 때 필수입니다. 기존 Jira 이슈는 재사용/조정하고 새 발행은 승인 후에만 수행합니다. 마지막으로 `check`, `next`를 실행합니다.

schema 1의 단순 버전 숫자 변경만으로 구현을 재개할 수 없습니다. G2 미도달
실행은 기존 pending 게이트를 유지하고 필요한 필드를 추가하면 됩니다.

### 기타 동기화 장애

읽기 실패이며 snapshot도 없으면 G0 이전에서 중단합니다. 이미 승인된 snapshot이
있는 Jira 티켓의 writeback 장애는 `jira-outbox.md`에 operation ID, 대상 상태 ID,
요청, pending/unknown 상태와 오류를 기록하고 알립니다. timeout 후 중복 재시도
전에 코멘트 marker와 현재 상태를 재조회합니다. 접근 권한 없는 첨부는 우회하지
않습니다. 원격 반영 확인 전에는 synced로 표시하지 않습니다.

## 비주얼 컴패니언

```bash
node "$PLUGIN_ROOT/scripts/visual-server.mjs" /absolute/ticket/prototype/html 0
```

`index.html`과 `options.json`이 필요합니다. 표준 출력의 loopback URL을 열고
선택 결과 `selection.json`을 읽습니다. 파일은 `approved:false`로 저장됩니다.
실제 Grafana 플러그인 API/테마 적합성은 별도 샌드박스에서 확인합니다.
서버는 synthetic prototype 폴더만 제공하며 LAN/원격 공개하지 않습니다.

## 릴리스

GitHub Actions 필수 체크를 PR head SHA로 조회합니다. 배포 image는 immutable
digest로 고정합니다. 인간이 dev/staging GitOps PR을 머지하고 ArgoCD revision/
sync/health와 smoke를 확인한 뒤 prod 변경안을 넘깁니다. 소스/차트가 바뀌면
기존 verify 증거를 재사용하지 않습니다.

운영 제안은 `production-proposal/`의 파일로만 작성합니다. 사람이 실제 prod
변경을 반영합니다. prod 승인과 배포 상태를 관측하기 전 G5b/Jira Done 금지입니다.
장애 시 임의 kubectl patch 대신 검증된 이전 digest로 GitOps 복구안을 작성합니다.

## 훅 한계

명령/경로 패턴 검사로 모든 shell 의미를 분석할 수 없습니다. 별도 프로그램,
API, 비표준 MCP, hook 비활성화·timeout은 통제 범위 밖입니다. 훅은 malformed
입력/설정을 deny하지만 실행기 자체의 timeout 정책은 호스트에 달려 있습니다.
prod 자격증명은 에이전트에 제공하지 말고 CI 환경 승인과 ArgoCD RBAC를 사용하세요.

차단 대상이 아닌 호출에는 `allow`를 보내지 않고 중립 결과를 반환하여 호스트의
기존 권한 확인을 유지합니다. 문서 내용 속 prod 경로와 실제 변경 대상 경로를
구분하므로 운영 패치 원문을 proposal 파일로 저장할 수 있습니다.

단순한 관측·렌더링 명령은 별도로 구분합니다. `kubectl rollout status/history`,
`kubectl get/describe`, `helm template/status/history/get values/get manifest`,
`argocd app get/diff/history`는 지원하는 옵션에 한해 운영 경로를 읽어도 중립입니다.
예외는 명령 이름 뒤에 하위 명령이 오는 단순한 형태에만 적용합니다. 따옴표·shell
연산자·치환·리다이렉션이 있거나 미지원 옵션이면 기존 보수적 검사를 적용합니다.
`--output-dir`, `--post-renderer`, `--dependency-update`는 읽기 예외가 아니며,
운영 파일 편집과 rollout restart/undo 등 실제 변경은 계속 차단합니다.

현재 훅의 productionPaths는 문자열 경로 목록입니다. 환경별 실제 prod 경로를
setup에서 채웁니다. 임의 glob이 적용된다고 가정하지 않습니다.
