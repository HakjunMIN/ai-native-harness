# 운영 프로모션 인계 예시

실제 배포 패치는 아직 없다. 준비 시 포함할 항목:

- 현재/목표 immutable image digest와 staging 검증 revision.
- prod values 변경안, 호환성, blast radius, rollback digest.
- 검증된 PR/CI 링크, 운영자 승인과 실행 시간.

이 디렉터리는 ArgoCD가 감시하는 배포 경로가 아니어야 한다.
자동 apply/sync 스크립트나 에이전트가 실행할 prod 자격증명은 포함하지 않는다.
