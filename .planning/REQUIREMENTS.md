# Requirements: v1.1 CJ대한통운 배송조회 연결

## Active Requirements

- [ ] **TRACK-01**: 사용자는 본인 주문에서 CJ대한통운 배송 상태를 조회할 수 있다.
- [ ] **TRACK-02**: 관리자는 주문 상세에서 CJ대한통운 배송 상태를 조회할 수 있다.
- [ ] **TRACK-03**: 시스템은 CJ 공식 endpoint만 사용하고 개인정보 가능 필드를 노출하지 않는다.
- [ ] **TRACK-04**: 비CJ 택배사는 기존 외부 배송조회 링크 동작을 유지한다.

## Future Requirements

- 우체국 adapter를 같은 인터페이스로 추가한다.
- 필요 시 조회 결과를 DB에 짧게 캐싱한다.
- 운영 정책이 정해지면 배송완료 상태와 내부 주문 상태 전이를 연동한다.

## Out of Scope

- 비공식 통합 배송조회 서비스 사용.
- 택배 예약, 반품 접수, 자동 배송완료 전환.
- DB schema 변경 또는 배송 이벤트 영구 저장.

## Traceability

| Requirement | Phase |
| --- | --- |
| TRACK-01 | Phase 2 |
| TRACK-02 | Phase 2 |
| TRACK-03 | Phase 1 |
| TRACK-04 | Phase 2 |
