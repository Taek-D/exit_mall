---
slug: codex-review-fixes
created: 2026-05-09
status: in-progress
---

# Codex Review 보정 (P1×2, P2×1)

PR #5의 Codex 자동 리뷰 결과 3건을 처리한다.

## 이슈

### P1-A — `stock_orders_self_insert` 정책으로 client가 임의 row INSERT 가능
- 위치: `supabase/migrations/20260508000001_stock_orders.sql:29-30`
- 위험: 사용자가 `total_amount=0`, 임의 `items` 로 pending 행을 직접 INSERT → 관리자가 승인 시 무료 재고 적립 + 예치금 차감 0원.
- 처방: `stock_orders_self_insert` 정책 제거. `request_stock_order` RPC 는 SECURITY DEFINER 라 RLS 우회 가능하므로 정상 흐름 영향 없음.

### P1-B — `order_uploads.shipping_fee_total` 이 client 통제 가능
- 위치: `supabase/migrations/20260508000012_approve_shipping_by_product_id.sql:64-65`
- 위험: client 가 `shipping_fee_total=0` 으로 직접 INSERT → 승인 시 배송비 0원으로 발송.
- 처방:
  1. CHECK 제약: `shipping_fee_total = jsonb_array_length(items) * 3300` (NOT VALID 로 추가해 기존 데이터에는 영향 없음).
  2. `approve_shipping_upload` RPC 가 승인 직전 같은 식을 재검증. 위반 시 `FEE_TAMPERED:expected:actual` 에러.

### P2 — `per_user_limit` 검사가 legacy `orders/order_items` 누적을 누락
- 위치: `supabase/migrations/20260508000011_two_flow_safety.sql:55-59`
- 위험: 옛 흐름에서 일반 주문으로 산 수량이 새 흐름의 한도 합산에 포함 안 됨 → 한도 우회.
- 처방: `request_stock_order` 의 `v_already_bought` 계산식에 legacy `orders + order_items` 의 product_id 별 누적 합산 추가.

## 변경

- `supabase/migrations/20260509000001_codex_p1_p2_hardening.sql` — 마이그레이션 1개로 통합:
  - `drop policy stock_orders_self_insert`
  - `alter table order_uploads add constraint order_uploads_fee_consistent ... not valid`
  - `create or replace function approve_shipping_upload(...)` 에 FEE_TAMPERED 가드 추가
  - `create or replace function request_stock_order(...)` 의 `v_already_bought` 에 legacy 합산 추가
- `lib/errors/shipping-upload.ts` — `FEE_TAMPERED` 한국어 메시지 추가

## 검증

- `supabase db reset` → 모든 마이그레이션 PASS
- `pnpm typecheck` PASS
- `pnpm test` 96/96 PASS
- `pnpm lint` clean

## 운영 영향

- 마이그레이션 12개 → 13개. `supabase db push` 한 번에 모두 반영.
- 운영 흐름 변경 없음 (server action / 관리자 화면 동작 동일).
- 사용자 측 이상 INSERT 시도가 명시적 에러로 차단됨.
