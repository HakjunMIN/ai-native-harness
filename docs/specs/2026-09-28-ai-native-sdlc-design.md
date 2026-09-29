# ai-native-sdlc 설계 명세

- 갱신일: 2026-09-29
- 범위: 기존 기능과 요청된 점검 항목 4–8의 통합 명세. 9번 모델 평가 도구는 제외.
- 상태: 구현과 함께 갱신한 명세이며 개별 티켓의 승인·실행 증거를 대신하지 않는다.

## 목적과 제품 경계

Jira 또는 해시로 묶인 로컬 사용자 요청에서 시작하는 Discovery → Plan → Implement → Verify → Release를 로컬
에이전트와 사람이 수행한다. 작은 작업에는 경량 경로를, 위험하거나 분해가 필요한
작업에는 엄격 경로를 적용한다. 기술 스킬만 호출하면 전체 SDLC를 시작하지 않는다.

대상은 Grafana datasource/panel/app + React/TypeScript → Spring Boot BFF
(Gradle) → SigNoz query-service 모노레포다. ClickHouse는 query-service 뒤에만
있으며 BFF 직접 접근·브라우저 SQL·SigNoz UI 노출은 허용하지 않는다. 버전/API는
실제 pinned fork에서 확인한다. ClickStack/HyperDX는 명시적 비교나 기존 배포가
범위일 때만 로드하며 평가를 제품 교체 승인으로 해석하지 않는다.

스킬 본문은 영어, 산출물과 Jira 코멘트는 한국어다. Copilot/Claude/Codex 매니페스트는
스킬 배포를 지원하지만 훅·에이전트·모델 실행이 동일하다는 뜻은 아니다.
실제 지원과 검증 한계는 [호환성](../compatibility.md)을 따른다.

## 계약의 소유권

| 문서/코드 | 단일 책임 |
|---|---|
| [공통 원칙](../../skills/sdlc/references/principles.md) | 독립 기술 스킬의 범위·증거·제품/권한 경계 |
| [단계 프로토콜](../../skills/sdlc/references/protocol.md) | 단계 진입, 게이트, 리뷰/검증 증거, 무효화 |
| [티켓 계약](../../skills/sdlc-tickets/references/ticket-contract.md) | 정규 정의, 생성 뷰, 발행 ledger와 준비 frontier |
| [workflow.mjs](../../scripts/workflow.mjs) | 정책·티켓 구조 규칙과 결정적 문서 렌더링 |
| [state.mjs](../../scripts/state.mjs) | 증거/상태 검사, 라우팅, 무효화 |
| [tickets.mjs](../../scripts/tickets.mjs) | 정규 manifest/문서 생성과 원자적 상태 등록 |
| [운영 절차](../operations.md) | 명령 사용법·재개·장애·마이그레이션 |

이 명세는 위 계약의 개요다. 같은 필드 스키마나 단계별 지시를 여러 문서에 복제하지
않는다. 과거 구현 계획은 이력이지 추가 규범이 아니다.

## 정책 선택

| 구분 | Light | Strict / 기존 기록 |
|---|---|---|
| 조건 | 새 bounded, 저위험, 독립 결과 하나, 설정 허용 | 위험·architectural·여러 결과; policy 없는 기록 |
| Jira | Jira 시작 시 부모 이슈 사용; 로컬은 Jira 미사용 | Jira 시작 시 승인 후 자식 발행/관계 readback; 로컬은 발행 생략 |
| 테스트/구현 작성 | 한 작성자 가능 | 별도 test-writer / implementer |
| 계획 리뷰 | 인간 G2, 별도 모델 리뷰는 선택 | 독립 계획 리뷰 + 인간 G2 |
| 슬라이스 리뷰 | 독립 combined(spec/standards) | spec/standards 축별 독립 리뷰 |
| 최종 리뷰 | combined + security, 동일 revision/범위는 재사용 가능 | 독립 final + security 검토 |
| 인간 게이트·배포 권한 | G1/G2/G5b·인간 운영 통제 유지 | 동일 |

크기가 작아도 auth/tenant, 공개 계약 호환성, 파괴적 데이터/스키마 변경,
보안·배포 영향이 있으면 strict다. 중대한 위험이 불명확하면 먼저 확인하거나 strict를
선택한다. 작은 코드 diff라는 이유로 안전하다고 판단하지 않는다.

설정은 신규 계획 생성의 입력이다. `workflow.boundedProfile`이 없으면 strict,
신규 light/strict 모두 `review.requireDifferentFamily`와 `allowHumanReview`를
실제 검증에 반영한다. 교차 계열 리뷰는 권고이며 requireDifferentFamily 기본값은
false다. 동일 모델의 독립 세션을 허용하되 리뷰 자체는 생략하지 않는다.
명시적 true는 교차 계열을 강제하며 인간 대체를 금지한다. 인간 리뷰는 false이면서
allowHumanReview가 true일 때만 허용한다. Policy 없는 legacy 기록은 기존 교차 계열
요건을 유지한다. G2는 manifest 안의
policy와 state의 동일 snapshot을 승인하므로 config 변경만으로 기준을 낮출 수 없다.
Policy 변경은 G2 무효화·재생성·재승인이 필요하다. 기존 기록은 자동 전환하지 않는다.

독립 모델 리뷰는 실제 모델/계열과 서로 다른 세션을 기록한다. 인간 리뷰 허용 시 실제
검토 참조·시각을 기록하며 모델 신원을 꾸미지 않는다. 인간 G2 승인만으로 독립 코드
리뷰를 대신할 수 없다. 특정 호스트 보안 에이전트보다 실제 보안 검토 내용이 중요하다.
필요한 전문성 자체가 없으면 해당 검토는 차단한다.

## 단계와 산출물

`sdlc`는 현재 단계 하나만 라우팅한다. Jira 없이 시작하면 `intake.mjs start`가
사용자 요청서 사본과 `intake.kind: "local"`인 상태를 만들고 게이트는 pending으로
남긴다. G0는 요청서 해시 및 발견한 AC·모듈 맵을 확인한다. 안전한 소문자 로컬 ID를
사용하며 Jira 키나 원격 발행으로 오인하지 않는다. `sdlc-setup`은 실제 모듈/명령/
호스트 기능을 조사하고 기존 설정을 보존한다. Jira 매핑은 Jira 실행에서만 필요하다.

1. **Discover:** 관측된 인테이크, AC·영향 모듈·변경 종류·위험을 정리한다.
   중요한 불확실성만 질문한다. UI 비교는 동의 후 제공하고 실제 제품 UI는 Grafana
   샌드박스로 검증한다. 일반 다이어그램/비교에는 Grafana를 요구하지 않는다. 인간 G1.
2. **Plan:** 범위에 필요한 설계·계약·테스트 행렬을 만들고 정규 draft를 작성한다.
   도구가 policy/manifest/필요한 상세 뷰를 생성한다. 인간 G2가 현재 해시를 승인한다.
3. **Publish:** Jira strict/legacy만 진입한다. 실제 Jira 내용·부모·의존 관계를
   확인해야 구현 가능하다. Jira light와 로컬 실행은 G2 이후 바로 Implement로 간다.
4. **Implement:** 승인된 결과별로 적절한 검증과 독립 리뷰를 수행한다. 선행 결과의
   실제 완료 증거로 frontier를 판단한다. 모든 결과 후 통합 확인으로 G3를 기록한다.
5. **Verify:** 적용 가능한 테스트·UX·보안/최종 리뷰를 실제 수행한다. 모든 스택의
   도구를 무조건 실행하지 않는다. 통합 후보 SHA와 증거가 일치해야 G4다.
6. **Release:** 정확한 SHA의 필수 CI, immutable image, dev/staging GitOps 관측으로
   G5a. 운영 변경은 제안만 작성하고 인간이 적용한다. 실제 승인·배포 digest·상태·smoke
   관측 이후 G5b/Jira Done이다. PR 존재는 배포가 아니다.

Spike는 인간 G1의 연구 결과 승인으로 별도 종료한다. 구현/릴리스 완료를 주장하지
않으며 구현 전환은 새 분류와 실행을 요구한다. 상세 필드는 단계 프로토콜을 따른다.

## 변경 종류별 검증

- **Behavior:** 기대 assertion의 실제 RED → GREEN → refactor 후 재검증.
- **Refactor:** 기존 동작의 통과 before-baseline과 변경 후 GREEN.
- **Documentation/config:** 관련 링크·스키마·렌더·정적/실행 검사. 가짜 RED 불필요.
- 비동작 모드는 `verificationReason`으로 근거를 기록한다. 실제 행동 변화는 파일
  확장자와 무관하게 behavior로 검증한다. 필요한 검사를 manual/N/A로 회피하지 않는다.

백엔드는 JUnit 유닛/통합/API 테스트, Gherkin은 FE E2E에만 사용한다. Mock과 실제
Grafana → BFF → query-service 통합 증거를 구별한다. 이미지 baseline 변경은 실제
diff에 대한 인간 승인이 필요하다. 누락된 인프라는 성공도 N/A도 아니다.

## 정규 티켓과 재검증

AC·목표·범위·의존성은 구조화된 정의 하나에서 작성한다. Strict 상세 Markdown은
생성 뷰이며 별도 수동 원본이 아니다. 생성기는 immutable revision 경로와 해시를
만들고 마지막에 state를 원자적으로 갱신한다. G2 승인·Jira 호출은 생성과 분리한다.

코드만 바뀌면 G3부터 무효화한다. 해시로 검증되는 영향 분석과 의존 그래프가 있으면
변경 슬라이스 및 전이 의존자만 초기화하고 무관한 완료 증거는 보존한다. 공통 영향이
불확실하면 전체 초기화한다. 어느 경우든 최종 통합 G3/G4와 이후 게이트는 무효화된다.
변경 없는 테스트의 historical RED는 출처 확인 후에만 재사용하고 GREEN/리뷰는 새로
수행한다. 요구사항은 G1, 정책·계약·계획은 G2부터 재승인한다.

## 신뢰와 실행 한계

- 컨덕터만 shared state를 쓴다. 전문가는 허용 경로의 결과/증거만 반환한다.
  역할은 고정 전체 팀의 의무 호출이 아니며 필요한 역할만 사용한다.
- 로컬 위임만 허용하며 cloud/nested 위임은 없다. 편집 경계는 지침/diff 감사이지 OS
  sandbox가 아니다. 기존 사용자 변경을 되돌리거나 다른 역할의 작업을 덮어쓰지 않는다.
- Jira 실행에서 인테이크 snapshot이 없으면 G0 차단, strict 발행이 불명확하면 구현
  차단이다. 로컬 실행은 사용자 요청서 해시가 없거나 변조되면 G0부터 차단한다.
  일반 댓글 writeback 지연은 outbox에 명시하고 독립 작업만 계속한다. 중복 생성 전에
  marker/키를 재조회한다. 의존하지 않는 작업까지 일괄 중단하지 않는다.
- v1 훅은 모든 shell push/merge와 직접 배포 변경을 보수적으로 차단한다. 단순 관측/
  렌더 명령은 제한된 예외다. 사람이 브랜치 게시·프로모션을 수행한다.
- JSON 해시는 무결성 검사이지 승인자·모델 신원의 인증이 아니다. CI/브랜치 보호,
  환경 승인과 운영 RBAC를 외부에서 유지한다. 훅 우회/비활성화까지 통제하지 못한다.
- 같은 슬라이스 3회 실패 후에는 제한된 진단을 하고 근거가 없으면 인간에게 인계한다.
  검사를 약화하거나 무제한 에이전트 재시도로 완료를 만들지 않는다.

## 검증 범위

로컬 `npm test`는 정책·상태·생성기·훅·서버 계약을, `npm run validate`는 패키지
구조/링크를 검사한다. 압박 시나리오는 회귀 점검 자료이며 새 시나리오를 추가했다고
실제 모델 실행을 주장하지 않는다. 예시는 simulation이고 실행/승인/배포 증거가 아니다.
호스트 실설치·Jira·운영 시스템 검증과 모델별 벤치마크는 이 변경의 완료 조건이 아니다.
