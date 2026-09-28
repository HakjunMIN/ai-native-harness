# ABC-123 구현 기록 (가상 예시)

아직 코드나 테스트를 실행하지 않았다. 아래는 기록 항목이며 성공 결과가 아니다.

| Slice | 상태 | 필요한 증거 |
|---|---|---|
| 1 | pending | RED assertion 로그, GREEN API/통합 로그, 실제 author/reviewer 모델 계열 |
| 2 | pending | RED RTL 로그, GREEN frame/panel 로그, 테마별 검토 |
| 3 | pending | RED timeout/E2E 로그, GREEN 실제 통합 결과 |

로그에는 command, cwd, exit code, 실행 시간, subject SHA와 redacted 출력 파일
SHA256을 포함한다. test-writer는 테스트만, implementer는 소스만 변경한다.
테스트 수정 필요 시 BLOCKED로 돌리고 계약/시나리오 변경 승인부터 받는다.

**G3:** pending. 리뷰·실행·커밋 증거를 실제 수행 전 생성하지 않는다.
