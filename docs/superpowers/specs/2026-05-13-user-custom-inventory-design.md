# 사용자 수기 보유재고(User Custom Inventory) — 디자인 스펙

- 작성일: 2026-05-13
- 브랜치: `feature/20260513`
- 산출물 종류: 디자인 스펙 (구현 전 합의)
- 트리거: 운영팀 요청 메모 (`20260513.txt`)

## 1. 배경 & 목적

현재 사용자 보유재고(`user_inventory`)는 `products` 테이블의 행을 강제 참조한다(FK `on delete restrict`). 운영 중 다음 세 가지 불편이 발견됐다.

1. **"(이름 없음)" 표시 문제**: 상품을 비활성화(`is_active=false`) 또는 삭제하면 사용자 보유재고 화면에서 상품명이 `(이름 없음)`으로 표시된다.
2. **상품 카탈로그와 분리된 수기 등록 불가**: 관리자가 카탈로그에 없는 임의 상품명으로 사용자 보유재고를 만들 수 없다.
3. **삭제 불가**: 관리자가 보유재고 행 자체를 제거할 수 없다(수량 조정만 가능).

본 스펙은 위 세 문제를 한 번에 해결하면서 기존 product 기반 보유재고 흐름의 안정성을 유지한다.

### 핵심 결정 요약

| 항목 | 결정 |
|---|---|
| 데이터 모델 | 별도 테이블 `user_custom_inventory` 추가 (옵션 A) |
| 변동 내역 | 별도 테이블 `custom_inventory_movements` (products 흐름과 분리) |
| 출하 매칭 | 2단계 lookup: `products.name` 우선 → `user_custom_inventory.name` fallback |
| 충돌 정책 | 같은 이름이 양쪽에 있으면 항상 products 우선 |
| 삭제 동작 | Hard delete + movement 한 줄 (`source_type='admin_delete', delta=-quantity`) |
| 권한 | 사용자: 조회만. 관리자: 등록·조정·삭제 (전부 RPC 경유) |
| "(이름 없음)" 픽스 | `products` SELECT RLS를 확장해 본인 보유재고 행에 연결된 비활성 상품 이름도 조회 가능 |
| 변동내역 라우트 | `/inventory/product/[id]` 와 `/inventory/custom/[id]` 로 분리 |

## 2. 데이터 모델

### 2.1 신규 테이블: `user_custom_inventory`

```sql
create table public.user_custom_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  quantity int not null default 0 check (quantity >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index user_custom_inventory_user_idx
  on public.user_custom_inventory (user_id) where quantity > 0;

alter table public.user_custom_inventory enable row level security;

create policy user_custom_inventory_self_select on public.user_custom_inventory
  for select using (user_id = (select auth.uid()) or public.is_admin());

create policy user_custom_inventory_admin_all on public.user_custom_inventory
  for all using (public.is_admin()) with check (public.is_admin());
```

### 2.2 신규 테이블: `custom_inventory_movements`

`inventory_movements` 와 대칭. `product_id` 컬럼이 없는 대신 `custom_inventory_id` 를 가진다.

```sql
create table public.custom_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  custom_inventory_id uuid not null references public.user_custom_inventory(id) on delete cascade,
  delta int not null,
  source_type text not null,   -- 'admin_adjust' | 'admin_delete' | 'shipping_upload_approved'
  source_id uuid,
  created_at timestamptz not null default now()
);

create index cim_user_idx on public.custom_inventory_movements
  (user_id, custom_inventory_id, created_at desc);

alter table public.custom_inventory_movements enable row level security;

create policy cim_self_select on public.custom_inventory_movements
  for select using (user_id = (select auth.uid()) or public.is_admin());

create policy cim_admin_all on public.custom_inventory_movements
  for all using (public.is_admin()) with check (public.is_admin());
```

### 2.3 `products` SELECT RLS 확장 — "(이름 없음)" 픽스

원인 확정: `20260422000002_rls_policies.sql` 의 `products_active_read` 정책이 `is_active = true or is_admin()` 이라 일반 사용자는 비활성 상품을 SELECT 할 수 없다. 사용자 보유재고 페이지의 `products(name)` 조인이 null 로 떨어져 코드에서 `(이름 없음)` 으로 fallback 된다.

본인 보유재고와 연결된 비활성 상품도 이름은 보이도록 SELECT 정책을 추가(기존 정책과 OR로 합산).

```sql
create policy products_select_owned_inventory on public.products
  for select using (
    exists (
      select 1 from public.user_inventory ui
      where ui.product_id = products.id
        and ui.user_id = (select auth.uid())
    )
  );
```

> 기존 정책(`is_active = true` 등)은 손대지 않고 OR로 합쳐진다. RLS 정책은 합집합으로 평가되므로, 본인이 보유 중인 상품의 이름은 비활성 여부와 무관하게 노출된다.

## 3. 출하 매칭 & 차감 로직

### 3.1 업로드 시점 — 2단계 매칭 (`lib/actions/shipping-upload.ts`)

```
엑셀 상품명 목록 →
  1) products.name lookup            (현재와 동일)
  2) 매칭 안 된 이름만 user_custom_inventory(user_id=업로더, name) lookup
  3) 둘 다 매칭 안 되면 → "존재하지 않는 상품명" 에러 (메시지 동일)
```

저장되는 `order_uploads.items[i]` 형태:

```jsonc
// products 매칭
{ "product_code": "상품A", "product_id": "<uuid>", "quantity": 3 }
// 수기 매칭
{ "product_code": "수기상품B", "custom_inventory_id": "<uuid>", "quantity": 2 }
```

**충돌 정책**: 같은 이름이 `products` 와 `user_custom_inventory` 양쪽에 있으면 항상 products 우선. 이는 기존 흐름과의 호환성을 지키고, 비활성 products 도 이름이 다시 보이게 되므로(섹션 2.3) 사용자가 자기가 어디로 매칭되는지 인지할 수 있다.

### 3.2 승인 RPC — `approve_shipping_upload` 확장

신규 마이그레이션 `20260513000004_approve_shipping_includes_custom.sql` 로 함수를 교체. 핵심 변경:

```
items 사전 검증:
  product_id가 있는 행 → user_inventory 합산 검증 (현재 로직)
  custom_inventory_id가 있는 행 → user_custom_inventory 합산 검증
  둘 다 없으면 → LEGACY_ITEMS_NOT_SUPPORTED

items 차감:
  product_id 있음 →
    update user_inventory ... where quantity >= v_qty
    + insert into inventory_movements (source_type='shipping_upload_approved')
  custom_inventory_id 있음 →
    update user_custom_inventory ... where quantity >= v_qty
    + insert into custom_inventory_movements (source_type='shipping_upload_approved')
  둘 다 없음 → LEGACY_ITEMS_NOT_SUPPORTED
```

함수 시그니처(`approve_shipping_upload(upload_id uuid) returns void`)는 변경되지 않는다 → 호출 측 코드 변경 없음.

### 3.3 수기 항목 관리 RPC

`20260513000003_user_custom_inventory_rpcs.sql`:

| RPC | 인자 | 동작 |
|---|---|---|
| `add_user_custom_inventory` | `target_user, name, initial_qty, memo` | 행 추가. `UNIQUE(user_id, name)` 위반 시 에러. `initial_qty >= 0`. 0이 아니면 movement (`admin_adjust`, `delta=initial_qty`) 추가 |
| `adjust_user_custom_inventory` | `target_user, custom_id, delta, memo` | 기존 `adjust_user_inventory` 와 동일 패턴. `delta != 0`, 음수 재고 금지 |
| `delete_user_custom_inventory` | `target_user, custom_id` | movement (`admin_delete`, `delta=-quantity`) 한 줄 기록 후 DELETE |

모든 RPC: `security definer set search_path = public`, `is_admin()` 가드, `authenticated` 에 execute 권한.

## 4. 관리자 UI

### 4.1 위치
`app/(admin)/admin/users/[id]/page.tsx` — 기존 `<InventoryAdjuster />` (products 기반) 카드 바로 아래에 **별도 카드** 마운트.

### 4.2 신규: `CustomInventoryManager.tsx` (client)

세 가지 동작을 하나의 카드에 표현.

```
┌─ 수기 보유 재고 ─────────────────────────────────┐
│  [+] 새 수기 항목 추가                            │
│  ┌──────────────────────────────────────────┐  │
│  │ 상품명 [______]  수량 [__]  메모 [____]  │  │
│  │                         [추가하기]        │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  현재 수기 항목                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ 상품A           | 보유 5  | [±] [삭제]    │  │
│  │ 상품B           | 보유 0  | [±] [삭제]    │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

- **추가**: 상품명 + 초기 수량(0 허용) → `addCustomInventoryAction`
- **±** (행별): 인라인 input + delta → `adjustCustomInventoryAction(id, delta, memo)`
- **삭제**: 확인 다이얼로그("X개 보유 중인 항목을 삭제하시겠습니까?") → `deleteCustomInventoryAction(id)`. 잔량 > 0 일 때 강조 색상

### 4.3 신규 서버 액션 — `lib/actions/admin-custom-inventory.ts`

```ts
addCustomInventoryAction({ userId, name, quantity, memo })
adjustCustomInventoryAction({ userId, customInventoryId, delta, memo })
deleteCustomInventoryAction({ userId, customInventoryId })
```

각각 신규 RPC로 위임. Zod 검증, 권한 가드, `revalidatePath('/admin/users/<id>')` + `/inventory` 호출. 기존 `lib/actions/admin-inventory.ts` 의 패턴 그대로 따른다.

### 4.4 Data fetch
`lib/admin/user-detail.ts` 의 `fetchAdminUserDetail` 에 추가:

```ts
supabase.from('user_custom_inventory')
  .select('id, name, quantity, updated_at')
  .eq('user_id', userId)
  .order('updated_at', { ascending: false })
```

타입 `AdminUserCustomInventoryRow = { id, name, quantity, updated_at }` 노출, `AdminUserDetail.customInventory` 필드 추가.

## 5. 사용자 화면

### 5.1 `/inventory` 목록

기존 표에 수기 항목도 **통합 표시**. 행 옆에 작은 `수기` 배지로 구분.

**데이터 fetch**
```ts
// 기존
user_inventory + products(name) where quantity > 0
// 추가
user_custom_inventory where quantity > 0
```

**검토대기 예약** — `order_uploads.items[i]` 를 `product_id` 와 `custom_inventory_id` 각각으로 그룹핑해 합산.

### 5.2 `lib/inventory.ts` 다형성 키

```ts
type InventoryKey =
  | { kind: 'product'; product_id: string }
  | { kind: 'custom'; custom_inventory_id: string };

type InventoryRow = { key: InventoryKey; product_name: string; quantity: number };
type PendingShippingRow = { key: InventoryKey; quantity: number };
```

`computeAvailableInventory` 의 Map 키는 합성 문자열(`p:<uuid>` / `c:<uuid>`)로 변환. 기존 유닛 테스트는 동등 시나리오를 새 키로 재작성.

### 5.3 변동내역 라우트 분리

| 기존 | 신규 |
|---|---|
| `app/(user)/inventory/[productId]/page.tsx` | `app/(user)/inventory/product/[id]/page.tsx` (내용 동일) |
| — | `app/(user)/inventory/custom/[id]/page.tsx` (신규) |

수기 변동내역 페이지의 `SOURCE_LABEL`:

```ts
{
  admin_adjust: '관리자 조정',
  admin_delete: '관리자 삭제',
  shipping_upload_approved: '배송대행 승인',
}
```

목록 페이지의 `Link href` 는 행의 `key.kind` 에 따라 다른 경로를 생성.

## 6. 엣지 케이스

| 케이스 | 동작 |
|---|---|
| 검토대기 업로드가 수기 항목 참조 중에 항목 삭제됨 | 승인 시 `INSUFFICIENT_INVENTORY` (현재 product 케이스와 동일 메시지) |
| 사용자가 products 'A'와 수기 'A' 동시 보유 | 화면에 두 행 표시(수기엔 배지). 출하 매칭은 products 우선. |
| 수기 이름 공백/특수문자 | DB `length(trim(name)) between 1 and 100` 체크. 양끝 공백은 RPC가 `trim()` 후 저장 |
| 수기 항목 삭제 후 같은 이름 재등록 | `unique(user_id, name)` 만족 → 정상. movement는 새 ID로 시작 |
| 사용자 계정 삭제 | `on delete cascade` 로 `user_custom_inventory`, `custom_inventory_movements` 자동 정리 |
| 동시 승인 race | 기존 product 흐름의 `update ... where quantity >= v_qty` 패턴을 수기 흐름에서도 동일 적용 |
| 0 수량으로 추가 | 허용 (placeholder 용도). 사용자 목록에선 `quantity > 0` 필터로 비표시 |
| 관리자 페이지의 활성/비활성 product user_inventory 행 | RLS 가 `is_admin()` 이라 영향 없음 |

## 7. 영향 받는 파일

### 신규
```
supabase/migrations/20260513000001_user_custom_inventory.sql
supabase/migrations/20260513000002_custom_inventory_movements.sql
supabase/migrations/20260513000003_user_custom_inventory_rpcs.sql
supabase/migrations/20260513000004_approve_shipping_includes_custom.sql
supabase/migrations/20260513000005_products_select_owned_inventory.sql
app/(admin)/admin/users/[id]/CustomInventoryManager.tsx
lib/actions/admin-custom-inventory.ts
app/(user)/inventory/custom/[id]/page.tsx
tests/unit/shipping-upload-custom-matching.test.ts
tests/unit/custom-inventory-rpc.test.ts
```

### 수정
```
lib/inventory.ts                       다형성 키 + 계산 함수
lib/actions/shipping-upload.ts         2단계 lookup
lib/admin/user-detail.ts               customInventory 필드 추가
app/(admin)/admin/users/[id]/page.tsx  CustomInventoryManager 마운트
app/(user)/inventory/page.tsx          UNION + 배지 + 새 라우트
tests/unit/inventory-calc.test.ts      키 확장 시나리오
tests/unit/shipping-upload-rpc.test.ts 혼합/수기 케이스 추가
```

### 이동
```
app/(user)/inventory/[productId]/page.tsx
  → app/(user)/inventory/product/[id]/page.tsx
```

## 8. 테스트 전략

**유닛**
- `inventory-calc.test.ts` — 다형성 키 입력 시 그룹핑 정확성
- `shipping-upload-custom-matching.test.ts` (신규) — 2단계 lookup(products 우선), 혼합 매칭, 둘 다 못 찾을 때 에러 메시지

**DB 통합 (RPC)**
- `shipping-upload-rpc.test.ts` 확장 — 수기 단독 / product+수기 혼합 / 수기 잔량 부족
- `custom-inventory-rpc.test.ts` (신규) —
  - `add/adjust/delete` 의 admin/비-admin 권한 가드
  - delete 시 `custom_inventory_movements` 에 `source_type='admin_delete', delta=-quantity` 한 줄 검증
  - `UNIQUE(user_id, name)` 위반 시 에러
  - `delta=0` 거부, `quantity < 0` 거부

## 9. 호환성 / 롤백

- 기존 `user_inventory`, `inventory_movements`, `adjust_user_inventory` 는 손대지 않음
- `approve_shipping_upload` 는 시그니처 동일, 내부 로직만 확장 → 호출 측 변경 없음
- 사용자 화면 라우트 변경(`/inventory/[productId]` → `/inventory/product/[id]`)은 내부 페이지라 외부 영향 없음 (북마크 케이스는 무시 가능)
- 롤백: 신규 마이그레이션 5개를 역순 drop → 깨끗하게 복구

## 10. 비-목표 (YAGNI)

- 사용자가 직접 수기 항목 추가/삭제 — **불가**, 관리자 전용
- 수기 항목 ↔ products 간 자동 마이그레이션 도구 — 별도 운영 작업
- 수기 항목 일괄 등록(엑셀 import) — 1차 범위에선 단건 폼만
- 수기 항목에 대한 SKU/별도 매칭 코드 — 이름 텍스트 매칭만 사용 (현재 product 흐름과 일관)
- 수기 항목의 상품 이미지/카테고리 등 부가 메타 — 이름과 수량만 보관
