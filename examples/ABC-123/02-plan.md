# ABC-123 플랜 (가상 예시)

## 결정

BFF가 응답의 tenant/time/error 의미를 고정하고, 플러그인은 data frame 변환과
시각화만 담당한다. query-service 버전/라우트는 실제 fork의 계약에서 확인한다.
이 문서의 OpenAPI는 독립된 BFF 예시이며 SigNoz의 공개 API 사양이 아니다.

## 수직 슬라이스

| ID | 행동 | RED | GREEN 및 리뷰 |
|---|---|---|---|
| 1 | tenant 범위의 에러율 조회 | JUnit API가 AC-1/4 응답과 인증 경계를 검증 | BFF adapter + WireMock 통합, spec/standards |
| 2 | 임계치 강조와 데이터 없음 | Jest/RTL에서 AC-1/2 표시 실패 확인 | datasource frame + panel UI, light/dark |
| 3 | timeout과 재시도 | API timeout 테스트, FE Gherkin AC-3 실패 | 오류 계약 + 사용자 재시도, 실제 통합 E2E |

1 → 2 → 3 순서이며 실제 소스/테스트 경로와 실행 명령은 setup에서 관측한
모듈 맵에 따라 확정해야 한다. 이 예시는 실행 승인을 받을 플랜이 아니다.

## 테스트 매트릭스

AC-1: JUnit 계산/HTTP, Jest threshold, Playwright UI.
AC-2: JUnit 분모 0, RTL empty 상태, Playwright 시나리오.
AC-3: WireMock 지연/timeout API, Playwright 사용자 피드백.
AC-4: 인증된 tenant 컨텍스트를 바꾼 API 테스트; 사용자 입력 tenant 헤더 불신.

UI: axe serious/critical 0, 수동 keyboard, 라이트/다크 승인된 스크린샷.
**G2:** pending. 실제 cross-family 리뷰/사람 승인 없음.
