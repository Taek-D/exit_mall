# 배송대행 흐름 재구성 — 운영 배포 체크리스트

작성일: 2026-05-08
브랜치: `features/20260508` → `master` 머지 시 적용.

이 문서는 PR 머지 **전후**에 운영자가 수동으로 처리해야 하는 작업을 정의한다. 코드 변경만으로 끝나지 않는 항목이다.

---

## 1. 배포 전 (PR 머지 전)

### 1-1. 프로덕션 DB 백업 또는 PITR 확인

Supabase 대시보드에서 프로덕션 프로젝트의 Point-in-Time Recovery 활성화 여부 확인. 비활성이면 머지 직전 수동 백업 (`pg_dump`).

### 1-2. 기존 `order_uploads` 검토대기 행 처리

새 흐름은 기존 양식의 `items` JSONB 구조를 처리할 수 없다(`product_code` 필드 부재). 머지 전에 모두 처리해야 한다.

```sql
-- 1) 검토대기 잔여분 확인
select id, user_id, original_name, total_quantity, total_amount, created_at
from public.order_uploads
where status = 'pending'
order by created_at;

-- 2) 옵션 A: 운영자가 한 건씩 기존 화면(/admin/order-uploads)에서 승인/반려 처리
--          → 머지 전에 0 건이 되도록.

-- 3) 옵션 B: 일괄 자동 반려 (고객에게 사유 노출됨)
update public.order_uploads
set status = 'rejected',
    admin_memo = '구 양식 검토대기분 일괄 반려 — 새 양식(/shipping-uploads)으로 다시 업로드해주세요.',
    reviewed_at = now()
where status = 'pending';
```

처리 결과를 주문자별로 안내(이메일/공지)하면 신뢰도가 올라간다.

### 1-3. 진행 중 일반 주문(`orders`) 잔여 정리

`/admin/orders` 라우트의 콘텐츠가 신규 흐름의 `stock_orders` 검토 화면으로 바뀐다. 진행 중 일반 주문(`orders.status` in `'placed','preparing','shipped'`)은 새 흐름과 별개로 끝까지 처리해야 한다.

배포 후 운영자는 `/admin/orders-legacy` 메뉴(좌측 사이드바 하단, 회색 글씨)에서 처리한다. 직접 URL `/admin/orders/<id>`로 책갈피된 구 주문은 자동으로 `/admin/orders-legacy/<id>`로 redirect 처리되어 호환성은 보장된다.

```sql
-- 잔여분 확인
select status, count(*) from public.orders
where status in ('placed','preparing','shipped')
group by status;
```

가능하면 머지 전에 잔여분을 모두 `delivered` 또는 `cancelled` 로 종결해 운영 인지 부담을 줄인다.

---

## 2. 배포 (PR 머지 + 마이그레이션 푸시)

### 2-1. 마이그레이션 푸시

머지는 코드만 반영되며 DB 마이그레이션은 별도 푸시가 필요하다.

```bash
# 로컬에서 프로덕션 프로젝트와 link 1회
supabase link --project-ref rjulhuseewaaxpbgyaah

# 차이 확인 (10개 신규 마이그레이션이 적용 대기 상태여야 함)
supabase db diff --linked

# 푸시
supabase db push
```

10개 마이그레이션:
- `20260508000001_stock_orders.sql`
- `20260508000002_user_inventory.sql`
- `20260508000003_inventory_movements.sql`
- `20260508000004_order_uploads_v2.sql`
- `20260508000005_shipping_upload_rpcs.sql`
- `20260508000006_admin_adjust_inventory_rpc.sql`
- `20260508000007_balance_transactions_ref_types.sql`
- `20260508000008_admin_storage_insert_policy.sql`
- `20260508000009_attach_tracking_ambiguous_fix.sql`
- `20260508000010_legacy_items_guard.sql`

푸시 실패 시 곧바로 PR을 revert 할 수 있도록 머지 직후 5분간은 사람이 모니터링한다.

### 2-2. 머지 후 PR 배포

Vercel 배포가 자동 트리거된다. 환경 변수(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)는 기존 값을 그대로 사용한다.

배포 직후 헬스 체크:
```bash
curl -I https://<배포-도메인>/login            # 200 또는 307
curl -I https://<배포-도메인>/orders/upload    # 307 (→ /shipping-uploads)
```

---

## 3. 배포 후 (운영자 안내)

### 3-1. 운영자 메뉴 변경 안내

| 옛 메뉴 / URL | 새 의미 |
|---|---|
| `/admin/orders` (구 일반 주문 목록) | **주문관리** = 엑시트몰 상품 구매 검토(`stock_orders`). 일반 주문은 `/admin/orders-legacy`로 이동. |
| `/admin/order-uploads` | `/admin/shipping-uploads`로 자동 redirect. 라벨도 "배송대행 업로드"로 통일. |
| (신규) `/admin/orders-legacy` | 진행 중·완료된 일반 주문 열람·전이 (책갈피 호환 자동 redirect 포함) |
| (신규) `/admin/users/[id]` 보유 재고 섹션 | 사용자별 보유 재고 표시 + 수동 조정 UI |

### 3-2. 고객 안내 (선택)

- `/checkout` 화면이 "주문서 작성" → "검토 요청" 으로 바뀐다(배송정보 입력 제거).
- 새 메뉴 두 가지 추가됨: **보유 재고**, **배송대행 업로드**.
- 기존 책갈피 `/orders/upload` 는 자동 redirect 됨.

공지 한 줄 예시:
> 2026-05-08부터 발송 흐름이 바뀝니다. 상품 구매는 "검토 요청"으로 보유 재고에 적립되고, 실제 발송은 "배송대행 업로드" 메뉴에서 받는사람 명단(엑셀)을 업로드해 진행합니다.

### 3-3. 첫 24시간 모니터링 포인트

- 새 RPC 호출 에러율: `request_stock_order`, `approve_stock_order`, `approve_shipping_upload`, `attach_tracking`
- Realtime publication: 새 검토대기 토스트가 관리자 화면에서 뜨는지
- 기존 진행 중 주문 처리: `/admin/orders-legacy` 에서 정상 표시·전이되는지
- 신규 양식 파서 거부 케이스: "존재하지 않는 관리코드" 에러가 너무 자주 나면 `products.name` 과 운영자가 쓰는 코드가 어긋난 것 — 매핑 안내 필요

### 3-4. 발견 시 즉시 처리

- legacy `order_uploads.pending` 행이 새 화면에서 보이고 승인 시 `LEGACY_ITEMS_NOT_SUPPORTED` 에러가 뜬다 → 1-2 처리 누락. 해당 행을 반려 처리하면 안전.
- `balance_transactions_ref_type_check` 위반 → 마이그레이션 7 미적용. `supabase db push` 결과 재확인.
- storage `new row violates row-level security policy` → 마이그레이션 8 미적용. 동일.

---

## 4. 롤백

10개 마이그레이션은 모두 누적·비파괴(테이블/컬럼 추가, 정책 추가, RPC 추가). 그러나 `order_uploads.status` CHECK 확장과 `balance_transactions.ref_type` CHECK 확장은 기존 데이터에 새 값이 들어간 뒤에는 되돌리기 어렵다.

긴급 롤백 시 권장:
1. 코드 변경 revert (Vercel 이전 배포로 promote)
2. DB 변경은 그대로 둔다(누적 호환). 새 테이블·컬럼은 미사용 상태로 남으면 무해하다.
3. PITR 또는 백업으로 완전 복구는 데이터 손실(머지 후 들어온 신규 stock_orders / shipping_uploads)을 의미하므로 마지막 수단.
