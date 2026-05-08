# 배송대행 흐름 재구성 — Design

- **작성일**: 2026-05-08
- **브랜치**: `features/20260508`
- **상태**: 디자인 (사용자 승인 후 → writing-plans)

## 배경

엑시트몰은 현재 두 갈래로 주문이 들어온다.

1. 일반 주문(`orders`) — `/shop` → `/cart` → `/checkout`. 배송정보를 입력하고 결제 즉시 주문이 생성되며 예치금/재고가 차감된다.
2. 엑셀 주문서 업로드(`order_uploads`) — 고객이 양식 엑셀을 올리면 관리자가 검토 후 승인/반려한다. 승인 시 정식 주문이 생성된다.

이 두 흐름은 서로 의미가 다르고 메뉴 구조도 일관되지 않아, 다음과 같이 재구성한다.

- **흐름 1 — 엑시트몰 상품 구매(재고 적립)**: 고객이 엑시트몰 상품을 결제하면 "검토대기"로 들어가고, 관리자 승인 시 고객의 보유 재고가 적립된다. 이 단계에서는 배송이 일어나지 않는다.
- **흐름 2 — 배송대행 업로드(재고 발송)**: 고객이 받는사람 명단(CJ 양식 엑셀)을 올리면, 보유 재고에서 차감되고 행 수 × 3,300원 배송비가 차감된 뒤 발송된다. 관리자가 송장 채운 엑셀을 재업로드하면 고객 화면에 행별 송장과 CJ 조회 버튼이 노출된다.

## 결정 사항 (사용자 확정)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 메뉴 구조 해석 | 두 메뉴 swap + 엑시트몰 구매도 "검토대기 → 승인" 흐름으로 통일 |
| 2 | 엑시트몰 구매 시 배송지 | 입력 안 함. 엑시트몰 구매 = "재고 확보" 행위, 실제 발송은 배송대행 엑셀에서 |
| 3 | 새 엑셀 양식 컬럼 | No / 받는사람 / 연락처 / 주소 / 관리코드 / 상품명·옵션 / 수량 / 메모 / 송장번호 |
| 4 | 배송비 위치 | 양식 밖. 업로드 후 화면에서 "행 수 × 3,300원 = 합계" 표시 |
| 5 | 차감 타이밍 | 두 흐름 모두 **승인 시점**. 검토대기 동안은 "예약" 시각화만 |
| 6 | 보유 재고 화면 | 별도 메뉴 신설 (`/inventory`) |
| 7 | 송장 노출 형태 | 행별 송장 + CJ 조회 버튼 + 송장 포함 엑셀 다운로드 |
| 8 | CJ 배송조회 연동 | 현재 lookup 그대로 유지 (자동 폴링/캐싱 미도입) |
| 9 | 재고 표시 | 재고 ≤ 9 일 때 "품절 임박" 배지만. 수량은 어떤 경우에도 숨김 |

---

## 1. 메뉴 재구성

### 고객 메뉴
- 홈 / 상품 / 장바구니 / 주문 내역 / **보유 재고 (NEW)** / **배송대행 업로드** (←주문서 업로드) / 예치금 / 계정

### 관리자 메뉴
- 대시보드 / 가입 승인 / 입금 확인 / **주문관리** (←주문서 업로드 위치, 엑시트몰 상품 구매 검토) / **배송대행 업로드** (←주문관리) / 상품 / 사용자 / 잔액 부족 / 설정

### 라우트 매핑
| 새 라우트 | 메뉴 | 비고 |
|---|---|---|
| `/checkout` | 흐름 1 결제 | 배송정보 제거, 버튼 = "검토 요청" |
| `/orders` | 검토대기·반려된 stock_orders 표시 | 기존 화면 흡수 또는 신규 |
| `/inventory` | 보유 재고 (NEW) | 가용·예약·누적 발송·변동 내역 |
| `/shipping-uploads` | 흐름 2 업로드·이력 | 기존 `/orders/upload` 대체 |
| `/admin/orders` | 흐름 1 검토/승인 (라벨 "주문관리") | 기존 `/admin/order-uploads` 위치를 stock_orders로 채움 |
| `/admin/shipping-uploads` | 흐름 2 검토/송장재업로드 (라벨 "배송대행 업로드") | 기존 `/admin/orders` 위치를 order_uploads로 채움 |

> **참고**: 기존 `orders / order_items / /admin/orders 일반 주문 화면`은 동결되며, "Legacy 주문" 별도 경로로만 열람 가능 (Phase 5 이후 archive).

---

## 2. 데이터 모델

### 신규 테이블

#### `stock_orders` — 흐름 1 (엑시트몰 상품 구매 → 검토대기 → 승인)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK→profiles | |
| `status` | text | CHECK in `('pending','approved','rejected','cancelled')` |
| `total_amount` | bigint | 결제 예정/실제 금액 |
| `items` | jsonb | `[{product_id, product_name, qty, unit_price, subtotal}]` |
| `admin_memo` | text | 반려 사유 |
| `reviewed_at` | timestamptz | |
| `reviewer_id` | uuid FK→profiles | |
| `created_at` | timestamptz | |

#### `user_inventory` — 보유 재고

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `user_id` | uuid FK→profiles | PK |
| `product_id` | uuid FK→products | PK |
| `quantity` | int | CHECK `quantity >= 0` |
| `updated_at` | timestamptz | |

#### `inventory_movements` — 감사 로그

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `product_id` | uuid | |
| `delta` | int | + 적립 / - 발송 |
| `source_type` | text | `'stock_order_approved' \| 'shipping_upload_approved' \| 'admin_adjust'` |
| `source_id` | uuid | |
| `created_at` | timestamptz | |

### 변경 테이블

#### `order_uploads`

```diff
items jsonb -- 구조 변경
- [{ no, brand, code, name, option, quantity, unit_price, amount, memo, shipping_request }]
+ [{ no, recipient, phone, address, product_code, product_name, option,
+    quantity, memo, tracking_number /* nullable, 송장 재업로드 후 채워짐 */ }]

신규 컬럼:
+ shipping_fee_total bigint     -- (행 수 × 3,300원) 캐시
+ admin_storage_path text        -- 송장 채워진 재업로드 파일 경로
+ shipped_at timestamptz
+ completed_at timestamptz

status CHECK 확장:
- ('pending','approved','rejected')
+ ('pending','approved','rejected','shipped','completed','cancelled')
```

> 헤더에 있던 `shipping_name / shipping_phone / shipping_address` 컬럼은 새 흐름에서 의미가 없어진다(받는사람이 행별로 들어가므로). 호환성을 위해 컬럼 자체는 유지하되, 새 업로드는 nullable로 채우지 않는다.

### 기존 테이블 처리

| 테이블 | 처리 |
|---|---|
| `orders` / `order_items` | 동결. 신규 진입 차단. `/admin/orders/legacy` 같은 별도 경로에서만 열람 |
| `products.stock` | 엑시트몰 마스터 재고. 흐름 1 승인 시 차감 (엑시트몰 → 고객 이동) |
| `products.per_user_limit` | 흐름 1에 적용. 흐름 2는 검사 안 함 (보유 재고 한정) |
| `profiles.deposit_balance` | 흐름 1 승인 시 −total_amount, 흐름 2 승인 시 −shipping_fee_total |

### 핵심 RPC

| 함수 | 효과 |
|---|---|
| `request_stock_order(items)` | pending 생성. 1인 한도 검사는 (승인 + 검토대기 합) 기준. 차감 없음 |
| `approve_stock_order(id)` | 예치금 −total_amount, products.stock −qty, user_inventory +qty, movements 기록, status=approved |
| `reject_stock_order(id, memo)` | status=rejected, 차감 없음 |
| `request_shipping_upload(file)` | 엑셀 파싱→pending 생성, 차감 없음. shipping_fee_total = 행수×3,300 |
| `approve_shipping_upload(id)` | 예치금 −shipping_fee_total, user_inventory −qty, movements 기록, status=approved |
| `reject_shipping_upload(id, memo)` | status=rejected, 차감 없음 |
| `attach_tracking(id, file)` | 송장 엑셀 파싱→items[*].tracking_number 채움, admin_storage_path 갱신, status=shipped (멱등 — 여러 번 가능) |
| `complete_shipping_upload(id)` | status=completed |

모든 RPC는 트랜잭션 + 영향 받는 행 `SELECT FOR UPDATE`로 동시성 제어.

---

## 3. 양식·배송비·송장 재업로드

### 새 엑셀 양식 (`/shipping-template.xlsx`)

- 헤더(1~6행): 주문일자 / 상호 / 담당자 연락처 / 요청사항 — 받는사람 정보는 헤더에서 제거.
- 아이템 행(8행~): 아래 컬럼.

| 컬럼 | 필수 | 비고 |
|---|---|---|
| No | — | 자동 채번 표시용 |
| 받는사람 | ● | |
| 연락처 | ● | |
| 주소 | ● | |
| 관리코드 | ● | products 매칭 키 |
| 상품명/옵션 | — | 표시용 |
| 수량 | ● | 양수 정수 |
| 메모 | — | |
| 송장번호 | — | 고객 업로드 시 빈 칸. 관리자가 채워서 재업로드 |

### 고객 업로드 미리보기

- 행별 배송비 ₩3,300 + 합계 = 행수 × 3,300 표시.
- 보유 재고 부족, 관리코드 매칭 실패 등은 미리보기 단계에서 빨간색 경고.
- "검토 요청" 버튼 → `request_shipping_upload` RPC.

### 관리자 송장 재업로드 흐름

1. 관리자가 승인 후, 상세 화면에서 **원본 엑셀 다운로드**(송장 빈 칸).
2. CJ 또는 다른 채널에서 발송 처리 후 송장번호를 엑셀에 채움.
3. 같은 화면에서 **송장 채운 엑셀 재업로드** → `attach_tracking` RPC가 행별 송장을 파싱해 `items[*].tracking_number` 갱신, 파일을 `admin_storage_path`에 저장, status=shipped.
4. 일부 행만 채워져도 허용. 미채워진 행은 화면에 "미발송" 표시.
5. 같은 RPC를 여러 번 호출 가능(보정/추가 발송).

### 고객 화면 (송장 노출)

- `/shipping-uploads/[id]` 상세에서:
  - 행별 표: # / 받는사람 / 송장번호 / **CJ 배송조회** 버튼
  - 상단에 **송장 포함 엑셀 다운로드** 버튼

---

## 4. 보유 재고 화면 + 폴리시

### `/inventory` (NEW)

- 표 컬럼: 상품 / 가용 / 검토대기 예약 / 누적 발송 / 변동 내역 링크
- 가용 = `user_inventory.quantity` − 검토대기 shipping_uploads의 해당 상품 수량 합
- 변동 내역 = `inventory_movements` 시간순 (적립/발송/관리자 조정)

### 상품 카드 표시 (`/shop`)

- `stock` ≥ 10: 어떠한 표시도 없음.
- `stock` ≤ 9: "품절 임박" 배지(상단 우측). 수량은 절대 표시하지 않음.
- `stock` = 0: 카드 자체 비표시 (현재 동작 유지).

### `/checkout` 변경

- "배송 정보" 섹션 제거. 결제 수단(예치금)만.
- 안내 문구: "승인되면 보유 재고에 적립됩니다. 발송은 '배송대행 업로드' 메뉴에서 진행해주세요."
- 결제 버튼: `[금액] 검토 요청` → `request_stock_order`.

### `/deposit` 표시 변경

- 잔액: `가용 ₩X (검토대기 ₩Y 예약중)`
- 가용 = `deposit_balance` − 검토대기 stock_orders.total_amount 합 − 검토대기 shipping_uploads.shipping_fee_total 합

### 관리자 화면 추가

- `/admin/users/[id]`: 보유 재고 수동 조정 UI. `inventory_movements.source_type='admin_adjust'`로 기록. 음수 조정 시 `quantity ≥ 0` 검증.
- 대시보드 Realtime: 신규 `stock_orders.pending`, `order_uploads.pending` 모두 토스트 알림.

### 1인 구매 한도

- 흐름 1(엑시트몰 구매)에 그대로 적용.
- 한도 검사: `이미 승인된 stock_orders 누적 + 검토대기 stock_orders + 신규 요청 합 ≤ per_user_limit`
- 검토대기를 합산하지 않으면 다중 요청으로 한도 우회 가능 → **반드시 합산**.

### 고객 취소

- 흐름 1·2 모두 `status=pending`에서만 가능. 승인 후엔 관리자 처리.
- 취소 시 어떤 차감도 없음(애초에 차감 안 됐음).

### 상태 라벨

| 영문 | 한글 |
|---|---|
| pending | 검토대기 |
| approved | 승인 |
| rejected | 반려 |
| shipped | 발송중 |
| completed | 완료 |
| cancelled | 취소 |

---

## 5. 단계 분할 (Phase)

각 단계 끝에 시스템이 동작 가능한 상태로 유지된다.

### Phase 1 — 데이터 모델 (DB only)

- 마이그레이션: `stock_orders`, `user_inventory`, `inventory_movements` 신설; `order_uploads` 컬럼 추가; status CHECK 확장.
- RPC 8종 작성 + RLS 정책.
- 단위 테스트(`supabase test db` 또는 vitest 모킹).
- UI 변경 없음. 기존 흐름 그대로 동작.

### Phase 2 — 흐름 1 (엑시트몰 상품 구매 → 검토대기 → 승인)

- `/checkout`: 배송정보 제거, "검토 요청" 버튼 → `request_stock_order`.
- 관리자 메뉴 swap: 기존 `/admin/order-uploads` 위치를 stock_orders 검토 화면으로(라벨 "주문관리").
- 관리자 승인/반려 화면 + 1인 한도 합산 검사.
- 고객 `/orders`(또는 신규 화면)에서 검토대기/반려된 stock_orders 표시.

### Phase 3 — 보유 재고 화면 + 표시 변경

- `/inventory` 신설.
- `/deposit` 표시 변경 (가용/예약 분리).
- 상품 카드 재고 ≤ 9 "품절 임박" 배지 + 수량 항상 숨김.
- `/admin/users/[id]` 보유 재고 수동 조정 UI.

### Phase 4 — 흐름 2 (배송대행 업로드 — 양식 변경 + 재고 차감)

- `/shipping-template.xlsx` 신규 양식 (CJ식 1행 1택배).
- `lib/order-upload-parser.ts`를 새 양식용 파서로 교체 + 새 검증 규칙.
- 고객 `/shipping-uploads` 화면 + 미리보기에 행수×3,300 합계.
- 관리자 `/admin/shipping-uploads` — 승인 시 `user_inventory −qty` + 배송비 `−shipping_fee`.
- 고객 메뉴 라벨 "주문서 업로드" → "배송대행 업로드".

### Phase 5 — 송장 재업로드 + 행별 송장 표시 + 배송 상태 전환

- 관리자 송장 재업로드 → `attach_tracking` → 행별 송장 갱신 → status=shipped.
- 고객 `/shipping-uploads` 상세에 행별 송장+CJ조회 / 송장 포함 엑셀 다운로드.
- `complete_shipping_upload` (선택). 기존 일반 주문 화면 "Legacy"로 archive.

---

## 6. 기존 데이터 처리

| 데이터 | 처리 |
|---|---|
| `orders / order_items` | 동결. `/admin/orders/legacy` 같은 경로에서만 열람. Phase 5 이후 archive 표시. |
| 기존 `order_uploads` (구식 items) | `approved/rejected`는 그대로. `pending` 잔여분은 Phase 4 직전 모두 처리 또는 자동 reject. |
| `order-template.xlsx` (구 양식) | 다운로드 링크 비노출. 파일 자체는 보존. |
| 진행중 일반 주문 (`placed/preparing/shipped`) | Phase 5 이전 기존 흐름으로 마무리. 새 흐름은 영향 없음. |

---

## 7. 범위 외 (Out of scope)

- CJ 자동 폴링 / 웹훅
- 비CJ 택배사 앱 내 배송조회
- OCR / 사진 기반 상품 자동 등록
- 가격 비공개 + 문의 유도 UI
- 담당자 자동 매칭

---

## 8. 위험·관찰사항

| 위험 | 대응 |
|---|---|
| 1인 한도 우회 (검토대기 다중 요청) | 한도 검사 시 검토대기 합산 |
| 동시 승인 race (재고/예치금 음수) | RPC 내부 `SELECT FOR UPDATE` |
| 보유 재고 음수 | DB CHECK + RPC 사전 검사 |
| Storage/DB 정합성 (재업로드) | DB write 실패 시 Storage 파일 rollback |
| 엑셀 파일 보안 | OOXML magic 검증, 5MB 제한, .xls 차단 (기존 정책 유지) |
| 새 양식 파서 회귀 | 단위 테스트 신규 양식·악성/깨진 파일·에지 케이스 |
| 메뉴 swap 혼란 | 라벨 변경 시 기존 url에서 새 url로 redirect, 안내 토스트 1회 |

---

## 부록 — 결정 기록

전체 브레인스토밍은 `.superpowers/brainstorm/2125-1778221352/` 에서 시각 자료와 함께 진행됨. 핵심 모호점·선택지·근거는 위 "결정 사항" 표 참조.
