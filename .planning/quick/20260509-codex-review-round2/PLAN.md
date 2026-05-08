---
slug: codex-review-round2
created: 2026-05-09
status: in-progress
---

# Codex Review Round 2 — P1×2 + P2×2

## 이슈

### P1-A — 사용자가 임의 `admin_storage_path` INSERT 로 다른 파일 읽기
- 위치: `supabase/migrations/20260508000004_order_uploads_v2.sql:28`
- 위험: storage 정책이 `order_uploads.admin_storage_path = name and user_id = auth.uid()` 를 통과시키는데, `order_uploads_self_insert` 정책으로 사용자가 admin_storage_path 를 임의로 설정해 row 를 만들면 'order-uploads' 버킷의 다른 파일을 읽을 수 있음.
- 처방:
  1. `order_uploads_self_insert` 정책에 `admin_storage_path is null` 강제. RPC `attach_tracking` 만 SECURITY DEFINER 로 채울 수 있음.
  2. storage 정책에 `name like 'admin/%'` 추가해 어느 경로인지도 제한.

### P1-B — `approve_shipping_upload` 가 product_code↔product_id 일관성 미검증
- 위치: `supabase/migrations/20260509000001_codex_p1_p2_hardening.sql:100`
- 위험: order_uploads 가 client-insertable 인 채로 남아있어, 사용자가 행에 표시되는 `product_code` 와 다른 상품의 `product_id` 를 넣은 row 를 INSERT 하면 admin 이 검토 시 화면에 "SKR-001 ×1" 로 보이지만 실제로는 다른 SKU 의 재고가 차감됨.
- 처방: 승인 RPC 에서 매 행의 `product_id` 가 가리키는 상품의 `name` 이 `product_code` 와 일치하는지 검사. 위반 시 `PRODUCT_MISMATCH` 차단.

### P2-A — `attach_tracking` 이 items 전체를 덮어써 비-tracking 필드 변조 가능
- 위치: `supabase/migrations/20260508000009_attach_tracking_ambiguous_fix.sql:25`
- 위험: 관리자가 송장 채운 엑셀을 재업로드할 때 다른 필드(quantity, recipient, address, product_id) 를 실수로 또는 의도적으로 수정하면 승인 후 차감된 재고/금액과 감사 기록이 어긋남.
- 처방: RPC 가 PL/pgSQL loop 으로 원본 items 의 모든 필드를 보존하고 `tracking_number` 만 새 값으로 갱신.

### P2-B — `/inventory` 페이지 가용 재고 계산이 product_code → products.name 매칭
- 위치: `app/(user)/inventory/page.tsx:70`
- 위험: products.name 변경 또는 중복 시 reservation 수가 어긋나 사용자에게 잘못된 가용 표시. 승인은 product_id 로 정확히 차감되어 결과 불일치.
- 처방: items[*].product_id 를 직접 사용 (이미 server action 이 INSERT 시점에 1:1 product_id 캡처).

## 변경

- `supabase/migrations/20260509000002_codex_round2_hardening.sql` — P1·P2 통합:
  - `order_uploads_self_insert` 재생성 — `admin_storage_path is null` 추가
  - `"order-uploads admin file owner read"` 재생성 — `name like 'admin/%'` 추가
  - `approve_shipping_upload` — 행별 product_code↔product_id 일관성 가드
  - `attach_tracking` — items loop 으로 tracking 만 갱신
- `app/(user)/inventory/page.tsx` — products.name 매칭 로직 제거, items[*].product_id 직접 사용
- `lib/errors/shipping-upload.ts` — `PRODUCT_MISMATCH` 한국어 매핑

## 검증

- `supabase db reset` PASS
- `pnpm typecheck` / `pnpm test` 96/96 / `pnpm lint` PASS
