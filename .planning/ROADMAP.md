# Roadmap: v1.1 CJ대한통운 배송조회 연결

## Phase 1: CJ 배송조회 서버 adapter/API

**Goal:** Provide a server-only CJ tracking lookup path with input validation, official endpoint access, privacy filtering, and authorization.

**Requirements:** TRACK-03

**Success criteria:**
1. CJ 송장번호는 공백/하이픈 제거 후 숫자 10자리 또는 12자리만 허용된다.
2. 서버는 CJ 공식 tracking page에서 `_csrf`와 cookie를 얻은 뒤 `tracking-detail` endpoint를 호출한다.
3. 응답은 공통 배송조회 타입으로 정규화되고 개인정보 가능 필드는 제외된다.
4. `/api/orders/[id]/tracking`은 로그인/주문 소유권/관리자 권한을 검증한다.

## Phase 2: 사용자/관리자 UI 연결

**Goal:** Add a manual lookup button and compact result display to buyer and admin order screens while preserving existing external links.

**Requirements:** TRACK-01, TRACK-02, TRACK-04

**Success criteria:**
1. 사용자 `/orders`에서 본인 CJ 주문의 배송 상태를 버튼으로 조회할 수 있다.
2. 관리자 `/admin/orders/[id]`에서 CJ 주문의 배송 상태를 버튼으로 조회할 수 있다.
3. 비CJ 주문은 새 CJ 조회 버튼 없이 기존 외부 링크 흐름을 유지한다.
4. 조회 중, 성공, 실패 상태가 화면 안에서 명확하게 표시된다.

## Phase 3: 테스트와 오류 상태 검증

**Goal:** Verify parser, status mapping, privacy behavior, and type safety.

**Requirements:** TRACK-01, TRACK-02, TRACK-03, TRACK-04

**Success criteria:**
1. Unit tests cover CJ invoice normalization and validation.
2. Unit tests cover CJ parser preference for `parcelDetailResultMap.resultList`.
3. Unit tests cover CJ status-code mapping and fallback behavior.
4. Typecheck passes for API and UI integration.
