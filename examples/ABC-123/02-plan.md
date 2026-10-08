# ABC-123 플랜 (가상 예시)

## 결정

BFF가 응답의 tenant/time/error 의미를 고정하고, 플러그인은 data frame 변환과
시각화만 담당한다. query-service 버전/라우트는 실제 fork의 계약에서 확인한다.
이 문서의 OpenAPI는 독립된 BFF 예시이며 SigNoz의 공개 API 사양이 아니다.

## 수직 슬라이스

| ID | 행동 | RED | GREEN 및 리뷰 |
|---|---|---|---|
| 1 | tenant 범위의 에러율 조회와 패널 임계치 강조 | JUnit API 인증/계산, RTL와 FE BDD 표시 실패 | BFF adapter부터 datasource/panel까지, spec/standards |
| 2 | 데이터 없음을 에러율 0과 구분하여 표시 | JUnit 분모 0 계약, RTL/FE BDD empty 표시 실패 | query 응답 의미부터 실제 패널까지, light/dark |
| 3 | timeout과 재시도 | API timeout 테스트, FE Gherkin AC-3 실패 | 오류 계약 + 사용자 재시도, 실제 통합 E2E |

2와 3은 각각 1에 의존한다. 파일 충돌 여부를 확인하기 전 병렬 실행하지 않는다.
상세 내용은 [T1](tasks/1-error-rate.md), [T2](tasks/2-empty.md),
[T3](tasks/3-timeout.md)에 있으며 모두 G2 이전 draft다. 실제 소스/테스트
경로와 실행 명령은 setup과 착수 시점의 코드에서 확정한다.
실제 실행에서는 이 문서들을 해시한 `tasks.json` manifest까지 작성·리뷰한 뒤
G2 승인 → Jira 자식 티켓 발행 확인 → sub task별 RED/GREEN 순서로 진행한다.
이 예시는 승인·발행·실행 증거가 아니다.

## 테스트 매트릭스

AC-1: JUnit 계산/HTTP, Jest threshold, Playwright UI.
AC-2: JUnit 분모 0, RTL empty 상태, Playwright 시나리오.
AC-3: WireMock 지연/timeout API, Playwright 사용자 피드백.
AC-4: 인증된 tenant 컨텍스트를 바꾼 API 테스트; 사용자 입력 tenant 헤더 불신.

UI: axe serious/critical 0, 수동 keyboard, 라이트/다크 승인된 스크린샷.
**G2:** pending. 실제 cross-family 리뷰/사람 승인 없음.
