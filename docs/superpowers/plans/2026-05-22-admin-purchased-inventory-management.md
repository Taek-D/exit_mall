# Admin Purchased Inventory Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only interface for adding and editing user purchased-inventory lots used by purchased shipping uploads, while protecting pending reservations.

**Architecture:** Extend `purchased_inventory_lots` so manual admin lots share the same stock pool as inbound-list lots. Add admin-only RPCs for all writes, server actions that validate input and map errors, and a user-detail manager component that shows purchased stock, pending reservations, and safe edit controls.

**Tech Stack:** Next.js App Router, React client components, Supabase Postgres/RLS/RPC, TypeScript, Zod, Vitest.

**Post-review adjustment:** `admin_memo` is not stored on owner-readable `purchased_inventory_lots`. Current admin memo state is derived from admin-only `purchased_inventory_lot_adjustments` rows.

---

## File Structure

- Create `supabase/migrations/20260522000001_admin_purchased_inventory_management.sql`: schema additions, RLS, RPCs, and updated purchased-lot lookup assumptions.
- Modify `lib/purchased-shipping.ts`: support manual lots in fetch/query helper logic where needed and add pure helpers for reservation summaries if useful.
- Create `lib/errors/purchased-inventory.ts`: map admin purchased-inventory RPC errors into Korean user-facing messages.
- Create `lib/actions/admin-purchased-inventory.ts`: admin server actions for add/update.
- Modify `lib/admin/user-detail.ts`: fetch purchased inventory rows and pending reservation quantities for the admin user detail page.
- Create `app/(admin)/admin/users/[id]/PurchasedInventoryManager.tsx`: admin UI for adding/editing purchased inventory lots.
- Modify `app/(admin)/admin/users/[id]/page.tsx`: render the new manager.
- Add/modify tests under `tests/unit`: migration/RPC assertions, error mapping, action validation, and user-detail pure helpers.

---

### Task 1: Migration Test for Schema and RPC Contract

**Files:**
- Test: `tests/unit/admin-purchased-inventory-migration.test.ts`
- Later modify: `supabase/migrations/20260522000001_admin_purchased_inventory_management.sql`

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/unit/admin-purchased-inventory-migration.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260522000001_admin_purchased_inventory_management.sql'),
  'utf8',
);

describe('admin purchased inventory management migration', () => {
  it('allows manual purchased lots without an inbound request', () => {
    expect(sql).toContain('alter table public.purchased_inventory_lots');
    expect(sql).toMatch(/alter\s+column\s+inbound_request_id\s+drop\s+not\s+null/i);
    expect(sql).toContain("source_type text not null default 'inbound_request'");
    expect(sql).toContain("source_type in ('inbound_request','admin_manual')");
  });

  it('adds an adjustment audit table with admin-only RLS', () => {
    expect(sql).toContain('create table if not exists public.purchased_inventory_lot_adjustments');
    expect(sql).toContain('alter table public.purchased_inventory_lot_adjustments enable row level security');
    expect(sql).toContain('purchased_inventory_lot_adjustments_admin_all');
  });

  it('defines admin-only add and update RPCs', () => {
    expect(sql).toContain('create or replace function public.admin_add_purchased_inventory_lot');
    expect(sql).toContain('create or replace function public.admin_update_purchased_inventory_lot');
    expect(sql).toContain('if not public.is_admin() then raise exception');
    expect(sql).toContain('grant execute on function public.admin_add_purchased_inventory_lot');
    expect(sql).toContain('grant execute on function public.admin_update_purchased_inventory_lot');
  });

  it('protects pending reservations during edits', () => {
    expect(sql).toContain('RESERVED_QUANTITY_EXCEEDED');
    expect(sql).toContain('RESERVED_IDENTITY_LOCKED');
    expect(sql).toMatch(/join\s+public\.order_uploads\s+ou\s+on\s+ou\.id\s+=\s+psa\.upload_id/i);
    expect(sql).toContain("ou.status = 'pending'");
    expect(sql).toContain("ou.upload_type = 'purchased'");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/admin-purchased-inventory-migration.test.ts`

Expected: FAIL because `supabase/migrations/20260522000001_admin_purchased_inventory_management.sql` does not exist.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/admin-purchased-inventory-migration.test.ts
git commit -m "test: cover admin purchased inventory migration contract"
```

---

### Task 2: Database Migration for Manual Purchased Inventory Lots

**Files:**
- Create: `supabase/migrations/20260522000001_admin_purchased_inventory_management.sql`
- Test: `tests/unit/admin-purchased-inventory-migration.test.ts`

- [ ] **Step 1: Add the migration**

Create `supabase/migrations/20260522000001_admin_purchased_inventory_management.sql`:

```sql
alter table public.purchased_inventory_lots
  alter column inbound_request_id drop not null;

alter table public.purchased_inventory_lots
  add column if not exists source_type text not null default 'inbound_request'
    check (source_type in ('inbound_request','admin_manual')),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id);

update public.purchased_inventory_lots
  set source_type = 'inbound_request'
  where source_type is null;

create index if not exists purchased_inventory_lots_user_source_idx
  on public.purchased_inventory_lots (user_id, source_type, created_at desc);

create table if not exists public.purchased_inventory_lot_adjustments (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.purchased_inventory_lots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  before_product_name text,
  after_product_name text not null,
  before_option_name text,
  after_option_name text not null,
  before_remaining_quantity int,
  after_remaining_quantity int not null check (after_remaining_quantity >= 0),
  memo text check (memo is null or length(memo) <= 200),
  created_at timestamptz not null default now()
);

alter table public.purchased_inventory_lot_adjustments enable row level security;

drop policy if exists purchased_inventory_lot_adjustments_admin_all
  on public.purchased_inventory_lot_adjustments;
create policy purchased_inventory_lot_adjustments_admin_all
  on public.purchased_inventory_lot_adjustments
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.purchased_inventory_lot_adjustments to authenticated;

create or replace function public.admin_add_purchased_inventory_lot(
  target_user uuid,
  product_name text,
  option_name text,
  quantity int,
  memo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_lot_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'USER_NOT_FOUND';
  end if;
  if product_name is null or length(trim(product_name)) < 1 or length(trim(product_name)) > 100 then
    raise exception 'INVALID_NAME';
  end if;
  if coalesce(quantity, 0) < 1 then raise exception 'INVALID_QUANTITY'; end if;
  if memo is not null and length(memo) > 200 then raise exception 'INVALID_MEMO'; end if;

  insert into public.purchased_inventory_lots (
    inbound_request_id,
    user_id,
    product_name,
    option_name,
    row_number,
    initial_quantity,
    remaining_quantity,
    source_type,
    updated_by
  )
  values (
    null,
    target_user,
    trim(product_name),
    coalesce(trim(option_name), ''),
    1,
    quantity,
    quantity,
    'admin_manual',
    v_admin
  )
  returning id into v_lot_id;

  insert into public.purchased_inventory_lot_adjustments (
    lot_id, user_id, admin_id,
    before_product_name, after_product_name,
    before_option_name, after_option_name,
    before_remaining_quantity, after_remaining_quantity,
    memo
  )
  values (
    v_lot_id, target_user, v_admin,
    null, trim(product_name),
    null, coalesce(trim(option_name), ''),
    null, quantity,
    nullif(trim(coalesce(memo, '')), '')
  );

  return v_lot_id;
end; $$;

create or replace function public.admin_update_purchased_inventory_lot(
  target_user uuid,
  lot_id uuid,
  product_name text,
  option_name text,
  remaining_quantity int,
  memo text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_lot record;
  v_reserved int := 0;
  v_new_product text := trim(product_name);
  v_new_option text := coalesce(trim(option_name), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_new_product is null or length(v_new_product) < 1 or length(v_new_product) > 100 then
    raise exception 'INVALID_NAME';
  end if;
  if coalesce(remaining_quantity, -1) < 0 then raise exception 'INVALID_QUANTITY'; end if;
  if memo is not null and length(memo) > 200 then raise exception 'INVALID_MEMO'; end if;

  select * into v_lot
    from public.purchased_inventory_lots
    where id = lot_id and user_id = target_user
    for update;
  if v_lot is null then raise exception 'NOT_FOUND'; end if;

  select coalesce(sum(psa.quantity), 0)::int into v_reserved
    from public.purchased_shipping_allocations psa
    join public.order_uploads ou on ou.id = psa.upload_id
    where psa.lot_id = lot_id
      and ou.upload_type = 'purchased'
      and ou.status = 'pending';

  if remaining_quantity < v_reserved then
    raise exception 'RESERVED_QUANTITY_EXCEEDED:%:%', v_reserved, remaining_quantity;
  end if;

  if v_reserved > 0
     and (v_lot.product_name <> v_new_product or coalesce(v_lot.option_name, '') <> v_new_option) then
    raise exception 'RESERVED_IDENTITY_LOCKED:%', v_reserved;
  end if;

  update public.purchased_inventory_lots
    set product_name = v_new_product,
        option_name = v_new_option,
        remaining_quantity = admin_update_purchased_inventory_lot.remaining_quantity,
        updated_at = now(),
        updated_by = v_admin
    where id = lot_id;

  insert into public.purchased_inventory_lot_adjustments (
    lot_id, user_id, admin_id,
    before_product_name, after_product_name,
    before_option_name, after_option_name,
    before_remaining_quantity, after_remaining_quantity,
    memo
  )
  values (
    lot_id, target_user, v_admin,
    v_lot.product_name, v_new_product,
    coalesce(v_lot.option_name, ''), v_new_option,
    v_lot.remaining_quantity, remaining_quantity,
    nullif(trim(coalesce(memo, '')), '')
  );
end; $$;

revoke execute on function public.admin_add_purchased_inventory_lot(uuid, text, text, int, text)
  from public, anon;
revoke execute on function public.admin_update_purchased_inventory_lot(uuid, uuid, text, text, int, text)
  from public, anon;
grant execute on function public.admin_add_purchased_inventory_lot(uuid, text, text, int, text)
  to authenticated;
grant execute on function public.admin_update_purchased_inventory_lot(uuid, uuid, text, text, int, text)
  to authenticated;
```

- [ ] **Step 2: Run the migration contract test**

Run: `pnpm vitest run tests/unit/admin-purchased-inventory-migration.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/20260522000001_admin_purchased_inventory_management.sql tests/unit/admin-purchased-inventory-migration.test.ts
git commit -m "feat(db): add admin purchased inventory management rpcs"
```

---

### Task 3: Purchased Inventory Error Mapping

**Files:**
- Create: `lib/errors/purchased-inventory.ts`
- Create: `tests/unit/purchased-inventory-error.test.ts`

- [ ] **Step 1: Write the failing error mapping test**

Create `tests/unit/purchased-inventory-error.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapPurchasedInventoryError } from '@/lib/errors/purchased-inventory';

describe('mapPurchasedInventoryError', () => {
  it('maps reserved quantity errors with numbers', () => {
    const result = mapPurchasedInventoryError('RESERVED_QUANTITY_EXCEEDED:3:2');
    expect(result).toBe('현재 예약 3개가 있어 남은 수량을 2개로 줄일 수 없습니다.');
  });

  it('maps reserved identity lock errors', () => {
    const result = mapPurchasedInventoryError('RESERVED_IDENTITY_LOCKED:4');
    expect(result).toBe('검토대기 배송대행에 4개가 예약되어 있어 상품명/옵션을 변경할 수 없습니다.');
  });

  it('maps common validation errors', () => {
    expect(mapPurchasedInventoryError('FORBIDDEN')).toBe('관리자만 처리할 수 있습니다.');
    expect(mapPurchasedInventoryError('USER_NOT_FOUND')).toBe('사용자를 찾을 수 없습니다.');
    expect(mapPurchasedInventoryError('NOT_FOUND')).toBe('사입재고를 찾을 수 없습니다.');
    expect(mapPurchasedInventoryError('INVALID_NAME')).toBe('상품명은 1자 이상 100자 이하여야 합니다.');
    expect(mapPurchasedInventoryError('INVALID_QUANTITY')).toBe('수량은 0 이상이어야 합니다.');
    expect(mapPurchasedInventoryError('INVALID_MEMO')).toBe('메모는 200자 이하여야 합니다.');
  });

  it('falls back for unknown errors', () => {
    expect(mapPurchasedInventoryError('SOMETHING_ELSE')).toBe('처리 중 오류가 발생했습니다.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/purchased-inventory-error.test.ts`

Expected: FAIL because `lib/errors/purchased-inventory.ts` does not exist.

- [ ] **Step 3: Add the mapper**

Create `lib/errors/purchased-inventory.ts`:

```ts
export function mapPurchasedInventoryError(message: string): string {
  if (message.startsWith('FORBIDDEN')) return '관리자만 처리할 수 있습니다.';
  if (message.startsWith('USER_NOT_FOUND')) return '사용자를 찾을 수 없습니다.';
  if (message.startsWith('NOT_FOUND')) return '사입재고를 찾을 수 없습니다.';
  if (message.startsWith('INVALID_NAME')) return '상품명은 1자 이상 100자 이하여야 합니다.';
  if (message.startsWith('INVALID_QUANTITY')) return '수량은 0 이상이어야 합니다.';
  if (message.startsWith('INVALID_MEMO')) return '메모는 200자 이하여야 합니다.';
  if (message.startsWith('RESERVED_QUANTITY_EXCEEDED')) {
    const [, reserved = '0', requested = '0'] = message.split(':');
    return `현재 예약 ${reserved}개가 있어 남은 수량을 ${requested}개로 줄일 수 없습니다.`;
  }
  if (message.startsWith('RESERVED_IDENTITY_LOCKED')) {
    const [, reserved = '0'] = message.split(':');
    return `검토대기 배송대행에 ${reserved}개가 예약되어 있어 상품명/옵션을 변경할 수 없습니다.`;
  }
  return '처리 중 오류가 발생했습니다.';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/unit/purchased-inventory-error.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/errors/purchased-inventory.ts tests/unit/purchased-inventory-error.test.ts
git commit -m "feat: map purchased inventory admin errors"
```

---

### Task 4: Server Actions for Admin Add and Update

**Files:**
- Create: `lib/actions/admin-purchased-inventory.ts`
- Test: `tests/unit/admin-purchased-inventory-action.test.ts`

- [ ] **Step 1: Write validation-focused unit tests**

Create `tests/unit/admin-purchased-inventory-action.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  parseAddPurchasedInventoryInput,
  parseUpdatePurchasedInventoryInput,
} from '@/lib/actions/admin-purchased-inventory';

describe('admin purchased inventory action validation', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const lotId = '22222222-2222-4222-8222-222222222222';

  it('accepts add input and trims text', () => {
    expect(
      parseAddPurchasedInventoryInput({
        userId,
        productName: '  Shampoo  ',
        optionName: '  500ml  ',
        quantity: 5,
        memo: '  manual add  ',
      }),
    ).toEqual({
      ok: true,
      data: {
        userId,
        productName: 'Shampoo',
        optionName: '500ml',
        quantity: 5,
        memo: 'manual add',
      },
    });
  });

  it('rejects add quantity below one', () => {
    const result = parseAddPurchasedInventoryInput({
      userId,
      productName: 'Shampoo',
      optionName: '',
      quantity: 0,
      memo: '',
    });
    expect(result.ok).toBe(false);
  });

  it('accepts update quantity of zero', () => {
    expect(
      parseUpdatePurchasedInventoryInput({
        userId,
        lotId,
        productName: 'Shampoo',
        optionName: '',
        remainingQuantity: 0,
        memo: '',
      }),
    ).toEqual({
      ok: true,
      data: {
        userId,
        lotId,
        productName: 'Shampoo',
        optionName: '',
        remainingQuantity: 0,
        memo: '',
      },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/admin-purchased-inventory-action.test.ts`

Expected: FAIL because the action file does not exist.

- [ ] **Step 3: Add server actions and exported parsers**

Create `lib/actions/admin-purchased-inventory.ts`:

```ts
'use server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, formatZodError, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { mapPurchasedInventoryError } from '@/lib/errors/purchased-inventory';

const text = z.string().trim();

const addSchema = z.object({
  userId: z.string().uuid(),
  productName: text.min(1, '상품명을 입력해 주세요.').max(100, '상품명은 100자 이하여야 합니다.'),
  optionName: text.max(100).optional().default(''),
  quantity: z.number().int().min(1, '수량은 1 이상이어야 합니다.'),
  memo: text.max(200).optional().default(''),
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  lotId: z.string().uuid(),
  productName: text.min(1, '상품명을 입력해 주세요.').max(100, '상품명은 100자 이하여야 합니다.'),
  optionName: text.max(100).optional().default(''),
  remainingQuantity: z.number().int().min(0, '남은 수량은 0 이상이어야 합니다.'),
  memo: text.max(200).optional().default(''),
});

export function parseAddPurchasedInventoryInput(input: unknown) {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: formatZodError(parsed.error) };
  return { ok: true as const, data: parsed.data };
}

export function parseUpdatePurchasedInventoryInput(input: unknown) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: formatZodError(parsed.error) };
  return { ok: true as const, data: parsed.data };
}

function revalidateUser(userId: string) {
  revalidatePaths([`/admin/users/${userId}`, '/shipping-uploads/purchased']);
}

export async function addPurchasedInventoryLotAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = parseAddPurchasedInventoryInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await callRpc(guard.supabase, 'admin_add_purchased_inventory_lot', {
    target_user: parsed.data.userId,
    product_name: parsed.data.productName,
    option_name: parsed.data.optionName,
    quantity: parsed.data.quantity,
    memo: parsed.data.memo || null,
  });
  if (error) {
    console.error('[admin-purchased-inventory] add', error);
    return { ok: false, error: mapPurchasedInventoryError(error.message) };
  }
  revalidateUser(parsed.data.userId);
  return { ok: true, id: data as string };
}

export async function updatePurchasedInventoryLotAction(input: unknown): Promise<ActionResult> {
  const parsed = parseUpdatePurchasedInventoryInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { error } = await callRpc(guard.supabase, 'admin_update_purchased_inventory_lot', {
    target_user: parsed.data.userId,
    lot_id: parsed.data.lotId,
    product_name: parsed.data.productName,
    option_name: parsed.data.optionName,
    remaining_quantity: parsed.data.remainingQuantity,
    memo: parsed.data.memo || null,
  });
  if (error) {
    console.error('[admin-purchased-inventory] update', error);
    return { ok: false, error: mapPurchasedInventoryError(error.message) };
  }
  revalidateUser(parsed.data.userId);
  return { ok: true };
}
```

- [ ] **Step 4: Run the action tests**

Run: `pnpm vitest run tests/unit/admin-purchased-inventory-action.test.ts tests/unit/purchased-inventory-error.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/admin-purchased-inventory.ts tests/unit/admin-purchased-inventory-action.test.ts
git commit -m "feat: add admin purchased inventory actions"
```

---

### Task 5: Admin User Detail Query and Pure Reservation Summary

**Files:**
- Modify: `lib/admin/user-detail.ts`
- Test: `tests/unit/admin-user-detail.test.ts`

- [ ] **Step 1: Add a failing pure-helper test**

Append to `tests/unit/admin-user-detail.test.ts`:

```ts
import { summarizePurchasedInventoryReservations } from '@/lib/admin/user-detail';

describe('summarizePurchasedInventoryReservations', () => {
  it('adds pending reservations onto purchased lots', () => {
    const rows = summarizePurchasedInventoryReservations(
      [
        {
          id: 'lot-1',
          product_name: 'Shampoo',
          option_name: '500ml',
          initial_quantity: 10,
          remaining_quantity: 7,
          source_type: 'admin_manual',
          admin_memo: 'manual',
          created_at: '2026-05-22T00:00:00.000Z',
          updated_at: '2026-05-22T00:00:00.000Z',
        },
      ],
      [{ lot_id: 'lot-1', quantity: 3 }],
    );

    expect(rows).toEqual([
      {
        id: 'lot-1',
        product_name: 'Shampoo',
        option_name: '500ml',
        initial_quantity: 10,
        remaining_quantity: 7,
        reserved_quantity: 3,
        source_type: 'admin_manual',
        admin_memo: 'manual',
        created_at: '2026-05-22T00:00:00.000Z',
        updated_at: '2026-05-22T00:00:00.000Z',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/admin-user-detail.test.ts`

Expected: FAIL because `summarizePurchasedInventoryReservations` is not exported.

- [ ] **Step 3: Add types and helper to `lib/admin/user-detail.ts`**

Add:

```ts
export type AdminPurchasedInventoryLotRow = {
  id: string;
  product_name: string;
  option_name: string;
  initial_quantity: number;
  remaining_quantity: number;
  source_type: 'inbound_request' | 'admin_manual';
  created_at: string;
  updated_at: string;
};

export type AdminPurchasedInventoryMemoRow = {
  lot_id: string;
  after_admin_memo: string | null;
  created_at: string;
};

export type AdminPurchasedInventoryReservationRow = {
  lot_id: string;
  quantity: number;
};

export type AdminPurchasedInventoryRow = AdminPurchasedInventoryLotRow & {
  reserved_quantity: number;
  admin_memo: string | null;
};

export function summarizePurchasedInventoryReservations(
  lots: AdminPurchasedInventoryLotRow[],
  reservations: AdminPurchasedInventoryReservationRow[],
): AdminPurchasedInventoryRow[] {
  const reservedByLot = new Map<string, number>();
  for (const reservation of reservations) {
    reservedByLot.set(
      reservation.lot_id,
      (reservedByLot.get(reservation.lot_id) ?? 0) + Number(reservation.quantity),
    );
  }
  return lots.map((lot) => ({
    ...lot,
    option_name: lot.option_name ?? '',
    reserved_quantity: reservedByLot.get(lot.id) ?? 0,
  }));
}
```

Extend `AdminUserDetail`:

```ts
purchasedInventory: AdminPurchasedInventoryRow[];
```

- [ ] **Step 4: Fetch purchased lots and pending reservations**

In `fetchAdminUserDetail`, add two Promise entries:

```ts
(supabase.from as any)('purchased_inventory_lots')
  .select('id, product_name, option_name, initial_quantity, remaining_quantity, source_type, created_at, updated_at, inbound_requests(status)')
  .eq('user_id', userId)
  .or('source_type.eq.admin_manual,inbound_requests.status.eq.completed')
  .order('created_at', { ascending: false }),
supabase
  .from('order_uploads')
  .select('id')
  .eq('user_id', userId)
  .eq('upload_type', 'purchased')
  .eq('status', 'pending'),
```

After the pending upload IDs are known, query allocations:

```ts
const pendingPurchasedUploadIds = ((pendingPurchasedUploads ?? []) as Array<{ id: string }>).map(
  (row) => row.id,
);
let purchasedReservations: AdminPurchasedInventoryReservationRow[] = [];
if (pendingPurchasedUploadIds.length > 0) {
  const { data } = await (supabase.from as any)('purchased_shipping_allocations')
    .select('lot_id, quantity')
    .eq('user_id', userId)
    .in('upload_id', pendingPurchasedUploadIds);
  purchasedReservations = (data ?? []) as AdminPurchasedInventoryReservationRow[];
}
```

Return:

```ts
purchasedInventory: summarizePurchasedInventoryReservations(
  (purchasedInventory ?? []) as unknown as AdminPurchasedInventoryLotRow[],
  purchasedReservations,
),
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/unit/admin-user-detail.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/user-detail.ts tests/unit/admin-user-detail.test.ts
git commit -m "feat: fetch admin purchased inventory rows"
```

---

### Task 6: Include Manual Lots in Purchased Shipping Allocation

**Files:**
- Modify: `lib/actions/shipping-upload.ts`
- Test: `tests/unit/admin-purchased-inventory-migration.test.ts`

- [ ] **Step 1: Extend migration/action contract test**

Add to `tests/unit/admin-purchased-inventory-migration.test.ts`:

```ts
import { readFileSync as read } from 'fs';

describe('purchased upload manual lot support', () => {
  const action = read(join(process.cwd(), 'lib/actions/shipping-upload.ts'), 'utf8');

  it('fetches manual lots as well as completed inbound lots', () => {
    expect(action).toContain('source_type');
    expect(action).toContain('admin_manual');
    expect(action).not.toContain("inbound_requests!inner(status)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/admin-purchased-inventory-migration.test.ts`

Expected: FAIL because `fetchPurchasedLotsForUpload` still uses `inbound_requests!inner(status)`.

- [ ] **Step 3: Modify `fetchPurchasedLotsForUpload`**

Replace the lot query in `lib/actions/shipping-upload.ts` with:

```ts
const { data: lotData, error: lotErr } = await (supabase.from as any)('purchased_inventory_lots')
  .select('id, product_name, option_name, remaining_quantity, created_at, source_type, inbound_requests(status)')
  .eq('user_id', userId)
  .or('source_type.eq.admin_manual,inbound_requests.status.eq.completed')
  .order('created_at', { ascending: true });
```

Keep the existing mapping to `PurchasedInventoryLot[]`.

- [ ] **Step 4: Run purchased shipping tests**

Run: `pnpm vitest run tests/unit/admin-purchased-inventory-migration.test.ts tests/unit/purchased-shipping.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/shipping-upload.ts tests/unit/admin-purchased-inventory-migration.test.ts
git commit -m "feat: include manual lots in purchased shipping allocation"
```

---

### Task 7: Admin Purchased Inventory Manager UI

**Files:**
- Create: `app/(admin)/admin/users/[id]/PurchasedInventoryManager.tsx`
- Modify: `app/(admin)/admin/users/[id]/page.tsx`

- [ ] **Step 1: Create the client component**

Create `app/(admin)/admin/users/[id]/PurchasedInventoryManager.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  addPurchasedInventoryLotAction,
  updatePurchasedInventoryLotAction,
} from '@/lib/actions/admin-purchased-inventory';
import type { AdminPurchasedInventoryRow } from '@/lib/admin/user-detail';

export function PurchasedInventoryManager({
  userId,
  rows,
}: {
  userId: string;
  rows: AdminPurchasedInventoryRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [productName, setProductName] = useState('');
  const [optionName, setOptionName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const [editing, setEditing] = useState<Record<string, {
    productName: string;
    optionName: string;
    remainingQuantity: number;
    memo: string;
  }>>({});
  const [rowError, setRowError] = useState<Record<string, string | null>>({});
  const [updating, startUpdate] = useTransition();

  const editState = (row: AdminPurchasedInventoryRow) =>
    editing[row.id] ?? {
      productName: row.product_name,
      optionName: row.option_name,
      remainingQuantity: row.remaining_quantity,
      memo: row.admin_memo ?? '',
    };

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <h3 className="font-medium">사입재고 관리</h3>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">관리자 수기 재고 추가</p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_110px_1fr_auto] gap-2">
          <Input placeholder="상품명" value={productName} onChange={(e) => setProductName(e.target.value)} />
          <Input placeholder="옵션" value={optionName} onChange={(e) => setOptionName(e.target.value)} />
          <Input
            type="number"
            min={1}
            value={Number.isFinite(quantity) ? quantity : 1}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
          />
          <Input placeholder="메모" value={memo} onChange={(e) => setMemo(e.target.value)} />
          <Button
            disabled={adding || productName.trim().length === 0 || quantity < 1}
            onClick={() =>
              startAdd(async () => {
                setAddError(null);
                const result = await addPurchasedInventoryLotAction({
                  userId,
                  productName,
                  optionName,
                  quantity,
                  memo,
                });
                if (!result.ok) {
                  setAddError(result.error ?? '처리 중 오류가 발생했습니다.');
                  return;
                }
                toast({ title: '사입재고 추가 완료' });
                setProductName('');
                setOptionName('');
                setQuantity(1);
                setMemo('');
                router.refresh();
              })
            }
          >
            {adding ? '추가 중...' : '추가'}
          </Button>
        </div>
        {addError && <p className="text-sm text-destructive">{addError}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">현재 사입재고</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 사입재고가 없습니다.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-surface-muted text-xs text-muted-foreground">
                <tr>
                  <th className="h-9 px-3 text-left font-medium">상품명</th>
                  <th className="px-3 text-left font-medium">옵션</th>
                  <th className="px-3 text-right font-medium">총 입고</th>
                  <th className="px-3 text-right font-medium">남은 수량</th>
                  <th className="px-3 text-right font-medium">예약</th>
                  <th className="px-3 text-left font-medium">출처</th>
                  <th className="px-3 text-left font-medium">메모</th>
                  <th className="px-3 text-right font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = editState(row);
                  const locked = row.reserved_quantity > 0;
                  return (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-3 py-2">
                        <Input
                          value={state.productName}
                          disabled={locked}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [row.id]: { ...state, productName: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={state.optionName}
                          disabled={locked}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [row.id]: { ...state, optionName: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular">{row.initial_quantity}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={row.reserved_quantity}
                          value={Number.isFinite(state.remainingQuantity) ? state.remainingQuantity : 0}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [row.id]: {
                                ...state,
                                remainingQuantity: parseInt(e.target.value, 10) || 0,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular text-amber-600">
                        {row.reserved_quantity > 0 ? row.reserved_quantity : '-'}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {row.source_type === 'admin_manual' ? '관리자 수기' : '입고리스트'}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={state.memo}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [row.id]: { ...state, memo: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="secondary"
                          disabled={updating || state.remainingQuantity < row.reserved_quantity}
                          onClick={() =>
                            startUpdate(async () => {
                              setRowError((prev) => ({ ...prev, [row.id]: null }));
                              const result = await updatePurchasedInventoryLotAction({
                                userId,
                                lotId: row.id,
                                productName: state.productName,
                                optionName: state.optionName,
                                remainingQuantity: state.remainingQuantity,
                                memo: state.memo,
                              });
                              if (!result.ok) {
                                setRowError((prev) => ({
                                  ...prev,
                                  [row.id]: result.error ?? '처리 중 오류가 발생했습니다.',
                                }));
                                return;
                              }
                              toast({ title: '사입재고 수정 완료' });
                              router.refresh();
                            })
                          }
                        >
                          저장
                        </Button>
                        {rowError[row.id] && (
                          <p className="mt-1 text-left text-xs text-destructive">{rowError[row.id]}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it from the admin user detail page**

Modify `app/(admin)/admin/users/[id]/page.tsx` imports:

```ts
import { PurchasedInventoryManager } from './PurchasedInventoryManager';
```

Destructure `purchasedInventory` from `detail`:

```ts
const {
  profile: user,
  orders,
  deposits,
  transactions,
  inventory,
  customInventory,
  purchasedInventory,
  products,
  totalSpent,
} = detail;
```

Render after `CustomInventoryManager`:

```tsx
<PurchasedInventoryManager userId={user.id} rows={purchasedInventory} />
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -- 'app/(admin)/admin/users/[id]/PurchasedInventoryManager.tsx' 'app/(admin)/admin/users/[id]/page.tsx'
git commit -m "feat: add admin purchased inventory manager UI"
```

---

### Task 8: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm vitest run tests/unit/admin-purchased-inventory-migration.test.ts tests/unit/purchased-inventory-error.test.ts tests/unit/admin-purchased-inventory-action.test.ts tests/unit/admin-user-detail.test.ts tests/unit/purchased-shipping.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full unit test suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Review final diff**

Run: `git diff --stat HEAD~8..HEAD`

Expected: changes are limited to DB migration, purchased inventory admin actions/errors, admin user detail data, purchased shipping manual lot lookup, UI component, and unit tests.

- [ ] **Step 5: Final commit if any verification fixes were needed**

If verification required fixes:

```bash
git add .
git commit -m "fix: polish admin purchased inventory management"
```

If no fixes were needed, do not create an empty commit.
