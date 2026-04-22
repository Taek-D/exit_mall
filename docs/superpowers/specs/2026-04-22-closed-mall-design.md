# 엑시트몰 (폐쇄몰) 설계 문서

**작성일**: 2026-04-22
**프로젝트**: 엑시트몰 — 예치금 기반 폐쇄몰
**대상 규모**: 수십 명 (초대·승인제)
**스택**: Next.js 14 (App Router) + Supabase + TypeScript + Tailwind + shadcn/ui

---

## 1. 개요

### 1.1 목적

관리자 승인으로 가입한 회원에게 상품을 판매하는 **예치금 기반 폐쇄몰**. 사용자는 계좌 이체로 예치금을 충전하고, 예치금 범위 내에서 상품을 주문한다. 관리자는 가입 승인, 입금 확인, 주문 관리, 잔액 안내를 수행한다.

### 1.2 핵심 비즈니스 플로우

1. **예치금 이체**: 사용자가 이체 요청 → 관리자가 은행 앱에서 입금 확인 후 승인 → 예치금 반영
2. **주문**: 사용자가 상품 주문 → 주문 즉시 예치금 자동 차감 → 관리자 대시보드에 실시간 노출
3. **배송**: 관리자가 송장번호·택배사 입력하며 상태 전이 (접수 → 준비중 → 배송중 → 완료)
4. **잔액 부족 안내**: 잔액이 임계치 이하일 때 사용자에게 사이트 내 배너 표시, 관리자 대시보드에 안내 대상 목록 표시 → 관리자가 수동으로 개별 연락

### 1.3 스택 선정 근거

- **Supabase**: 인증(관리자 승인 플로우), Postgres(트랜잭션/RLS), Realtime(주문 실시간 알림), Storage(상품 이미지)가 한 번에 해결됨. 수십 명 규모는 무료 tier 범위 내.
- **Next.js 14 App Router**: 라우트 그룹으로 주문자/관리자 UI 분리, Server Actions로 RPC 호출 단순화.

---

## 2. 아키텍처

### 2.1 전체 구조

단일 Next.js 앱에 라우트 그룹으로 주문자/관리자 UI 분리. 배포·운영 단순성 우선.

```
app/
├── (auth)/          # 로그인, 가입 신청
├── (user)/          # 주문자 페이지
│   ├── shop/        # 상품 목록·주문
│   ├── deposit/     # 예치금 이체 요청·잔액 조회
│   └── orders/      # 내 주문 내역
└── (admin)/         # 관리자 페이지 (role='admin' 가드)
    ├── dashboard/
    ├── approvals/   # 가입 승인 대기
    ├── deposits/    # 입금 확인 처리
    ├── orders/      # 주문 대시보드 (실시간)
    ├── products/    # 상품 CRUD
    └── users/       # 사용자·잔액 관리
```

### 2.2 권한·보안 설계 원칙

- **이중 방어**: 프론트 미들웨어 가드 + DB 레벨 RLS 정책
- **원자성 보장**: 잔액/재고/주문 동시 변경은 모두 Postgres RPC 함수(트랜잭션)로 처리
- **감사 추적**: 모든 잔액 변동은 `balance_transactions` 원장에 누적
- **권한 모델**:
  - `role`: `user` (기본) | `admin`
  - `status`: `pending` | `active` | `suspended`

### 2.3 실시간 업데이트

관리자 주문 대시보드는 Supabase Realtime으로 `orders` 테이블 INSERT 이벤트를 구독. 새 주문 발생 시 목록 자동 갱신 + 토스트 알림 + 선택적 브라우저 알림/효과음.

---

## 3. 데이터 모델

모든 금액은 `bigint` 원 단위 정수로 저장 (부동소수점 오차 방지).

### 3.1 profiles

`auth.users`를 확장한 사용자 프로필.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | `auth.users.id` 참조 |
| email | text | |
| name | text | |
| phone | text | |
| role | text | `user` \| `admin` |
| status | text | `pending` \| `active` \| `suspended` |
| deposit_balance | bigint DEFAULT 0 | 원 단위 |
| low_balance_threshold | bigint DEFAULT 10000 | 잔액 부족 임계치 |
| created_at | timestamptz | |
| approved_at | timestamptz | 관리자가 승인한 시각 |

### 3.2 products

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| name | text | |
| description | text | |
| price | bigint | 원 단위 |
| image_url | text | Supabase Storage URL |
| stock | int | `-1`은 무제한 |
| is_active | bool | 판매 중지 플래그 |
| created_at | timestamptz | |

### 3.3 deposit_requests

사용자의 예치금 이체 요청 + 관리자 승인 내역.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK → profiles | |
| amount | bigint | |
| depositor_name | text | 입금자명 (은행 대조용) |
| status | text | `pending` \| `confirmed` \| `rejected` |
| admin_memo | text | 반려 사유 등 |
| confirmed_by | uuid FK → profiles | 처리한 관리자 |
| confirmed_at | timestamptz | |
| created_at | timestamptz | |

### 3.4 orders

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK → profiles | |
| total_amount | bigint | 주문 당시 합계 스냅샷 |
| status | text | `placed` \| `preparing` \| `shipped` \| `delivered` \| `cancelled` |
| shipping_name | text | 받는 사람 (매번 입력) |
| shipping_phone | text | |
| shipping_address | text | |
| shipping_memo | text | |
| tracking_number | text | 송장 번호 (발송 처리 시 필수) |
| carrier | text | 택배사 (발송 처리 시 필수) |
| created_at | timestamptz | |
| shipped_at | timestamptz | |

### 3.5 order_items

주문 상세. 상품 수정·삭제에 영향받지 않도록 스냅샷 보존.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| order_id | uuid FK → orders ON DELETE CASCADE | |
| product_id | uuid FK → products ON DELETE SET NULL | 강제 삭제 허용 |
| product_name | text | 주문 당시 스냅샷 |
| unit_price | bigint | 주문 당시 스냅샷 |
| quantity | int | |
| subtotal | bigint | |

### 3.6 app_settings

관리자 전용 전역 설정 (입금 안내용 계좌 정보 등). 단일 레코드(`id=1`)로 운영.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | int PK | 항상 `1` |
| bank_name | text | 입금 계좌 은행명 |
| bank_account_number | text | 계좌번호 |
| bank_account_holder | text | 예금주 |
| notice | text | 입금 안내 메시지 |
| updated_at | timestamptz | |
| updated_by | uuid FK → profiles | |

관리자는 `/admin/settings` 화면에서 이 값을 편집. 사용자의 이체 안내 화면은 이 테이블에서 읽어 표시.

### 3.7 balance_transactions

예치금 변동 원장 (감사 추적·정산용).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK → profiles | |
| type | text | `deposit` \| `order` \| `refund` \| `adjust` |
| amount | bigint | 양수=증가 / 음수=차감 |
| balance_after | bigint | 변동 후 잔액 |
| ref_type | text | `deposit_request` \| `order` |
| ref_id | uuid | 관련 레코드 ID |
| admin_id | uuid | 수동 조정 시 관리자 |
| memo | text | |
| created_at | timestamptz | |

### 3.8 RLS 정책 개요

- 사용자(`role='user'`): 본인의 `profiles`, `orders`, `order_items`, `deposit_requests`, `balance_transactions`만 SELECT. `products`는 `is_active=true`만 SELECT. `app_settings`는 SELECT 가능(쓰기 불가). INSERT는 본인 리소스에만.
- 관리자(`role='admin'`): 모든 테이블 전체 접근 (SELECT/INSERT/UPDATE/DELETE).
- `status` 체크: `pending`/`suspended` 사용자는 이체 요청·주문 등 INSERT 차단.

### 3.9 핵심 RPC 함수 (Postgres)

모두 트랜잭션 내에서 `SELECT ... FOR UPDATE`로 잔액·재고 락을 걸어 동시성 안전성 보장.

- `place_order(items jsonb, shipping jsonb)`:
  1. 사용자 잔액 락 → 합계 계산
  2. 잔액 부족 시 `INSUFFICIENT_BALANCE` 반환
  3. 각 상품 재고 확인·차감 (무제한 상품 제외). 부족 시 `OUT_OF_STOCK(product_id)`
  4. `orders` + `order_items` 생성 (스냅샷 포함)
  5. `profiles.deposit_balance` 차감
  6. `balance_transactions` 기록 (`type='order'`)
- `confirm_deposit(request_id)`:
  1. 요청 상태가 `pending`인지 확인 (이미 처리된 건 무시)
  2. `deposit_requests.status='confirmed'`
  3. 사용자 잔액 증가
  4. `balance_transactions` 기록 (`type='deposit'`)
- `reject_deposit(request_id, memo)`: 상태만 `rejected`로 변경.
- `cancel_order(order_id)`: `placed` 상태만 허용. 잔액 복원·재고 복원·원장 기록 (`type='refund'`).
- `adjust_balance(user_id, amount, memo)`: 관리자 수동 조정. 원장 기록 (`type='adjust'`, `admin_id` 포함).
- `transition_order_status(order_id, next_status, tracking_number?, carrier?)`: 상태 전이. `shipped`로 전이 시 `tracking_number`/`carrier` 필수.

---

## 4. 주문자(User) 플로우

### 4.1 가입 → 승인 대기 → 로그인

- 가입 신청 시 `profiles` 레코드가 `status='pending'`으로 생성됨.
- `pending` 사용자 로그인 시 "관리자 승인 대기" 안내, 세션 거부.
- `suspended` 사용자 로그인 시 "계정이 정지되었습니다" 안내.
- `active`만 정상 진입.

### 4.2 예치금 이체 요청

1. `/deposit`에서 현재 잔액 확인. 잔액이 `low_balance_threshold` 이하면 상단 경고 배너.
2. 이체 요청: 금액(1,000원 이상) + 입금자명 입력.
3. 안내 화면: `app_settings`의 은행·계좌번호·예금주·안내문 표시, 입금자명·금액 재확인.
4. "이체 완료" 클릭 시 `deposit_requests` 레코드(status=`pending`) 생성.
5. 내 이체 요청 목록에서 상태 확인 (`pending`/`confirmed`/`rejected`). `confirmed` 시 잔액 자동 반영.

### 4.3 상품 주문

1. `/shop`: `is_active=true` + 재고>0 또는 무제한 상품만 표시. 상단에 현재 잔액 고정.
2. 장바구니: 클라이언트 상태, localStorage 동기화. 기기 간 동기화 없음.
3. 주문서 작성: 받는 사람/연락처/주소/메모 매번 입력 (프리필 없음).
4. 주문 제출 → Server Action → `place_order()` RPC 호출.
5. 완료 화면에 주문 번호 노출. 주문 후 잔액이 threshold 이하면 "잔액 부족" 배너.
6. 실패 케이스: `INSUFFICIENT_BALANCE` → "잔액 부족" + [충전] 버튼. `OUT_OF_STOCK` → 해당 상품 제거 제안.

### 4.4 주문 내역 조회

- `/orders`: 내 주문 목록 (최신순). 주문별 상품·수량·금액·상태·운송장번호 노출.
- `placed` 상태에서만 [주문 취소] 버튼 노출. 클릭 시 `cancel_order()` RPC.

---

## 5. 관리자(Admin) 플로우

### 5.1 대시보드 `/admin`

위젯: 신규 주문 수, 승인 대기 수, 입금 확인 대기 수, 잔액 부족 고객 수. 최근 주문 목록은 Supabase Realtime으로 자동 갱신. 새 주문 발생 시 토스트 + 브라우저 알림(옵션) + 효과음(옵션).

### 5.2 가입 승인 `/admin/approvals`

`status='pending'` 사용자 목록. [승인] → `active` + `approved_at`. [반려] → `suspended`.

### 5.3 입금 확인 `/admin/deposits`

`status='pending'` 요청 목록. 관리자가 은행 앱에서 입금자명·금액을 수동 대조. [확인] → `confirm_deposit(request_id)`. [반려] → `reject_deposit(request_id, memo)`.

### 5.4 주문 관리 `/admin/orders`

- 탭: 전체/접수/준비중/배송중/완료/취소.
- 상세: 주문자, 배송 정보, 주문 항목, 합계. 상태 전이 버튼.
  - `placed` → `preparing`
  - `preparing` → `shipped` (송장번호·택배사 **필수** 입력)
  - `shipped` → `delivered`
  - 어느 단계든 → `cancelled` (확인 모달 + 잔액 환불)
- 인쇄용 주문서 프린트 버튼.

### 5.5 상품 관리 `/admin/products`

- 전체 상품 목록 (is_active 무관).
- 새 상품: 이름·설명·가격·재고·이미지(Supabase Storage 업로드)·is_active.
- 수정 / 판매중지 / 삭제 (강제 삭제 허용, `order_items.product_id`는 `ON DELETE SET NULL`로 과거 주문은 스냅샷으로 보존).

### 5.6 사용자·잔액 관리 `/admin/users`

- 전체 사용자: 이름·이메일·잔액·상태·총 주문액. [잔액 낮음 필터].
- 사용자 상세:
  - 프로필·상태·잔액.
  - [수동 잔액 조정] — `adjust_balance()` RPC. 원장에 `type='adjust'` + `admin_id` 기록.
  - threshold 변경.
  - 상태 변경 (active/suspended). 본인 상태 변경 차단.
  - 주문 이력 / 이체 이력 / 원장 이력 탭.

### 5.7 앱 설정 `/admin/settings`

`app_settings` 단일 레코드 편집. 입금 안내에 사용되는 은행명·계좌번호·예금주·안내문을 관리자가 수정. 변경 시 `updated_by`/`updated_at` 자동 기록.

### 5.8 잔액 부족 고객 안내 `/admin/low-balance`

- `deposit_balance <= low_balance_threshold` 고객 목록.
- 각 카드에 이름·연락처·현재 잔액·[연락 완료 체크].
- 실제 안내는 관리자가 직접 전화/카톡/문자로 수행. 체크 시 최종 안내일 기록(UX 편의).

---

## 6. 에러 처리 · 엣지 케이스 · 보안

### 6.1 동시성·무결성

- 모든 잔액·재고·주문 변경은 RPC 함수 내 `SELECT ... FOR UPDATE`로 락.
- 프론트 주문 버튼은 submit 중 disable. 서버 측 멱등성 토큰은 향후 고려.

### 6.2 주요 엣지 케이스

| 상황 | 처리 |
|------|------|
| 주문 중 잔액 부족 | `INSUFFICIENT_BALANCE` → 충전 유도 |
| 주문 중 재고 부족 | `OUT_OF_STOCK(product_id)` → 항목 제거 제안 |
| 동시 주문으로 재고 경합 | `FOR UPDATE`로 직렬화 — 늦은 주문은 재고 부족 반환 |
| 이체 요청 중복 승인 | RPC가 현재 상태 체크 후 이미 처리됐으면 무시 |
| 주문 취소 시 재고 복원 | `cancel_order` RPC가 재고 원복 + 잔액 환불 + 원장 기록 |
| 관리자가 본인 계정 상태 변경 | 미들웨어에서 차단 |
| `pending`/`suspended` 사용자 이체·주문 시도 | RLS + 프론트 가드 |
| 상품 강제 삭제 후 과거 주문 조회 | 스냅샷 표시, `product_id`는 NULL |
| 장바구니 상품이 판매 중지됨 | 주문 제출 시 검증 → 해당 항목 제거 안내 |
| 이미지 업로드 실패 | Supabase Storage 재시도 + 이미지 없이 저장 허용 |

### 6.3 입력 검증

- **Zod 스키마**를 클라이언트·서버(Server Actions)에서 공유.
- 제약:
  - 이체 금액 ≥ 1,000원
  - 주문 수량 ≥ 1, 재고 이내
  - 전화번호 한국 휴대폰 포맷
  - 주소 ≤ 200자
  - 입금자명 1~30자

### 6.4 사용자 피드백

- shadcn/ui `<Toast>`로 성공/실패 안내.
- 폼 에러는 필드 하단 인라인.
- 로딩 중 스켈레톤·스피너.

### 6.5 보안 요약

- 미들웨어: `/admin/*` 접근 시 `role='admin'` 체크.
- RLS: DB 레벨에서 권한 강제.
- 감사 추적: 잔액 관련 관리자 액션은 `balance_transactions`에 `admin_id`와 함께 기록 (돈과 무관한 액션은 별도 감사 테이블 없이 단순화).
- 환경 변수: Supabase Service Role Key는 서버 전용 코드에서만 사용.

---

## 7. 테스트 전략

### 7.1 단위 테스트 (Vitest)

- Zod 스키마 검증.
- 금액 포맷/파싱 유틸 (원 단위, 콤마 표기).
- 상태 전이 규칙 (`placed`→`preparing`→`shipped`→`delivered`).

### 7.2 통합 테스트 (Vitest + Supabase 로컬)

- `place_order` RPC: 정상 / 잔액 부족 / 재고 부족 / 동시성.
- `confirm_deposit` RPC: 정상 / 중복 승인 방어 / 반려.
- `cancel_order` RPC: 잔액·재고 복원 정확성.
- RLS 정책: 타 사용자 데이터 접근 차단 확인.

### 7.3 E2E 테스트 (Playwright, 핵심 시나리오만)

1. 가입 → 관리자 승인 → 로그인 → 이체 요청 → 관리자 승인 → 잔액 반영.
2. 상품 등록 → 주문 → 잔액 차감 → 관리자 주문 확인 → 송장 입력 → 배송 완료.
3. 주문 취소 → 잔액 복원.

### 7.4 수동 체크리스트 (배포 전)

- 관리자/사용자 권한 누출 테스트.
- 금액 계산·표기 (원 단위, 콤마).
- 모바일 반응형.

---

## 8. 배포 · 운영

- **환경**: dev(로컬 Supabase CLI) / prod(Supabase 클라우드 + Vercel).
- **마이그레이션**: Supabase CLI (`supabase migration new`). 스키마 변경은 모두 마이그레이션 파일로 관리.
- **백업**: Supabase 자동 백업(PITR) 활성화 (돈 관련 데이터이므로 필수).
- **모니터링**: 초기엔 Supabase 대시보드 + Vercel Analytics만. Sentry 같은 에러 모니터링은 후속 작업으로.

### 8.1 초기 관리자 부트스트랩

첫 관리자는 앱 UI로 만들 수 없으므로(가입 승인을 해줄 관리자가 아직 없음) 수동으로 생성:

1. 배포 후 Supabase Auth 대시보드에서 관리자 이메일로 사용자를 직접 생성 (또는 일반 가입 절차 완료).
2. Supabase SQL Editor에서 해당 계정의 `profiles` 레코드를 업데이트:
   ```sql
   UPDATE profiles
   SET role = 'admin', status = 'active', approved_at = now()
   WHERE email = 'admin@example.com';
   ```
3. 이후 관리자는 로그인하여 다른 사용자 승인을 처리하고 `app_settings` 초기값을 입력.

이 과정은 프로젝트 `README.md`에 셋업 가이드로 문서화한다.

---

## 9. 인덱스 · 성능

수십 명 규모에서는 과한 최적화 불필요. 다음 인덱스만 기본 추가:

- `orders(user_id, created_at DESC)`
- `orders(status, created_at DESC)`
- `balance_transactions(user_id, created_at DESC)`
- `deposit_requests(status, created_at DESC)`
- `profiles(status)` — 승인 대기 조회용
- 상품 이미지는 Next.js `<Image>` + Supabase Storage CDN 사용.

---

## 10. 범위 밖 (Non-goals / 향후 과제)

- 자동 입금 확인 (오픈뱅킹/PG 연동) — 수동 확인으로 충분.
- 외부 채팅 연동 (카카오 알림톡, 텔레그램 등) — 관리자 대시보드가 주문톡방 역할.
- 카카오/문자 자동 알림 — 관리자가 수동 안내.
- 장바구니 서버 저장·기기 간 동기화.
- 배송지 프로필 기본값 프리필.
- 관리자 액션 전용 감사 로그 테이블 — 돈 관련 액션은 원장으로 충분.
- 에러 모니터링 도구(Sentry 등) 연동.
