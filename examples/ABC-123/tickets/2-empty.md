# T2: 데이터 없음과 실제 에러율 0을 구분한다

부모: ABC-123 (가상) | 상태: draft | 선행 태스크: T1

## 결과와 범위

선택 범위에 요청이 없을 때 사용자에게 데이터 없음을 표시한다.
요청은 있으나 에러가 없는 경우의 0%와 구분한다. BFF 응답 의미부터 Grafana
패널까지 포함한다. timeout 메시지와 재시도는 제외한다.

## 인수 조건

| ID | 부모 AC | 기대 결과 | 검증 |
|---|---|---|---|
| T2-AC1 | AC-2 | 분모 0을 0%로 오인하지 않고 empty 상태로 표시한다 | JUnit API, RTL, FE BDD |
| T2-AC2 | AC-2 | 요청이 있고 오류가 없으면 정상 0%를 표시한다 | JUnit 계산, RTL, FE BDD |

## 계약·UX·완료

[BFF 계약](../openapi.yaml)의 empty 의미와
[FE 시나리오](../features/error-rate.feature)를 함께 검토한다.
T1의 인증된 조회·응답·패널 경로가 완료되어야 시작한다. 알려진 두 fixture로
실제 Grafana 표시를 구분하고 AC별 RED/GREEN 및 두 리뷰 증거를 남긴다.
현재는 설명용 draft이며 실제 승인·Jira 발행·테스트 실행은 없다.
