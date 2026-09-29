# ABC-123 릴리스 (가상 예시)

**결과: 운영 배포 미실행. PR/CI/ArgoCD에 연결하지 않은 설명용 문서.**

dev → staging → prod 경로를 사용한다. 실제 head SHA의 GitHub Actions 필수
체크, image digest와 GitOps desired revision을 확인해야 한다. 아직 PR URL이나
실행 digest는 없으므로 임의 값을 증거로 입력하지 않는다.

운영자가 브랜치를 push하고 dev/staging PR을 머지한다. 에이전트는 Synced/Healthy와
smoke 결과를 관측한 뒤 G5a를 기록한다. prod 패치와 PR 본문은
`production-proposal/`로 전달한다. 사람이 검토·반영·머지·sync를 담당한다.

Rollback은 이전에 검증된 digest로 GitOps revert PR을 준비하고 운영자가 실행한다.
Jira는 Ready for Release 이하로 유지하며 실제 prod 관측 전 Done 금지.
**G5a/G5b:** pending.
