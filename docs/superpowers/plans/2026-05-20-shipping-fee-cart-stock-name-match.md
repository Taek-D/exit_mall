# Shipping Fee, Cart Stock, Name Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep product purchase deposit deduction, stop all shipping-upload shipping-fee deposit deduction/reservation, block out-of-stock carts before checkout, and match shipping-upload item names while ignoring whitespace.

**Architecture:** The change is split into pure matching/cart helpers, server actions, database RPC policy, UI copy, and docs. Pure helpers get unit tests first; database behavior is covered with SQL text assertions and existing error-mapping tests because local RPC execution is not part of the current unit suite.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase/Postgres RPC migrations, Vitest, React client components, ExcelJS parser utilities.

---

## File Structure

- Modify `lib/shipping-match.ts`: expose whitespace-insensitive matching key and use it for exitmall product/custom inventory matching.
- Modify `tests/unit/shipping-match.test.ts`: cover whitespace-insensitive matches and normalized duplicate collisions.
- Modify `lib/purchased-shipping.ts`: use the same matching key for purchased-stock FIFO allocation by product and option, and expose ambiguity detection for normalized purchased-stock labels.
- Modify `tests/unit/purchased-shipping.test.ts`: cover purchased product/option whitespace-insensitive allocation and normalized ambiguity detection.
- Modify `lib/actions/shipping-upload.ts`: fetch candidate inventories broadly enough for whitespace-insensitive matching, detect purchased-stock normalized ambiguity before allocation, canonicalize purchased item names before RPC creation, and remove exact-name `.in(...)` assumptions.
- Create `supabase/migrations/20260520000001_shipping_fee_cart_stock_name_match.sql`: redefine affected RPCs so exitmall shipping approval does not check/deduct deposit, stock-order reservation ignores pending shipping fees, and approval mismatch checks ignore whitespace.
- Modify `lib/inventory.ts`: pending shipping fees no longer reduce available deposit.
- Modify `tests/unit/inventory-calc.test.ts`: update deposit reservation expectation.
- Modify `components/CartProvider.tsx`: add stock-aware cart limit calculation and exported pure helper for tests.
- Create `tests/unit/cart-limits.test.ts`: cover stock-aware max quantity and stock exceeded state.
- Modify `app/(user)/layout.tsx`: pass product stock into `CartProvider`.
- Modify `components/ProductCard.tsx`: prevent adding more than current stock and pass stock into cart items.
- Modify `app/(user)/cart/page.tsx`: show row-level stock shortage and disable checkout link when any item exceeds stock.
- Modify `app/(admin)/admin/shipping-uploads/exitmall/[id]/page.tsx`: remove balance insufficiency warning for shipping fees.
- Modify `app/(admin)/admin/shipping-uploads/exitmall/[id]/ReviewActions.tsx`: change approval button/toast copy to inventory-only deduction.
- Modify `app/(user)/deposit/page.tsx`: remove shipping-reserved display branch once deposit computation reports zero shipping reservation.
- Modify `README.md`, `components/guide/Group1Guide.tsx`, and `components/guide/AdminGuide.tsx`: update "shipping fee deducted/reserved" wording to "shipping fee shown for separate settlement".
- Run focused Vitest commands, typecheck, and a final grep for stale "shipping fee deducted" phrasing.

---

### Task 1: Whitespace-Insensitive Exitmall Matching Helper

**Files:**
- Modify: `lib/shipping-match.ts`
- Test: `tests/unit/shipping-match.test.ts`

- [ ] **Step 1: Write failing tests for normalized product matching**

Append these tests inside `describe('matchInventoryRefs', ...)` in `tests/unit/shipping-match.test.ts`:

```ts
  it('matches product names while ignoring whitespace differences', () => {
    const r = matchInventoryRefs(
      ['안국약품토비콤', '상품  B'],
      [
        { id: 'p-a', name: '안국약품  토비콤' },
        { id: 'p-b', name: '상품 B' },
      ],
      [],
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refs.get('안국약품토비콤')).toEqual({ kind: 'product', id: 'p-a' });
    expect(r.refs.get('상품  B')).toEqual({ kind: 'product', id: 'p-b' });
  });

  it('reports duplicate product names after whitespace normalization', () => {
    const r = matchInventoryRefs(
      ['ABC'],
      [
        { id: 'p-1', name: 'A BC' },
        { id: 'p-2', name: 'AB C' },
      ],
      [],
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.duplicates).toEqual(['ABC']);
  });

  it('reports duplicate custom names after whitespace normalization when no product wins', () => {
    const r = matchInventoryRefs(
      ['수기ABC'],
      [],
      [
        { id: 'c-1', name: '수기 AB C' },
        { id: 'c-2', name: '수기A BC' },
      ],
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.duplicates).toEqual(['수기ABC']);
  });
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm vitest run tests/unit/shipping-match.test.ts
```

Expected: FAIL because `matchInventoryRefs` currently uses exact string keys.

- [ ] **Step 3: Implement normalized matching**

Replace the body of `lib/shipping-match.ts` with this implementation:

```ts
export type InventoryRef =
  | { kind: 'product'; id: string }
  | { kind: 'custom'; id: string };

export type ProductLite = { id: string; name: string };
export type CustomInventoryLite = { id: string; name: string };

export type MatchResult =
  | { ok: true; refs: Map<string, InventoryRef> }
  | { ok: false; duplicates: string[]; unknown: string[] };

export function normalizeProductMatchKey(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '');
}

function displayDuplicateKey(key: string, inputNames: string[]): string {
  return inputNames.find((name) => normalizeProductMatchKey(name) === key) ?? key;
}

export function matchInventoryRefs(
  names: string[],
  products: ProductLite[],
  customs: CustomInventoryLite[],
): MatchResult {
  const inputNames = Array.from(new Set(names));
  const productByKey = new Map<string, string>();
  const duplicateKeys = new Set<string>();

  for (const product of products) {
    const key = normalizeProductMatchKey(product.name);
    if (productByKey.has(key)) {
      duplicateKeys.add(key);
    } else {
      productByKey.set(key, product.id);
    }
  }

  const customByKey = new Map<string, string>();
  for (const custom of customs) {
    const key = normalizeProductMatchKey(custom.name);
    if (customByKey.has(key) && !productByKey.has(key)) {
      duplicateKeys.add(key);
    } else if (!customByKey.has(key)) {
      customByKey.set(key, custom.id);
    }
  }

  if (duplicateKeys.size > 0) {
    return {
      ok: false,
      duplicates: Array.from(duplicateKeys).map((key) => displayDuplicateKey(key, inputNames)),
      unknown: [],
    };
  }

  const refs = new Map<string, InventoryRef>();
  const unknown: string[] = [];

  for (const name of inputNames) {
    const key = normalizeProductMatchKey(name);
    const pid = productByKey.get(key);
    if (pid) {
      refs.set(name, { kind: 'product', id: pid });
      continue;
    }
    const cid = customByKey.get(key);
    if (cid) {
      refs.set(name, { kind: 'custom', id: cid });
      continue;
    }
    unknown.push(name);
  }

  if (unknown.length > 0) {
    return { ok: false, duplicates: [], unknown };
  }
  return { ok: true, refs };
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run:

```bash
pnpm vitest run tests/unit/shipping-match.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/shipping-match.ts tests/unit/shipping-match.test.ts
git commit -m "feat: 배송대행 상품명 공백 무시 매칭 추가"
```

---

### Task 2: Purchased-Stock Whitespace Matching

**Files:**
- Modify: `lib/purchased-shipping.ts`
- Test: `tests/unit/purchased-shipping.test.ts`

- [ ] **Step 1: Write failing tests for purchased FIFO matching**

Add `detectPurchasedInventoryAmbiguities` to the import list in `tests/unit/purchased-shipping.test.ts`, then append this test inside `describe('allocatePurchasedInventoryFifo', ...)`:

```ts
  it('matches purchased stock product and option while ignoring whitespace', () => {
    const result = allocatePurchasedInventoryFifo(
      [
        {
          id: 'lot-space',
          product_name: '안국약품  토비콤',
          option_name: '500 ml',
          available_quantity: 4,
          created_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      [
        {
          item_no: 1,
          product_name: '안국약품토비콤',
          option_name: '500ml',
          quantity: 3,
        },
      ],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allocations).toEqual([{ item_no: 1, lot_id: 'lot-space', quantity: 3 }]);
  });
```

Append this new describe block after `describe('allocatePurchasedInventoryFifo', ...)`:

```ts
describe('detectPurchasedInventoryAmbiguities', () => {
  it('reports distinct purchased labels that collapse to the same product and option key', () => {
    const ambiguities = detectPurchasedInventoryAmbiguities([
      {
        id: 'lot-1',
        product_name: 'A BC',
        option_name: '500 ml',
        available_quantity: 1,
        created_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'lot-2',
        product_name: 'AB C',
        option_name: '500ml',
        available_quantity: 1,
        created_at: '2026-05-02T00:00:00.000Z',
      },
    ]);

    expect(ambiguities).toEqual([
      { key: 'ABC\u0000500ml', labels: ['A BC / 500 ml', 'AB C / 500ml'] },
    ]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm vitest run tests/unit/purchased-shipping.test.ts
```

Expected: FAIL because `allocatePurchasedInventoryFifo` currently compares exact `product_name` and `option_name`, and `detectPurchasedInventoryAmbiguities` does not exist.

- [ ] **Step 3: Implement normalized purchased FIFO matching**

At the top of `lib/purchased-shipping.ts`, add:

```ts
import { normalizeProductMatchKey } from '@/lib/shipping-match';
```

After `PurchasedInventorySummaryRow`, add:

```ts
export type PurchasedInventoryAmbiguity = {
  key: string;
  labels: string[];
};
```

Replace `keyOf` with:

```ts
function keyOf(productName: string, optionName: string): string {
  return `${normalizeProductMatchKey(productName)}\u0000${normalizeProductMatchKey(optionName)}`;
}

function labelOf(productName: string, optionName: string): string {
  return optionName ? `${productName} / ${optionName}` : productName;
}
```

In `allocatePurchasedInventoryFifo`, replace the `matchingLots` filter with:

```ts
    const demandKey = keyOf(demand.product_name, demand.option_name);
    const matchingLots = orderedLots.filter(
      (lot) => keyOf(lot.product_name, lot.option_name) === demandKey,
    );
```

Before `allocatePurchasedInventoryFifo`, add:

```ts
export function detectPurchasedInventoryAmbiguities(
  lots: PurchasedInventoryLot[],
): PurchasedInventoryAmbiguity[] {
  const labelsByKey = new Map<string, Set<string>>();
  for (const lot of lots) {
    const key = keyOf(lot.product_name, lot.option_name);
    const labels = labelsByKey.get(key) ?? new Set<string>();
    labels.add(labelOf(lot.product_name, lot.option_name));
    labelsByKey.set(key, labels);
  }

  return Array.from(labelsByKey.entries())
    .filter(([, labels]) => labels.size > 1)
    .map(([key, labels]) => ({
      key,
      labels: Array.from(labels).sort((a, b) => a.localeCompare(b, 'ko')),
    }));
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run:

```bash
pnpm vitest run tests/unit/purchased-shipping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add lib/purchased-shipping.ts tests/unit/purchased-shipping.test.ts
git commit -m "feat: 사입재고 배송대행 공백 무시 배정"
```

---

### Task 3: Upload Actions Fetch Broad Candidates and Canonicalize Purchased Items

**Files:**
- Modify: `lib/actions/shipping-upload.ts`

- [ ] **Step 1: Update exitmall candidate queries**

In `requestShippingUploadAction`, replace the two exact `.in('name', productNames)` queries:

```ts
  const [{ data: productRows }, { data: customRows }] = await Promise.all([
    supabase.from('products').select('id, name').in('name', productNames),
    supabase
      .from('user_custom_inventory')
      .select('id, name')
      .eq('user_id', u.user.id)
      .in('name', productNames),
  ]);
```

with broad candidate queries:

```ts
  const [{ data: productRows }, { data: customRows }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .is('deleted_at', null),
    supabase
      .from('user_custom_inventory')
      .select('id, name')
      .eq('user_id', u.user.id),
  ]);
```

Expected result: `matchInventoryRefs` receives all possible names and performs whitespace-insensitive filtering.

- [ ] **Step 2: Update purchased lot query**

In `lib/actions/shipping-upload.ts`, add `detectPurchasedInventoryAmbiguities` to the purchased-shipping import:

```ts
  allocatePurchasedInventoryFifo,
  detectPurchasedInventoryAmbiguities,
  type PurchasedInventoryLot,
  type PurchasedShippingDemand,
```

In `fetchPurchasedLotsForUpload`, remove the `productNames` parameter from the function signature and delete the `.in('product_name', productNames)` filter.

Replace:

```ts
async function fetchPurchasedLotsForUpload(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  productNames: string[],
): Promise<PurchasedInventoryLot[]> {
```

with:

```ts
async function fetchPurchasedLotsForUpload(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<PurchasedInventoryLot[]> {
```

Replace the call site:

```ts
  const productNames = Array.from(new Set(demands.map((demand) => demand.product_name)));
  const lots = await fetchPurchasedLotsForUpload(supabase, u.user.id, productNames);
```

with:

```ts
  const lots = await fetchPurchasedLotsForUpload(supabase, u.user.id);
```

- [ ] **Step 3: Detect purchased-stock ambiguities and canonicalize RPC items**

Immediately after fetching `lots`, add:

```ts
  const ambiguities = detectPurchasedInventoryAmbiguities(lots);
  if (ambiguities.length > 0) {
    const shown = ambiguities
      .slice(0, 3)
      .map((ambiguity) => ambiguity.labels.join(' / '))
      .join(', ');
    const more = ambiguities.length > 3 ? ' 외' : '';
    return { ok: false, error: `공백 제거 후 같은 사입재고명이 여러 개 있습니다: ${shown}${more}` };
  }
```

After successful allocation and before `callRpc`, add:

```ts
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const lotByItemNo = new Map<number, PurchasedInventoryLot>();
  for (const itemAllocation of allocation.allocations) {
    if (!lotByItemNo.has(itemAllocation.item_no)) {
      const lot = lotById.get(itemAllocation.lot_id);
      if (lot) lotByItemNo.set(itemAllocation.item_no, lot);
    }
  }
  const itemsForRpc = parsed.items.map((item) => {
    const lot = lotByItemNo.get(item.no);
    return lot
      ? { ...item, product_code: lot.product_name, product_name: lot.option_name }
      : item;
  });
```

In the `create_purchased_shipping_upload` RPC payload, replace:

```ts
      p_items: parsed.items as Json,
```

with:

```ts
      p_items: itemsForRpc as Json,
```

Expected result: whitespace-insensitive purchased allocation succeeds, and the existing RPC allocation identity check receives canonical lot names.

- [ ] **Step 4: Run action-related tests**

Run:

```bash
pnpm vitest run tests/unit/shipping-match.test.ts tests/unit/purchased-shipping.test.ts tests/unit/shipping-upload-parser.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add lib/actions/shipping-upload.ts
git commit -m "fix: 배송대행 업로드 후보 조회를 공백 무시 매칭에 맞춤"
```

---

### Task 4: Database Shipping-Fee Policy Migration

**Files:**
- Create: `supabase/migrations/20260520000001_shipping_fee_cart_stock_name_match.sql`
- Test: `tests/unit/shipping-upload-rpc.test.ts`

- [ ] **Step 1: Write SQL assertion tests**

Add these imports at the top of `tests/unit/shipping-upload-rpc.test.ts`, below the existing Vitest import:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
```

Append this test block to the bottom of `tests/unit/shipping-upload-rpc.test.ts`:

```ts
describe('20260520000001 shipping fee policy migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260520000001_shipping_fee_cart_stock_name_match.sql'),
    'utf8',
  );

  it('does not deduct deposit balance in approve_shipping_upload', () => {
    const approveStart = sql.indexOf('create or replace function public.approve_shipping_upload');
    const requestStart = sql.indexOf('create or replace function public.request_stock_order');
    const approveSql = sql.slice(approveStart, requestStart);

    expect(approveSql).not.toContain('deposit_balance = deposit_balance - v_upload.shipping_fee_total');
    expect(approveSql).not.toContain('INSUFFICIENT_BALANCE');
    expect(approveSql).not.toContain("'배송대행 승인 (배송비)'");
  });

  it('does not reserve pending shipping fees for stock orders', () => {
    const requestStart = sql.indexOf('create or replace function public.request_stock_order');
    const requestSql = sql.slice(requestStart);

    expect(requestSql).not.toContain('from public.order_uploads');
    expect(requestSql).not.toContain('shipping_fee_total');
  });

  it('compares approval product names after removing whitespace', () => {
    expect(sql).toContain('public.product_match_key');
    expect(sql).toContain("public.product_match_key(v_resolved_name) <> public.product_match_key(v_row->>'product_code')");
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm vitest run tests/unit/shipping-upload-rpc.test.ts
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create migration**

Create `supabase/migrations/20260520000001_shipping_fee_cart_stock_name_match.sql` with:

```sql
create or replace function public.product_match_key(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(value, ''), '\s+', '', 'g')
$$;

create or replace function public.approve_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_upload record;
  v_user record;
  v_row jsonb;
  v_product_id uuid;
  v_custom_id uuid;
  v_qty int;
  v_pcheck record;
  v_ccheck record;
  v_expected_fee bigint;
  v_resolved_name text;
  v_alloc_check record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  select id, status, deposit_balance into v_user
    from public.profiles where id = v_upload.user_id for update;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.status <> 'active' then raise exception 'USER_NOT_ACTIVE'; end if;

  if jsonb_array_length(v_upload.items) = 0 then raise exception 'EMPTY_ITEMS'; end if;

  v_expected_fee := jsonb_array_length(v_upload.items)::bigint * 3300;
  if v_upload.shipping_fee_total <> v_expected_fee then
    raise exception 'INVALID_FEE:%:%', v_upload.shipping_fee_total, v_expected_fee;
  end if;

  if coalesce(v_upload.upload_type, 'exitmall') = 'purchased' then
    if not exists (
      select 1 from public.purchased_shipping_allocations psa
      where psa.upload_id = v_upload.id
    ) then
      raise exception 'EMPTY_ALLOCATIONS';
    end if;

    for v_alloc_check in
      select psa.lot_id, sum(psa.quantity)::int as quantity
      from public.purchased_shipping_allocations psa
      where psa.upload_id = v_upload.id
      group by psa.lot_id
    loop
      update public.purchased_inventory_lots
        set remaining_quantity = remaining_quantity - v_alloc_check.quantity
        where id = v_alloc_check.lot_id
          and user_id = v_upload.user_id
          and remaining_quantity >= v_alloc_check.quantity;
      if not found then
        raise exception 'INSUFFICIENT_PURCHASED_INVENTORY:%:%:%',
          v_alloc_check.lot_id,
          v_alloc_check.quantity,
          coalesce((select remaining_quantity from public.purchased_inventory_lots
                    where id = v_alloc_check.lot_id and user_id = v_upload.user_id), 0);
      end if;
    end loop;

    update public.order_uploads
      set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
      where id = upload_id;
    return;
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is not null
      and (it->>'custom_inventory_id') is not null
  ) then
    raise exception 'INVALID_ITEM_BOTH_IDS';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is null and (it->>'custom_inventory_id') is null
  ) then
    raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
  end if;

  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    if (v_row->>'product_id') is not null then
      select name into v_resolved_name
        from public.products
        where id = (v_row->>'product_id')::uuid;
      if v_resolved_name is null then
        raise exception 'PRODUCT_NOT_FOUND:%', v_row->>'product_id';
      end if;
      if public.product_match_key(v_resolved_name) <> public.product_match_key(v_row->>'product_code') then
        raise exception 'PRODUCT_MISMATCH:%:%:%',
          v_row->>'product_id', v_row->>'product_code', v_resolved_name;
      end if;
    elsif (v_row->>'custom_inventory_id') is not null then
      select name into v_resolved_name
        from public.user_custom_inventory
        where id = (v_row->>'custom_inventory_id')::uuid
          and user_id = v_upload.user_id;
      if v_resolved_name is null then
        raise exception 'PRODUCT_NOT_FOUND:%', v_row->>'custom_inventory_id';
      end if;
      if public.product_match_key(v_resolved_name) <> public.product_match_key(v_row->>'product_code') then
        raise exception 'PRODUCT_MISMATCH:%:%:%',
          v_row->>'custom_inventory_id', v_row->>'product_code', v_resolved_name;
      end if;
    end if;
  end loop;

  for v_pcheck in
    with rows as (
      select (it->>'product_id')::uuid as product_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
      where (it->>'product_id') is not null
    ),
    by_product as (
      select product_id, sum(quantity)::int as need_qty
      from rows group by product_id
    )
    select bp.product_id, bp.need_qty,
           coalesce(ui.quantity, 0) as available
    from by_product bp
    left join public.user_inventory ui
      on ui.user_id = v_upload.user_id and ui.product_id = bp.product_id
  loop
    if v_pcheck.available < v_pcheck.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_pcheck.product_id, v_pcheck.need_qty, v_pcheck.available;
    end if;
  end loop;

  for v_ccheck in
    with rows as (
      select (it->>'custom_inventory_id')::uuid as custom_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
      where (it->>'custom_inventory_id') is not null
    ),
    by_custom as (
      select custom_id, sum(quantity)::int as need_qty
      from rows group by custom_id
    )
    select bc.custom_id, bc.need_qty,
           coalesce(uci.quantity, 0) as available
    from by_custom bc
    left join public.user_custom_inventory uci
      on uci.user_id = v_upload.user_id and uci.id = bc.custom_id
  loop
    if v_ccheck.available < v_ccheck.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_ccheck.custom_id, v_ccheck.need_qty, v_ccheck.available;
    end if;
  end loop;

  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    v_product_id := nullif(v_row->>'product_id', '')::uuid;
    v_custom_id := nullif(v_row->>'custom_inventory_id', '')::uuid;

    if v_product_id is not null then
      update public.user_inventory
        set quantity = quantity - v_qty, updated_at = now()
        where user_id = v_upload.user_id
          and product_id = v_product_id
          and quantity >= v_qty;
      if not found then
        raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
          v_product_id, v_qty,
          coalesce((select quantity from public.user_inventory
                    where user_id = v_upload.user_id and product_id = v_product_id), 0);
      end if;
      insert into public.inventory_movements
        (user_id, product_id, delta, source_type, source_id)
      values
        (v_upload.user_id, v_product_id, -v_qty, 'shipping_upload_approved', v_upload.id);

    elsif v_custom_id is not null then
      update public.user_custom_inventory
        set quantity = quantity - v_qty, updated_at = now()
        where user_id = v_upload.user_id
          and id = v_custom_id
          and quantity >= v_qty;
      if not found then
        raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
          v_custom_id, v_qty,
          coalesce((select quantity from public.user_custom_inventory
                    where user_id = v_upload.user_id and id = v_custom_id), 0);
      end if;
      insert into public.custom_inventory_movements
        (user_id, custom_inventory_id, delta, source_type, source_id)
      values
        (v_upload.user_id, v_custom_id, -v_qty, 'shipping_upload_approved', v_upload.id);

    else
      raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
    end if;
  end loop;

  update public.order_uploads
    set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.approve_shipping_upload(uuid) to authenticated;

create or replace function public.request_stock_order(items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_balance bigint;
  v_total bigint := 0;
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_qty int;
  v_subtotal bigint;
  v_normalized jsonb := '[]'::jsonb;
  v_pending_committed bigint := 0;
  v_already_bought int;
  v_pending_qty int;
  v_legacy_qty int;
  v_check record;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;

  select status, deposit_balance into v_status, v_balance
    from public.profiles where id = v_user_id for update;
  if v_status is null then raise exception 'UNAUTHORIZED'; end if;
  if v_status <> 'active' then raise exception 'NOT_ACTIVE'; end if;

  if jsonb_array_length(items) = 0 then raise exception 'EMPTY_CART'; end if;

  for v_check in
    with input_rows as (
      select (e->>'product_id')::uuid as product_id,
             coalesce((e->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(items) as e
    ),
    matched as (
      select ir.product_id, ir.quantity, p.per_user_limit
      from input_rows ir
      join public.products p on p.id = ir.product_id
      where p.per_user_limit is not null
    )
    select product_id, per_user_limit, sum(quantity)::int as batch_qty
    from matched group by product_id, per_user_limit
  loop
    select coalesce(sum((it->>'qty')::int), 0)::int into v_already_bought
      from public.stock_orders so,
           lateral jsonb_array_elements(so.items) it
      where so.user_id = v_user_id
        and so.status = 'approved'
        and (it->>'product_id')::uuid = v_check.product_id;

    select coalesce(sum((it->>'qty')::int), 0)::int into v_pending_qty
      from public.stock_orders so,
           lateral jsonb_array_elements(so.items) it
      where so.user_id = v_user_id
        and so.status = 'pending'
        and (it->>'product_id')::uuid = v_check.product_id;

    select coalesce(sum(oi.quantity), 0)::int into v_legacy_qty
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.user_id = v_user_id
        and o.status <> 'cancelled'
        and oi.product_id = v_check.product_id;

    if v_already_bought + v_pending_qty + v_legacy_qty + v_check.batch_qty > v_check.per_user_limit then
      raise exception 'PER_USER_LIMIT_EXCEEDED:%:%:%',
        v_check.product_id, v_check.per_user_limit,
        v_already_bought + v_pending_qty + v_legacy_qty;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid;
    if v_product is null then raise exception 'PRODUCT_NOT_FOUND:%', v_item->>'product_id'; end if;
    if v_product.is_active = false then raise exception 'PRODUCT_INACTIVE:%', v_product.id; end if;
    if v_product.stock >= 0 and v_product.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_product.id;
    end if;

    v_subtotal := v_product.price * v_qty;
    v_total := v_total + v_subtotal;

    v_normalized := v_normalized || jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'qty', v_qty,
      'unit_price', v_product.price,
      'subtotal', v_subtotal
    );
  end loop;

  select coalesce(sum(total_amount), 0) into v_pending_committed
    from public.stock_orders
    where user_id = v_user_id and status = 'pending';

  if v_balance - v_pending_committed < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.stock_orders (user_id, status, total_amount, items)
  values (v_user_id, 'pending', v_total, v_normalized)
  returning id into v_order_id;

  return v_order_id;
end; $$;

grant execute on function public.request_stock_order(jsonb) to authenticated;
```

- [ ] **Step 4: Run the focused test and verify pass**

Run:

```bash
pnpm vitest run tests/unit/shipping-upload-rpc.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add supabase/migrations/20260520000001_shipping_fee_cart_stock_name_match.sql tests/unit/shipping-upload-rpc.test.ts
git commit -m "fix: 배송대행 배송비 예치금 차감 제거"
```

---

### Task 5: Deposit Reservation Calculation

**Files:**
- Modify: `lib/inventory.ts`
- Test: `tests/unit/inventory-calc.test.ts`

- [ ] **Step 1: Update failing deposit calculation test**

In `tests/unit/inventory-calc.test.ts`, replace the test named `stock + shipping 예약 모두 차감` with:

```ts
  it('stock 예약만 가용 예치금에서 차감하고 배송대행 배송비는 안내 금액으로 둔다', () => {
    const stock: PendingStockOrderRow[] = [{ id: 's1', total_amount: 30_000 }];
    const ship: PendingShippingFeeRow[] = [
      { id: 'u1', shipping_fee_total: 9_900 },
      { id: 'u2', shipping_fee_total: 6_600 },
    ];
    expect(computeAvailableDeposit(100_000, stock, ship)).toEqual({
      balance: 100_000,
      stockReserved: 30_000,
      shippingReserved: 0,
      available: 70_000,
    });
  });
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
pnpm vitest run tests/unit/inventory-calc.test.ts
```

Expected: FAIL because `computeAvailableDeposit` still subtracts shipping fees.

- [ ] **Step 3: Implement deposit calculation policy**

In `lib/inventory.ts`, replace `computeAvailableDeposit` with:

```ts
export function computeAvailableDeposit(
  balance: number,
  pendingStockOrders: PendingStockOrderRow[],
  _pendingShippingFees: PendingShippingFeeRow[],
): AvailableDeposit {
  const stockReserved = pendingStockOrders.reduce((s, r) => s + r.total_amount, 0);
  return {
    balance,
    stockReserved,
    shippingReserved: 0,
    available: balance - stockReserved,
  };
}
```

- [ ] **Step 4: Run focused test and verify pass**

Run:

```bash
pnpm vitest run tests/unit/inventory-calc.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add lib/inventory.ts tests/unit/inventory-calc.test.ts
git commit -m "fix: 배송대행 배송비를 예치금 예약에서 제외"
```

---

### Task 6: Stock-Aware Cart Limits

**Files:**
- Modify: `components/CartProvider.tsx`
- Create: `tests/unit/cart-limits.test.ts`

- [ ] **Step 1: Write failing cart limit tests**

Create `tests/unit/cart-limits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeCartLimitInfo, type CartItem, type CartLimit } from '@/components/CartProvider';

describe('computeCartLimitInfo', () => {
  it('uses stock as the max cart quantity when stock is finite', () => {
    const items: CartItem[] = [
      { productId: 'p1', name: 'A', price: 1000, quantity: 5, stock: 3 },
    ];
    const limits: Record<string, CartLimit> = {
      p1: { perUserLimit: null, alreadyBought: 0, stock: 3 },
    };

    expect(computeCartLimitInfo('p1', items, limits)).toMatchObject({
      stock: 3,
      stockExceeded: true,
      maxCartQuantity: 3,
      reached: true,
    });
  });

  it('treats stock -1 as unlimited stock', () => {
    const items: CartItem[] = [
      { productId: 'p1', name: 'A', price: 1000, quantity: 50, stock: -1 },
    ];
    const limits: Record<string, CartLimit> = {
      p1: { perUserLimit: null, alreadyBought: 0, stock: -1 },
    };

    expect(computeCartLimitInfo('p1', items, limits)).toMatchObject({
      stock: -1,
      stockExceeded: false,
      maxCartQuantity: null,
      reached: false,
    });
  });

  it('uses the smaller value between remaining purchase limit and stock', () => {
    const items: CartItem[] = [
      { productId: 'p1', name: 'A', price: 1000, quantity: 2, stock: 10 },
    ];
    const limits: Record<string, CartLimit> = {
      p1: { perUserLimit: 5, alreadyBought: 3, stock: 10 },
    };

    expect(computeCartLimitInfo('p1', items, limits)).toMatchObject({
      remaining: 2,
      maxCartQuantity: 2,
      reached: true,
      stockExceeded: false,
    });
  });
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
pnpm vitest run tests/unit/cart-limits.test.ts
```

Expected: FAIL because `computeCartLimitInfo` is not exported and stock fields do not exist.

- [ ] **Step 3: Implement stock-aware cart helper**

In `components/CartProvider.tsx`:

1. Add `stock: number;` to `CartLimit`.
2. Add `stock?: number;` to `CartItem`.
3. Add these fields to `CartLimitInfo`:

```ts
  stock: number | null;
  stockExceeded: boolean;
```

4. Rename `getLimitInfoFrom` to exported `computeCartLimitInfo`:

```ts
export function computeCartLimitInfo(
  productId: string,
  items: CartItem[],
  limits: Record<string, CartLimit>,
  fallback?: CartItem,
): CartLimitInfo {
  const item = items.find((p) => p.productId === productId) ?? fallback;
  const serverLimit = limits[productId];
  const perUserLimit = serverLimit?.perUserLimit ?? item?.perUserLimit ?? null;
  const alreadyBought = serverLimit?.alreadyBought ?? item?.alreadyBought ?? 0;
  const stock = serverLimit?.stock ?? item?.stock ?? null;
  const quantity = item?.quantity ?? 0;
  const remaining = perUserLimit === null ? null : Math.max(0, perUserLimit - alreadyBought);
  const stockLimit = stock === null || stock < 0 ? null : Math.max(0, stock);
  const maxCartQuantity =
    remaining === null && stockLimit === null
      ? null
      : Math.min(remaining ?? Number.POSITIVE_INFINITY, stockLimit ?? Number.POSITIVE_INFINITY);

  return {
    perUserLimit,
    alreadyBought,
    stock,
    maxCartQuantity,
    remaining,
    quantity,
    reached: maxCartQuantity !== null && quantity >= maxCartQuantity,
    stockExceeded: stockLimit !== null && quantity > stockLimit,
  };
}
```

5. Replace internal calls to `getLimitInfoFrom` with `computeCartLimitInfo`.

- [ ] **Step 4: Run focused test and verify pass**

Run:

```bash
pnpm vitest run tests/unit/cart-limits.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add components/CartProvider.tsx tests/unit/cart-limits.test.ts
git commit -m "feat: 장바구니 재고 제한 계산 추가"
```

---

### Task 7: Cart and Product UI Stock Blocking

**Files:**
- Modify: `app/(user)/layout.tsx`
- Modify: `components/ProductCard.tsx`
- Modify: `app/(user)/cart/page.tsx`

- [ ] **Step 1: Pass product stock into cart provider**

In `app/(user)/layout.tsx`, change:

```ts
type ProductLimitRow = {
  id: string;
  per_user_limit: number | null;
};
```

to:

```ts
type ProductLimitRow = {
  id: string;
  per_user_limit: number | null;
  stock: number;
};
```

Change the products query:

```ts
supabase.from('products').select('id,per_user_limit').is('deleted_at', null),
```

to:

```ts
supabase.from('products').select('id,per_user_limit,stock').is('deleted_at', null),
```

Change each `cartLimits` value to:

```ts
      {
        perUserLimit: product.per_user_limit,
        alreadyBought: purchasedMap.get(product.id) ?? 0,
        stock: product.stock,
      },
```

- [ ] **Step 2: Update product card add behavior**

In `components/ProductCard.tsx`, compute stock limit:

```ts
  const stockReached = product.stock >= 0 && inCart >= product.stock;
  const reached = (limit !== null && alreadyBought + inCart >= limit) || stockReached;
  const remaining = limit !== null ? Math.max(0, limit - alreadyBought - inCart) : null;
```

In `onAdd`, before the purchase-limit toast, add:

```ts
    if (stockReached) {
      toast({
        title: '재고가 부족합니다',
        description: `현재 재고는 ${product.stock}개입니다.`,
        variant: 'destructive',
      });
      return;
    }
```

When calling `add`, include:

```ts
      stock: product.stock,
```

Update the disabled button label branch:

```tsx
          ) : stockReached ? (
            '재고 부족'
```

- [ ] **Step 3: Show cart shortage and disable checkout**

In `app/(user)/cart/page.tsx`, after `itemCount`, add:

```ts
  const hasStockShortage = items.some((item) => getLimitInfo(item.productId).stockExceeded);
```

Inside each item row after the purchase-limit paragraph, add:

```tsx
                  {limitInfo.stockExceeded && limitInfo.stock !== null && (
                    <p className="text-xs text-destructive mt-1">
                      현재 재고 {limitInfo.stock}개라서 {item.quantity}개 주문할 수 없습니다.
                    </p>
                  )}
```

Replace the checkout button block:

```tsx
            <Button asChild className="w-full h-11">
              <Link href="/checkout">
                주문하기
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
```

with:

```tsx
            {hasStockShortage && (
              <p className="mb-3 text-sm text-destructive">
                재고가 부족한 상품의 수량을 줄이면 주문할 수 있습니다.
              </p>
            )}
            {hasStockShortage ? (
              <Button className="w-full h-11" disabled>
                주문하기
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button asChild className="w-full h-11">
                <Link href="/checkout">
                  주문하기
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            )}
```

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add 'app/(user)/layout.tsx' components/ProductCard.tsx 'app/(user)/cart/page.tsx'
git commit -m "feat: 장바구니 재고 부족 주문 차단"
```

---

### Task 8: Shipping Fee UI and Docs Copy

**Files:**
- Modify: `app/(admin)/admin/shipping-uploads/exitmall/[id]/page.tsx`
- Modify: `app/(admin)/admin/shipping-uploads/exitmall/[id]/ReviewActions.tsx`
- Modify: `app/(user)/deposit/page.tsx`
- Modify: `README.md`
- Modify: `components/guide/Group1Guide.tsx`
- Modify: `components/guide/AdminGuide.tsx`

- [ ] **Step 1: Remove exitmall shipping fee balance warning**

In `app/(admin)/admin/shipping-uploads/exitmall/[id]/page.tsx`, remove the `hasInsufficientBalance` import usage and set:

```tsx
        insufficient={false}
```

Delete the warning block containing:

```tsx
가용 예치금이 배송비보다 부족합니다. 승인 시 차감 단계에서 실패할 수 있습니다.
```

Add an info section near the customer summary:

```tsx
      <section className="rounded-md border border-accent/20 bg-accent/5 p-3 text-sm text-muted-foreground">
        배송비는 행 수 기준 안내 금액으로만 표시합니다. 승인 시 예치금은 차감하지 않습니다.
      </section>
```

- [ ] **Step 2: Update exitmall review action copy**

In `app/(admin)/admin/shipping-uploads/exitmall/[id]/ReviewActions.tsx`, replace the approval toast description with:

```ts
                description: '보유 재고가 차감되었습니다. 배송비는 예치금에서 차감하지 않습니다.',
```

Replace the approval button label with:

```tsx
          승인 (재고 차감)
```

- [ ] **Step 3: Update deposit page reserved copy**

In `app/(user)/deposit/page.tsx`, remove the shipping-reserved display branch:

```tsx
                {dep.shippingReserved > 0 && (
                  <span className="ml-1 text-[11px]">(배송 {formatKRW(dep.shippingReserved)})</span>
                )}
```

Replace any label that says stock plus shipping reservation with:

```tsx
검토대기 상품 구매 예약
```

- [ ] **Step 4: Update README policy lines**

In `README.md`, update these meanings:

- Flow 2 line: from "배송비 차감" to "배송비 안내, 별도 정산".
- Security/available deposit line: from "상품 구매 검토대기 금액과 배송대행 검토대기 배송비를 함께 예약" to "상품 구매 검토대기 금액만 예약".
- Flow 2 process: from "보유 재고와 배송비 모두 예약" to "보유 재고는 예약되고 배송비는 안내 금액으로만 표시".

- [ ] **Step 5: Update guide copy**

In `components/guide/Group1Guide.tsx`, replace the shipping-upload sentence:

```tsx
<li>관리자가 승인하면 내 재고에서 그만큼 빠지고 배송비도 차감됩니다.</li>
```

with:

```tsx
<li>관리자가 승인하면 내 재고에서 그만큼 빠지고, 배송비는 안내 금액으로만 표시됩니다.</li>
```

In `components/guide/AdminGuide.tsx`, replace admin shipping approval copy that says user inventory and shipping fee are deducted with:

```tsx
<p>승인하면 사용자의 재고가 차감됩니다. 배송비는 안내 금액으로만 표시하고 예치금에서는 차감하지 않습니다.</p>
```

- [ ] **Step 6: Grep for stale shipping fee deduction language**

Run:

```bash
rg -n "배송비.*차감|배송.*예약|shippingReserved|INSUFFICIENT_BALANCE" README.md components app lib supabase/migrations/20260520000001_shipping_fee_cart_stock_name_match.sql
```

Expected: no stale user-facing "배송비 차감/예약" references for exitmall shipping. `INSUFFICIENT_BALANCE` may remain in stock-order code and error mapping; it must not appear inside the new migration's `approve_shipping_upload` function.

- [ ] **Step 7: Commit Task 8**

```bash
git add 'app/(admin)/admin/shipping-uploads/exitmall/[id]/page.tsx' 'app/(admin)/admin/shipping-uploads/exitmall/[id]/ReviewActions.tsx' 'app/(user)/deposit/page.tsx' README.md components/guide/Group1Guide.tsx components/guide/AdminGuide.tsx
git commit -m "docs: 배송대행 배송비 별도 정산 문구 반영"
```

---

### Task 9: Final Verification

**Files:**
- Verify all changed files

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
pnpm vitest run tests/unit/shipping-match.test.ts tests/unit/purchased-shipping.test.ts tests/unit/inventory-calc.test.ts tests/unit/cart-limits.test.ts tests/unit/shipping-upload-rpc.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Review git status**

Run:

```bash
git status --short
```

Expected: clean working tree after task commits, or only intentionally untracked local artifacts unrelated to this feature.

- [ ] **Step 5: Commit verification-only fixes if needed**

If any test/typecheck fixes were required in this final task, commit them:

```bash
git add components lib app tests supabase README.md
git commit -m "fix: 배송대행 정책 변경 검증 보완"
```

If no fixes were required, do not create an empty commit.
