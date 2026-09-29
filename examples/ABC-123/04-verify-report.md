# ABC-123 검증 보고서 (가상 예시)

**판정: BLOCKED — 대상 서비스/실행 환경이 연결되지 않은 문서 예시.**

| 검사 | 상태 | 실제 적용 시 조건 |
|---|---|---|
| Gradle 유닛/통합/API | 미실행 | AC-1~4, 실제 configured task |
| Jest/RTL/타입/린트 | 미실행 | 오류/분모 0/threshold |
| plugin-e2e + playwright-bdd | 미실행 | Gherkin 생성 후 실제 Grafana 실행 |
| 실제 통합 경로 | 미실행 | plugin → BFF → query-service |
| UX | 미실행 | axe + keyboard + 라이트/다크 + 휴리스틱 |
| 교차 모델 리뷰 | 미실행 | author와 다른 family, blocking 0 |
| 보안 리뷰 | 미실행 | 인증/tenant/데이터 경계, 발견사항 처리 |

Mock E2E를 실제 통합 검증으로 바꾸어 기록하지 않는다. 스크린샷 차이는 원인을
확인하고 의도된 변경에 대해 사람 승인을 받아 baseline을 변경한다.
**G4:** pending.
