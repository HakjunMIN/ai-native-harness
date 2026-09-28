# 운영 절차

## 상태 검사

대상 모노레포에서 실행합니다. `PLUGIN_ROOT`는 설치 디렉터리의 실제 절대 경로입니다.

```bash
node "$PLUGIN_ROOT/scripts/state.mjs" check docs/sdlc/ABC-123/state.json
node "$PLUGIN_ROOT/scripts/state.mjs" next docs/sdlc/ABC-123/state.json
node "$PLUGIN_ROOT/scripts/state.mjs" invalidate docs/sdlc/ABC-123/state.json G2 "API 계약 변경"
```

승인 명령은 제공하지 않습니다. 인간의 실제 승인 메시지/PR 참조와 시각을 기록하고
승인 대상 파일 hash를 증거에 포함합니다. 해시 검사로 파일 변경을 감지할 수 있지만,
에이전트가 쓰는 JSON만으로 승인자의 신원을 인증할 수는 없습니다.

G3 이후는 코드 commit을 먼저 확정하고 그 SHA로 증거를 수집합니다. source 변경이
생기면 하류 게이트를 무효화하고 다시 확인합니다. 문서-only commit으로 HEAD가
바뀐 경우에도 diff를 확인한 뒤 바인딩을 갱신합니다. CI는 항상 현재 PR SHA에서
실행돼야 합니다. `docs/sdlc/` 밖의 uncommitted 변경은 보수적으로 차단합니다.

## Jira 장애

읽기 실패이며 snapshot도 없으면 G0 이전에서 중단합니다. 이미 승인된 snapshot이
있는 티켓의 writeback 장애는 `jira-outbox.md`에 operation ID, 대상 상태 ID,
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

현재 훅의 productionPaths는 문자열 경로 목록입니다. 환경별 실제 prod 경로를
setup에서 채웁니다. 임의 glob이 적용된다고 가정하지 않습니다.
