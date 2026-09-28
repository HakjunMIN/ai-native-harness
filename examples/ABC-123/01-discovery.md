# ABC-123 디스커버리 (가상 예시)

**문제:** 운영자가 서비스 관계를 보면서 오류 증가를 식별하기 어렵다.
**사용자:** Grafana 서비스 맵을 보는 관측 플랫폼 운영자.
**경계:** Grafana panel/app → datasource → Spring BFF → SigNoz query-service.
ClickHouse 직접 호출과 SigNoz UI 노출은 제외한다.

## 용어와 AC

에러율은 선택한 5분 구간의 server span 중 오류 span 수 / 전체 server span 수다.
분모 0은 0%가 아니라 데이터 없음이다. 시간 범위는 UTC epoch milliseconds로
계약하고, 서비스 합산 시 분모를 함께 합산한다. 이 정의는 실제 도메인 담당자의
확인이 필요하다.

- AC-1: 에러율이 5% 이상이면 노드를 강조하며 텍스트 상태도 표시한다.
- AC-2: 분모 0인 서비스는 데이터 없음 상태이며 정상으로 표시하지 않는다.
- AC-3: query-service timeout은 사용자에게 재시도 가능한 오류로 보인다.
- AC-4: 다른 tenant의 서비스는 응답과 화면에 포함되지 않는다.

## 화면 검토

맵 강조안과 정렬 표안을 비교한다. 이 예시는 맵 강조안을 계획 대상으로 삼지만
사용자 승인을 받은 것은 아니다. 라이트/다크, 색각 이외의 상태 구분, keyboard
focus, loading/empty/error 상태를 실제 Grafana sandbox에서 검토해야 한다.

**G0/G1:** pending. 실제 Jira 조회와 도메인/프로토타입/시나리오 승인 없음.
