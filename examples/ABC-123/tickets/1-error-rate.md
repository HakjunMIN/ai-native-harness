# T1: 선택한 서비스의 에러율과 임계치 강조를 확인한다

부모: ABC-123 (가상) | 상태: draft | 선행 태스크: 없음

## 결과와 범위

사용자가 서비스와 시간 범위를 선택하면 인증된 tenant의 에러율을 패널에서
확인하고 임계치 초과를 구분한다. Grafana → BFF → SigNoz API 전체 경로를
포함한다. 경고 생성, 데이터 없는 경우, 재시도는 이 구현 태스크의 범위가 아니다.

## 인수 조건

| ID | 부모 AC | 기대 결과 | 검증 |
|---|---|---|---|
| T1-AC1 | AC-1 | 알려진 fixture의 에러율과 임계치 강조가 정확하다 | JUnit 계산/API, Jest/RTL, FE BDD |
| T1-AC2 | AC-4 | 요청자가 바꾼 tenant 헤더로 다른 tenant를 조회할 수 없다 | JUnit API 거부 사례 |

## 계약·UX·완료

[BFF 계약](../openapi.yaml)과 [discovery](../01-discovery.md)를 사용한다.
실제 fork 버전의 SigNoz API 매핑은 구현 계획에서 확인해야 한다.
실제 Grafana 라이트/다크 샌드박스에서 값을 시연하고 AC별 RED/GREEN,
spec/standards 리뷰와 통합 증거를 남긴다. 모의 API는 실환경 통합 증거가 아니다.
자세한 수정 경로와 실행 명령은 착수 handoff에 기록한다.

완료 결과는 T2/T3에서 사용할 인증·응답·패널 계약이다.
현재 Jira 자식 key, 승인, 실행 결과는 없다.
