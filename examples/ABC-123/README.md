# 예시: 서비스 맵 에러율 강조

이 디렉터리는 **가상의 티켓 산출물 예시**입니다. 실제 Jira 티켓, 승인, 모델
리뷰, CI 로그 또는 배포 결과가 아닙니다. 문서가 있어도 gate 통과 증거가 되지
않도록 state의 모든 게이트는 pending으로 유지합니다.

이 예시는 policy 없는 기존 strict 형식의 이력 샘플입니다. 티켓 Markdown은
설명용이지 새 작성 방식의 두 번째 원본이 아닙니다. 신규 실행에서는
[정규 정의 템플릿](../../templates/ticket-plan.json)과 `tickets.mjs prepare`로
manifest/상세 뷰를 생성합니다. Light는 부모 이슈와 단일 결과만 사용합니다.

실제 모노레포에서 `/sdlc ABC-123`을 실행하면 setup의 실제 경로·명령을 사용해
아래 문서의 내용을 채우고, 실행 증거를 별도 파일로 수집해야 합니다.

| 파일 | 설명 |
|---|---|
| 01-discovery.md | 사용자 문제, AC, UI 선택 기준 |
| 02-plan.md | 수직 슬라이스, 계약, 테스트 매트릭스 |
| tickets/1-error-rate.md, tickets/2-empty.md, tickets/3-timeout.md | 목표·범위·AC·의존성·완료 기준을 가진 개별 티켓 draft |
| 03-impl-log.md | 실제 실행 시 기록할 RED/GREEN 항목 |
| 04-verify-report.md | 테스트/UX/리뷰 판정 기준 |
| 05-release.md | 운영 배포 전 인계 결과 형식 |
| features/error-rate.feature | FE BDD 시나리오 |
| openapi.yaml | BFF 응답 계약 예시 |
| production-proposal/README.md | 사람이 수행하는 prod 프로모션 |

HTML 비교 예시는 [컴패니언 템플릿](../../skills/visual-companion/templates/index.html)에
있습니다. 실제 Grafana 컴포넌트 동작을 검증한 증거는 아닙니다.
