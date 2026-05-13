# 입고리스트(Inbound Requests) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private board-style menu (`입고리스트`) where customers post private inbound-stock requests with an Excel attachment and optional images, and admins reply via comments to track progress; status transitions are open → in_progress → completed (+ cancelled), with unread-count badges driven by Supabase Realtime.

**Architecture:** Two new Postgres tables (`inbound_requests`, `inbound_request_comments`) with RLS isolating each thread to its author + admins. Comment writes and status transitions go through `security definer` RPCs to validate state-machine rules atomically. Private storage bucket (`inbound-requests`) with owner-folder convention reuses the existing `order-uploads` pattern. UI follows existing `shipping-uploads` page layout and the `StatusBadge` pattern.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS + Realtime + Storage), TypeScript, Tailwind/shadcn, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-12-inbound-requests-design.md`

**Branch:** `feature/입고리스트메뉴생성`

---

## File Structure

### Created files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260512000003_inbound_requests.sql` | Tables, RLS, storage bucket+policies, RPCs, realtime publication |
| `lib/inbound/permissions.ts` | Pure helpers: `canTransition`, `canEditRequest`, `canEditComment` |
| `lib/inbound/queries.ts` | Server-only fetch helpers for list/detail/unread |
| `lib/actions/inbound-request.ts` | Server actions: submit, cancel, update, comment CRUD, mark-read, attachment URL |
| `components/inbound/InboundAttachmentList.tsx` | Server component — signed-URL rendering for excel + images |
| `components/inbound/InboundCommentList.tsx` | Server component — comment thread |
| `components/inbound/InboundCommentForm.tsx` | Client — comment input with 10-min edit window logic |
| `components/inbound/InboundUnreadBadge.tsx` | Client — Realtime-driven unread counter for nav |
| `app/(user)/inbound-requests/page.tsx` | User list + Excel template card |
| `app/(user)/inbound-requests/new/page.tsx` | User new-request page (server shell) |
| `app/(user)/inbound-requests/new/NewRequestForm.tsx` | Client form for new request |
| `app/(user)/inbound-requests/[id]/page.tsx` | User detail page |
| `app/(admin)/admin/inbound-requests/page.tsx` | Admin list with tabs |
| `app/(admin)/admin/inbound-requests/[id]/page.tsx` | Admin detail |
| `app/(admin)/admin/inbound-requests/[id]/StatusControls.tsx` | Client — admin status-transition buttons |
| `public/inbound-template.xlsx` | Copy of root `입고리스트 양식.xlsx` |
| `tests/unit/inbound-types.test.ts` | Status/label/transition tests |
| `tests/unit/inbound-schemas.test.ts` | Zod schema tests |
| `tests/unit/inbound-permissions.test.ts` | Permission helper tests including 10-min boundary |

### Modified files

| Path | Change |
|---|---|
| `lib/types.ts` | Add `InboundStatus` type + `INBOUND_STATUS_LABEL` |
| `lib/schemas.ts` | Add `inboundRequestCreateSchema`, `inboundCommentSchema` |
| `lib/db-types.ts` | Regenerated via `pnpm db:types` after migration |
| `components/StatusBadge.tsx` | Add `InboundStatusBadge` |
| `components/NavUser.tsx` | Insert `입고리스트` menu item |
| `components/AdminSidebar.tsx` | Insert `입고리스트` menu item |

---

## Task 1: Types & labels (TDD)

**Files:**
- Modify: `lib/types.ts`
- Test: `tests/unit/inbound-types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/inbound-types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { INBOUND_STATUS_LABEL, type InboundStatus } from '@/lib/types';

describe('INBOUND_STATUS_LABEL', () => {
  it('maps all 4 statuses to Korean labels', () => {
    expect(INBOUND_STATUS_LABEL.open).toBe('접수');
    expect(INBOUND_STATUS_LABEL.in_progress).toBe('진행중');
    expect(INBOUND_STATUS_LABEL.completed).toBe('완료');
    expect(INBOUND_STATUS_LABEL.cancelled).toBe('취소');
  });

  it('has exactly 4 keys', () => {
    expect(Object.keys(INBOUND_STATUS_LABEL)).toHaveLength(4);
  });
});

describe('InboundStatus type', () => {
  it('accepts the four known values', () => {
    const samples: InboundStatus[] = ['open', 'in_progress', 'completed', 'cancelled'];
    expect(samples).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- inbound-types`
Expected: FAIL with module-not-found or `INBOUND_STATUS_LABEL` undefined.

- [ ] **Step 3: Add type and label to `lib/types.ts`**

Append at the end of `lib/types.ts`:

```ts
export type InboundStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export const INBOUND_STATUS_LABEL: Record<InboundStatus, string> = {
  open: '접수',
  in_progress: '진행중',
  completed: '완료',
  cancelled: '취소',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- inbound-types`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts tests/unit/inbound-types.test.ts
git commit -m "feat(inbound): add InboundStatus type and labels"
```

---

## Task 2: Permission & transition helpers (TDD)

**Files:**
- Create: `lib/inbound/permissions.ts`
- Test: `tests/unit/inbound-permissions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/inbound-permissions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  canTransition,
  canEditRequest,
  canEditComment,
  isLocked,
} from '@/lib/inbound/permissions';

describe('canTransition (admin-only state machine)', () => {
  it('open -> in_progress allowed', () => {
    expect(canTransition('open', 'in_progress')).toBe(true);
  });
  it('in_progress -> completed allowed', () => {
    expect(canTransition('in_progress', 'completed')).toBe(true);
  });
  it('open -> cancelled allowed', () => {
    expect(canTransition('open', 'cancelled')).toBe(true);
  });
  it('in_progress -> cancelled allowed', () => {
    expect(canTransition('in_progress', 'cancelled')).toBe(true);
  });
  it('open -> completed forbidden (must pass through in_progress)', () => {
    expect(canTransition('open', 'completed')).toBe(false);
  });
  it('completed -> in_progress forbidden (no reopen)', () => {
    expect(canTransition('completed', 'in_progress')).toBe(false);
  });
  it('cancelled -> anything forbidden', () => {
    expect(canTransition('cancelled', 'open')).toBe(false);
    expect(canTransition('cancelled', 'in_progress')).toBe(false);
    expect(canTransition('cancelled', 'completed')).toBe(false);
  });
  it('same-state transition forbidden', () => {
    expect(canTransition('open', 'open')).toBe(false);
  });
});

describe('isLocked', () => {
  it('open and in_progress are unlocked', () => {
    expect(isLocked('open')).toBe(false);
    expect(isLocked('in_progress')).toBe(false);
  });
  it('completed and cancelled are locked', () => {
    expect(isLocked('completed')).toBe(true);
    expect(isLocked('cancelled')).toBe(true);
  });
});

describe('canEditRequest (owner edits)', () => {
  it('owner can edit when status=open', () => {
    expect(canEditRequest({ status: 'open', isOwner: true, isAdmin: false })).toBe(true);
  });
  it('owner cannot edit when status=in_progress', () => {
    expect(canEditRequest({ status: 'in_progress', isOwner: true, isAdmin: false })).toBe(false);
  });
  it('non-owner non-admin cannot edit even when open', () => {
    expect(canEditRequest({ status: 'open', isOwner: false, isAdmin: false })).toBe(false);
  });
  it('admin can always edit', () => {
    expect(canEditRequest({ status: 'completed', isOwner: false, isAdmin: true })).toBe(true);
  });
});

describe('canEditComment (10-min window for own comments)', () => {
  const now = new Date('2026-05-12T10:00:00Z');
  it('own comment within 9 minutes is editable', () => {
    const created = new Date('2026-05-12T09:51:00Z'); // 9 min ago
    expect(canEditComment({ createdAt: created, isAuthor: true, isAdmin: false, now })).toBe(true);
  });
  it('own comment at 9:59 boundary is still editable', () => {
    const created = new Date('2026-05-12T09:50:01Z'); // 9 min 59 s ago
    expect(canEditComment({ createdAt: created, isAuthor: true, isAdmin: false, now })).toBe(true);
  });
  it('own comment at exactly 10 minutes is NOT editable', () => {
    const created = new Date('2026-05-12T09:50:00Z'); // exactly 10 min ago
    expect(canEditComment({ createdAt: created, isAuthor: true, isAdmin: false, now })).toBe(false);
  });
  it('non-author non-admin cannot edit', () => {
    const created = new Date('2026-05-12T09:59:00Z');
    expect(canEditComment({ createdAt: created, isAuthor: false, isAdmin: false, now })).toBe(false);
  });
  it('admin can edit any time', () => {
    const created = new Date('2025-01-01T00:00:00Z'); // very old
    expect(canEditComment({ createdAt: created, isAuthor: false, isAdmin: true, now })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- inbound-permissions`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helpers**

Create `lib/inbound/permissions.ts`:

```ts
import type { InboundStatus } from '@/lib/types';

export const COMMENT_EDIT_WINDOW_MS = 10 * 60 * 1000;

const ALLOWED_TRANSITIONS: Record<InboundStatus, readonly InboundStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: InboundStatus, to: InboundStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isLocked(status: InboundStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export type EditRequestContext = {
  status: InboundStatus;
  isOwner: boolean;
  isAdmin: boolean;
};

export function canEditRequest({ status, isOwner, isAdmin }: EditRequestContext): boolean {
  if (isAdmin) return true;
  return isOwner && status === 'open';
}

export type EditCommentContext = {
  createdAt: Date;
  isAuthor: boolean;
  isAdmin: boolean;
  now?: Date;
};

export function canEditComment({
  createdAt,
  isAuthor,
  isAdmin,
  now = new Date(),
}: EditCommentContext): boolean {
  if (isAdmin) return true;
  if (!isAuthor) return false;
  return now.getTime() - createdAt.getTime() < COMMENT_EDIT_WINDOW_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- inbound-permissions`
Expected: PASS, all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add lib/inbound/permissions.ts tests/unit/inbound-permissions.test.ts
git commit -m "feat(inbound): add transition + edit-window permission helpers"
```

---

## Task 3: Zod schemas (TDD)

**Files:**
- Modify: `lib/schemas.ts`
- Test: `tests/unit/inbound-schemas.test.ts`

- [ ] **Step 1: Inspect existing `lib/schemas.ts`**

Read `lib/schemas.ts` to confirm import style and add at the bottom. If file does not yet export a similar `*CreateSchema`, follow Zod conventions seen in other schemas in the file.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/inbound-schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  inboundRequestCreateSchema,
  inboundCommentSchema,
} from '@/lib/schemas';

describe('inboundRequestCreateSchema', () => {
  it('accepts minimal valid input', () => {
    const r = inboundRequestCreateSchema.safeParse({ title: 'a', body: '' });
    expect(r.success).toBe(true);
  });
  it('rejects empty title', () => {
    const r = inboundRequestCreateSchema.safeParse({ title: '', body: '' });
    expect(r.success).toBe(false);
  });
  it('rejects title over 200 chars', () => {
    const r = inboundRequestCreateSchema.safeParse({
      title: 'x'.repeat(201),
      body: '',
    });
    expect(r.success).toBe(false);
  });
  it('rejects body over 5000 chars', () => {
    const r = inboundRequestCreateSchema.safeParse({
      title: 'ok',
      body: 'x'.repeat(5001),
    });
    expect(r.success).toBe(false);
  });
  it('treats missing body as empty', () => {
    const r = inboundRequestCreateSchema.safeParse({ title: 'ok' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).toBe('');
  });
});

describe('inboundCommentSchema', () => {
  it('accepts a short comment', () => {
    expect(inboundCommentSchema.safeParse({ body: 'hi' }).success).toBe(true);
  });
  it('rejects empty body', () => {
    expect(inboundCommentSchema.safeParse({ body: '' }).success).toBe(false);
  });
  it('rejects body over 2000 chars', () => {
    expect(
      inboundCommentSchema.safeParse({ body: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- inbound-schemas`
Expected: FAIL with missing exports.

- [ ] **Step 4: Add schemas to `lib/schemas.ts`**

Append to the bottom of `lib/schemas.ts`:

```ts
import { z } from 'zod';

export const inboundRequestCreateSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해주세요').max(200, '제목은 200자 이하여야 합니다'),
  body: z.string().max(5000, '본문은 5000자 이하여야 합니다').optional().default(''),
});

export const inboundCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, '내용을 입력해주세요')
    .max(2000, '댓글은 2000자 이하여야 합니다'),
});
```

> If `import { z } from 'zod'` is already present at the top of the file, do not duplicate it — just append the two schemas.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- inbound-schemas`
Expected: PASS, all 8 cases green.

- [ ] **Step 6: Commit**

```bash
git add lib/schemas.ts tests/unit/inbound-schemas.test.ts
git commit -m "feat(inbound): add Zod schemas for request and comment"
```

---

## Task 4: Database migration — schema, RLS, storage, RPCs, realtime

**Files:**
- Create: `supabase/migrations/20260512000003_inbound_requests.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260512000003_inbound_requests.sql` with the full content below:

```sql
-- ============================================================================
-- 입고리스트 (Inbound Requests) — private board with comments
-- ============================================================================

-- === Table: inbound_requests ================================================
create table public.inbound_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 5000),
  status text not null default 'open'
    check (status in ('open','in_progress','completed','cancelled')),
  excel_storage_path text not null,
  excel_original_name text not null,
  image_paths text[] not null default '{}'::text[]
    check (cardinality(image_paths) <= 3),
  last_comment_at timestamptz,
  last_comment_by_role text check (last_comment_by_role in ('user','admin')),
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inbound_requests_user_idx on public.inbound_requests (user_id, created_at desc);
create index inbound_requests_status_idx on public.inbound_requests (status, created_at desc);

-- === Table: inbound_request_comments ========================================
create table public.inbound_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inbound_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_role text not null check (author_role in ('user','admin')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index inbound_comments_request_idx on public.inbound_request_comments (request_id, created_at);

-- === RLS: inbound_requests ==================================================
alter table public.inbound_requests enable row level security;

create policy inbound_requests_owner_admin_select on public.inbound_requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy inbound_requests_self_insert on public.inbound_requests
  for insert with check (user_id = auth.uid() and public.is_active());

create policy inbound_requests_self_update on public.inbound_requests
  for update using (user_id = auth.uid() and status = 'open')
  with check (user_id = auth.uid() and status = 'open');

create policy inbound_requests_self_delete on public.inbound_requests
  for delete using (user_id = auth.uid() and status = 'open');

create policy inbound_requests_admin_all on public.inbound_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- === RLS: inbound_request_comments ==========================================
alter table public.inbound_request_comments enable row level security;

create policy inbound_comments_select on public.inbound_request_comments
  for select using (
    exists (
      select 1 from public.inbound_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

-- Direct insert is blocked; all comment inserts must go through add_inbound_comment RPC.
-- (RPC runs as security definer and enforces state-machine + author_role logic atomically.)

create policy inbound_comments_self_update on public.inbound_request_comments
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy inbound_comments_self_delete on public.inbound_request_comments
  for delete using (author_id = auth.uid());

create policy inbound_comments_admin_all on public.inbound_request_comments
  for all using (public.is_admin()) with check (public.is_admin());

-- === Storage bucket =========================================================
insert into storage.buckets (id, name, public) values
  ('inbound-requests', 'inbound-requests', false)
  on conflict (id) do nothing;

create policy "inbound-requests owner read" on storage.objects
  for select using (
    bucket_id = 'inbound-requests'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy "inbound-requests owner write" on storage.objects
  for insert with check (
    bucket_id = 'inbound-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active()
  );

create policy "inbound-requests owner update" on storage.objects
  for update using (
    bucket_id = 'inbound-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "inbound-requests owner delete" on storage.objects
  for delete using (
    bucket_id = 'inbound-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "inbound-requests admin all" on storage.objects
  for all using (bucket_id = 'inbound-requests' and public.is_admin())
  with check (bucket_id = 'inbound-requests' and public.is_admin());

-- === RPC: set_inbound_status (admin) ========================================
create or replace function public.set_inbound_status(
  request_id uuid,
  new_status text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_req record;
  v_allowed boolean := false;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_req from public.inbound_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;

  -- Validate transition graph
  v_allowed := case
    when v_req.status = 'open' and new_status in ('in_progress','cancelled') then true
    when v_req.status = 'in_progress' and new_status in ('completed','cancelled') then true
    else false
  end;
  if not v_allowed then raise exception 'INVALID_TRANSITION'; end if;

  update public.inbound_requests
    set status = new_status,
        reviewed_by = case when new_status in ('completed','cancelled') then v_admin else reviewed_by end,
        updated_at = now()
    where id = request_id;
end; $$;

grant execute on function public.set_inbound_status(uuid, text) to authenticated;

-- === RPC: cancel_inbound_request ============================================
-- Author may cancel only when status='open'; admin may cancel any non-terminal state.
create or replace function public.cancel_inbound_request(request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req record;
begin
  select * into v_req from public.inbound_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;

  if public.is_admin() then
    if v_req.status in ('completed','cancelled') then raise exception 'ALREADY_CLOSED'; end if;
  else
    if v_req.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
    if v_req.status <> 'open' then raise exception 'NOT_CANCELLABLE'; end if;
  end if;

  update public.inbound_requests
    set status = 'cancelled', updated_at = now()
    where id = request_id;
end; $$;

grant execute on function public.cancel_inbound_request(uuid) to authenticated;

-- === RPC: mark_inbound_read =================================================
create or replace function public.mark_inbound_read(request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req record; v_is_admin boolean := public.is_admin();
begin
  select * into v_req from public.inbound_requests where id = request_id;
  if v_req is null then raise exception 'NOT_FOUND'; end if;

  if v_is_admin then
    update public.inbound_requests set admin_last_read_at = now() where id = request_id;
  elsif v_req.user_id = auth.uid() then
    update public.inbound_requests set user_last_read_at = now() where id = request_id;
  else
    raise exception 'FORBIDDEN';
  end if;
end; $$;

grant execute on function public.mark_inbound_read(uuid) to authenticated;

-- === RPC: add_inbound_comment ===============================================
create or replace function public.add_inbound_comment(
  request_id uuid,
  body text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_req record;
  v_role text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active() then raise exception 'INACTIVE'; end if;
  if length(body) < 1 or length(body) > 2000 then raise exception 'INVALID_BODY'; end if;

  select * into v_req from public.inbound_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;

  if v_req.status in ('completed','cancelled') then raise exception 'LOCKED'; end if;

  if v_is_admin then
    v_role := 'admin';
  elsif v_req.user_id = v_uid then
    v_role := 'user';
  else
    raise exception 'FORBIDDEN';
  end if;

  insert into public.inbound_request_comments (request_id, author_id, author_role, body)
  values (request_id, v_uid, v_role, body)
  returning id into v_id;

  update public.inbound_requests
    set last_comment_at = now(),
        last_comment_by_role = v_role,
        updated_at = now()
    where id = request_id;

  return v_id;
end; $$;

grant execute on function public.add_inbound_comment(uuid, text) to authenticated;

-- === Realtime ===============================================================
alter publication supabase_realtime add table public.inbound_requests;
alter publication supabase_realtime add table public.inbound_request_comments;
```

- [ ] **Step 2: Apply locally if Supabase is running**

Run: `pnpm supabase db reset` (only if the dev DB is empty/reproducible) — OR — `pnpm supabase migration up`
Expected: migration applies cleanly.

If no local Supabase is running, document this in the commit message and apply via `mcp__supabase__apply_migration` against the dev branch when the user requests deployment.

- [ ] **Step 3: Regenerate TypeScript types**

Run: `pnpm db:types`
Expected: `lib/db-types.ts` now contains `inbound_requests` and `inbound_request_comments` table types and the 4 new RPCs.

> If `pnpm db:types` fails because no local stack is running, skip this step and note it; types will be regenerated on the next deploy. All later TypeScript code must `as` cast through `Database` types only where strictly necessary, mirroring the existing patterns in `lib/actions/_shared.ts` (`mutationTable`, `callRpc` use `any` escape hatches deliberately).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512000003_inbound_requests.sql lib/db-types.ts
git commit -m "feat(inbound): db migration — tables, RLS, storage, RPCs, realtime"
```

---

## Task 5: Public template asset

**Files:**
- Create: `public/inbound-template.xlsx`

- [ ] **Step 1: Copy the template**

PowerShell:
```powershell
Copy-Item -Path '입고리스트 양식.xlsx' -Destination 'public\inbound-template.xlsx' -Force
```

- [ ] **Step 2: Verify file exists**

Run: `pnpm test -- shipping-template` (reuses the existing template-presence test as a sanity check that public/ is intact). If you want, add a one-liner check via `Glob` that `public/inbound-template.xlsx` exists. Otherwise just `ls public/`.

- [ ] **Step 3: Commit**

```bash
git add "public/inbound-template.xlsx"
git commit -m "feat(inbound): add downloadable Excel template asset"
```

---

## Task 6: Status badge

**Files:**
- Modify: `components/StatusBadge.tsx`

- [ ] **Step 1: Append the badge component**

At the bottom of `components/StatusBadge.tsx` (after `ShippingUploadStatusBadge`):

```tsx
import type { InboundStatus } from '@/lib/types';
import { INBOUND_STATUS_LABEL } from '@/lib/types';

const INBOUND_TONE: Record<InboundStatus, Tone> = {
  open: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
};

export function InboundStatusBadge({
  status,
  className,
}: {
  status: InboundStatus;
  className?: string;
}) {
  return (
    <Pill tone={INBOUND_TONE[status]} className={className}>
      {INBOUND_STATUS_LABEL[status]}
    </Pill>
  );
}
```

> The duplicate `import type { InboundStatus }` is intentional only if not yet imported at the top; otherwise add `InboundStatus` to the existing `import type` block at the top of the file along with `INBOUND_STATUS_LABEL` to the `import` block. Do not leave two import statements.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/StatusBadge.tsx
git commit -m "feat(inbound): add InboundStatusBadge"
```

---

## Task 7: Server queries

**Files:**
- Create: `lib/inbound/queries.ts`

- [ ] **Step 1: Implement queries**

Create `lib/inbound/queries.ts`:

```ts
import { createClient } from '@/lib/supabase/server';
import type { InboundStatus } from '@/lib/types';

export type InboundListRow = {
  id: string;
  user_id: string;
  title: string;
  status: InboundStatus;
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
  updated_at: string;
  comment_count?: number;
  profile?: { name: string } | null;
};

export type InboundRequestDetail = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  status: InboundStatus;
  excel_storage_path: string;
  excel_original_name: string;
  image_paths: string[];
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InboundCommentRow = {
  id: string;
  request_id: string;
  author_id: string;
  author_role: 'user' | 'admin';
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export async function fetchMyInboundRequests(limit = 50): Promise<InboundListRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('inbound_requests')
    .select(
      'id,user_id,title,status,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[inbound] fetchMyInboundRequests', error);
    return [];
  }
  return (data ?? []) as InboundListRow[];
}

export async function fetchAllInboundRequests(
  status: InboundStatus | 'all' = 'all',
  limit = 100,
): Promise<InboundListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from('inbound_requests')
    .select(
      'id,user_id,title,status,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at,profiles!inbound_requests_user_id_fkey(name)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) {
    console.error('[inbound] fetchAllInboundRequests', error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    ...row,
    profile: row.profiles ?? null,
  })) as InboundListRow[];
}

export async function fetchInboundRequest(id: string): Promise<{
  request: InboundRequestDetail | null;
  comments: InboundCommentRow[];
}> {
  const supabase = createClient();
  const [{ data: r }, { data: cs }] = await Promise.all([
    supabase.from('inbound_requests').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('inbound_request_comments')
      .select('*')
      .eq('request_id', id)
      .order('created_at', { ascending: true }),
  ]);
  return {
    request: (r as InboundRequestDetail) ?? null,
    comments: (cs ?? []) as InboundCommentRow[],
  };
}

export async function fetchUnreadCount(role: 'user' | 'admin'): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('inbound_requests')
    .select('id,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at');
  if (error || !data) return 0;
  const rows = data as Array<{
    last_comment_at: string | null;
    last_comment_by_role: 'user' | 'admin' | null;
    user_last_read_at: string | null;
    admin_last_read_at: string | null;
  }>;
  return rows.filter((r) => {
    if (!r.last_comment_at) return false;
    if (role === 'user') {
      return (
        r.last_comment_by_role === 'admin' &&
        (!r.user_last_read_at || r.last_comment_at > r.user_last_read_at)
      );
    } else {
      return (
        r.last_comment_by_role === 'user' &&
        (!r.admin_last_read_at || r.last_comment_at > r.admin_last_read_at)
      );
    }
  }).length;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/inbound/queries.ts
git commit -m "feat(inbound): add server queries for list/detail/unread"
```

---

## Task 8: Server actions

**Files:**
- Create: `lib/actions/inbound-request.ts`

- [ ] **Step 1: Implement actions**

Create `lib/actions/inbound-request.ts`:

```ts
'use server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import {
  callRpc,
  mutationTable,
  revalidatePaths,
  formatZodError,
  type ActionResult,
} from '@/lib/actions/_shared';
import {
  inboundRequestCreateSchema,
  inboundCommentSchema,
} from '@/lib/schemas';
import { COMMENT_EDIT_WINDOW_MS } from '@/lib/inbound/permissions';

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;
const ALLOWED_EXCEL_EXT = ['.xlsx'];
const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const OOXML_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function nanoid(): string {
  return randomBytes(8).toString('hex');
}

function lower(s: string) {
  return s.toLowerCase();
}

function safeFilename(name: string) {
  return name.replace(/[^\w가-힣\.\-]+/g, '_');
}

export type SubmitResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

export async function submitInboundRequestAction(fd: FormData): Promise<SubmitResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = inboundRequestCreateSchema.safeParse({
    title: String(fd.get('title') ?? ''),
    body: String(fd.get('body') ?? ''),
  });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const excel = fd.get('excel');
  if (!(excel instanceof File) || excel.size === 0) {
    return { ok: false, error: '엑셀 파일을 첨부해주세요.' };
  }
  if (excel.size > MAX_EXCEL_BYTES) {
    return { ok: false, error: '엑셀은 5MB 이하여야 합니다.' };
  }
  if (!ALLOWED_EXCEL_EXT.some((ext) => lower(excel.name).endsWith(ext))) {
    return { ok: false, error: '.xlsx 만 첨부할 수 있습니다.' };
  }
  const excelBuf = Buffer.from(await excel.arrayBuffer());
  if (excelBuf.length < 4 || !excelBuf.subarray(0, 4).equals(OOXML_MAGIC)) {
    return { ok: false, error: '엑셀(.xlsx) 형식이 아닙니다.' };
  }

  const images: File[] = [];
  for (let i = 0; i < MAX_IMAGES; i++) {
    const f = fd.get(`image${i}`);
    if (f instanceof File && f.size > 0) images.push(f);
  }
  if (images.length > MAX_IMAGES) {
    return { ok: false, error: `이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.` };
  }
  for (const img of images) {
    if (img.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: '이미지는 장당 5MB 이하여야 합니다.' };
    }
    if (!ALLOWED_IMAGE_EXT.some((ext) => lower(img.name).endsWith(ext))) {
      return { ok: false, error: '이미지는 jpg/png/webp 만 가능합니다.' };
    }
  }

  // Upload files under temporary folder, then we rename after row insert.
  const tmp = `_pending_${nanoid()}`;
  const excelPath = `${u.user.id}/${tmp}/excel/${safeFilename(excel.name)}`;
  const { error: exUpErr } = await supabase.storage
    .from('inbound-requests')
    .upload(excelPath, excelBuf, { contentType: excel.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false });
  if (exUpErr) return { ok: false, error: `엑셀 업로드 실패: ${exUpErr.message}` };

  const imagePaths: string[] = [];
  for (const img of images) {
    const imgPath = `${u.user.id}/${tmp}/images/${nanoid()}-${safeFilename(img.name)}`;
    const buf = Buffer.from(await img.arrayBuffer());
    const { error: imgErr } = await supabase.storage
      .from('inbound-requests')
      .upload(imgPath, buf, { contentType: img.type || 'image/jpeg', upsert: false });
    if (imgErr) {
      // partial-upload cleanup attempt (best effort)
      await supabase.storage.from('inbound-requests').remove([excelPath, ...imagePaths]);
      return { ok: false, error: `이미지 업로드 실패: ${imgErr.message}` };
    }
    imagePaths.push(imgPath);
  }

  const { data: row, error: insErr } = await mutationTable(supabase, 'inbound_requests')
    .insert({
      user_id: u.user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      status: 'open',
      excel_storage_path: excelPath,
      excel_original_name: excel.name,
      image_paths: imagePaths,
    })
    .select('id')
    .single();
  if (insErr || !row) {
    await supabase.storage.from('inbound-requests').remove([excelPath, ...imagePaths]);
    return { ok: false, error: `저장 실패: ${insErr?.message ?? 'unknown'}` };
  }

  revalidatePaths([
    '/inbound-requests',
    '/admin/inbound-requests',
  ]);
  return { ok: true, requestId: row.id as string };
}

export async function cancelInboundRequestAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'cancel_inbound_request', { request_id: requestId });
  if (error) {
    if (error.message.includes('NOT_CANCELLABLE')) return { ok: false, error: '취소할 수 없는 상태입니다.' };
    if (error.message.includes('ALREADY_CLOSED')) return { ok: false, error: '이미 종결된 요청입니다.' };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: '권한이 없습니다.' };
    if (error.message.includes('NOT_FOUND')) return { ok: false, error: '요청을 찾을 수 없습니다.' };
    console.error('[inbound] cancel', { requestId, error });
    return { ok: false, error: '취소 처리에 실패했습니다.' };
  }
  revalidatePaths(['/inbound-requests', `/inbound-requests/${requestId}`, '/admin/inbound-requests', `/admin/inbound-requests/${requestId}`]);
  return { ok: true };
}

export async function setInboundStatusAction(
  requestId: string,
  newStatus: 'in_progress' | 'completed' | 'cancelled',
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'set_inbound_status', {
    request_id: requestId,
    new_status: newStatus,
  });
  if (error) {
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: '관리자만 변경할 수 있습니다.' };
    if (error.message.includes('INVALID_TRANSITION')) return { ok: false, error: '허용되지 않은 상태 전이입니다.' };
    if (error.message.includes('NOT_FOUND')) return { ok: false, error: '요청을 찾을 수 없습니다.' };
    console.error('[inbound] setStatus', { requestId, newStatus, error });
    return { ok: false, error: '상태 변경에 실패했습니다.' };
  }
  revalidatePaths([
    `/admin/inbound-requests/${requestId}`,
    `/inbound-requests/${requestId}`,
    '/admin/inbound-requests',
    '/inbound-requests',
  ]);
  return { ok: true };
}

export async function markInboundReadAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'mark_inbound_read', { request_id: requestId });
  if (error) {
    console.error('[inbound] markRead', { requestId, error });
    return { ok: false, error: '읽음 처리에 실패했습니다.' };
  }
  return { ok: true };
}

export async function addInboundCommentAction(
  requestId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = createClient();
  const parsed = inboundCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const { data, error } = await callRpc(supabase, 'add_inbound_comment', {
    request_id: requestId,
    body: parsed.data.body,
  });
  if (error) {
    if (error.message.includes('LOCKED')) return { ok: false, error: '이미 종결되어 댓글을 작성할 수 없습니다.' };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: '권한이 없습니다.' };
    if (error.message.includes('INACTIVE')) return { ok: false, error: '계정이 활성 상태가 아닙니다.' };
    if (error.message.includes('INVALID_BODY')) return { ok: false, error: '댓글 내용을 확인해주세요.' };
    if (error.message.includes('NOT_FOUND')) return { ok: false, error: '요청을 찾을 수 없습니다.' };
    console.error('[inbound] addComment', { requestId, error });
    return { ok: false, error: '댓글 작성에 실패했습니다.' };
  }
  revalidatePaths([
    `/inbound-requests/${requestId}`,
    `/admin/inbound-requests/${requestId}`,
  ]);
  return { ok: true, id: data as string };
}

export async function updateInboundCommentAction(
  commentId: string,
  body: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = inboundCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  // Fetch current comment to enforce 10-min edit window for non-admin authors.
  const { data: row } = await supabase
    .from('inbound_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle();
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', u.user.id)
    .single<{ role: 'user' | 'admin' }>();
  const isAdmin = prof?.role === 'admin';
  const isAuthor = row.author_id === u.user.id;
  if (!isAdmin && !isAuthor) return { ok: false, error: '권한이 없습니다.' };
  if (!isAdmin) {
    const ageMs = Date.now() - new Date(row.created_at as string).getTime();
    if (ageMs >= COMMENT_EDIT_WINDOW_MS) {
      return { ok: false, error: '댓글 수정 가능 시간이 지났습니다 (10분).' };
    }
  }

  const { error } = await mutationTable(supabase, 'inbound_request_comments')
    .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) {
    console.error('[inbound] updateComment', { commentId, error });
    return { ok: false, error: '댓글 수정에 실패했습니다.' };
  }
  revalidatePaths([`/inbound-requests/${row.request_id}`, `/admin/inbound-requests/${row.request_id}`]);
  return { ok: true };
}

export async function deleteInboundCommentAction(commentId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const { data: row } = await supabase
    .from('inbound_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle();
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', u.user.id)
    .single<{ role: 'user' | 'admin' }>();
  const isAdmin = prof?.role === 'admin';
  const isAuthor = row.author_id === u.user.id;
  if (!isAdmin && !isAuthor) return { ok: false, error: '권한이 없습니다.' };
  if (!isAdmin) {
    const ageMs = Date.now() - new Date(row.created_at as string).getTime();
    if (ageMs >= COMMENT_EDIT_WINDOW_MS) {
      return { ok: false, error: '댓글 삭제 가능 시간이 지났습니다 (10분).' };
    }
  }

  const { error } = await mutationTable(supabase, 'inbound_request_comments')
    .delete()
    .eq('id', commentId);
  if (error) {
    console.error('[inbound] deleteComment', { commentId, error });
    return { ok: false, error: '댓글 삭제에 실패했습니다.' };
  }
  revalidatePaths([`/inbound-requests/${row.request_id}`, `/admin/inbound-requests/${row.request_id}`]);
  return { ok: true };
}

export type AttachmentUrlResult = { ok: true; url: string } | { ok: false; error: string };

export async function getInboundAttachmentUrlAction(
  requestId: string,
  path: string,
): Promise<AttachmentUrlResult> {
  const supabase = createClient();
  // Authorize: verify the path is referenced by a request the caller can read (RLS handles this).
  const { data: req } = await supabase
    .from('inbound_requests')
    .select('id, excel_storage_path, image_paths')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: '요청을 찾을 수 없습니다.' };
  const allowed =
    req.excel_storage_path === path ||
    (Array.isArray((req as any).image_paths) && (req as any).image_paths.includes(path));
  if (!allowed) return { ok: false, error: '잘못된 첨부 경로입니다.' };

  const { data, error } = await supabase.storage
    .from('inbound-requests')
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? '서명 URL 생성 실패' };
  }
  return { ok: true, url: data.signedUrl };
}

export async function deleteInboundRequestAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  // Fetch storage paths before delete so we can clean up after.
  const { data: row } = await supabase
    .from('inbound_requests')
    .select('excel_storage_path, image_paths')
    .eq('id', requestId)
    .maybeSingle();

  const { error } = await mutationTable(supabase, 'inbound_requests')
    .delete()
    .eq('id', requestId);
  if (error) {
    console.error('[inbound] delete', { requestId, error });
    return { ok: false, error: '삭제할 수 없는 상태이거나 권한이 없습니다.' };
  }

  if (row) {
    const paths: string[] = [
      (row as any).excel_storage_path,
      ...(((row as any).image_paths as string[] | null) ?? []),
    ].filter(Boolean) as string[];
    if (paths.length > 0) {
      await supabase.storage.from('inbound-requests').remove(paths);
    }
  }
  revalidatePaths(['/inbound-requests', '/admin/inbound-requests']);
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/inbound-request.ts
git commit -m "feat(inbound): server actions for submit/cancel/comment/status"
```

---

## Task 9: Attachment list component

**Files:**
- Create: `components/inbound/InboundAttachmentList.tsx`

- [ ] **Step 1: Implement**

Create `components/inbound/InboundAttachmentList.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { FileSpreadsheet, ImageIcon } from 'lucide-react';

type Props = {
  requestId: string;
  excelPath: string;
  excelOriginalName: string;
  imagePaths: string[];
};

async function sign(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage
    .from('inbound-requests')
    .createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}

export async function InboundAttachmentList({
  excelPath,
  excelOriginalName,
  imagePaths,
}: Props) {
  const [excelUrl, ...imageUrls] = await Promise.all([
    sign(excelPath),
    ...imagePaths.map((p) => sign(p)),
  ]);

  return (
    <div className="space-y-3">
      <a
        href={excelUrl ?? '#'}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-2 h-9 px-3 rounded-md border bg-background text-sm hover:bg-muted transition-colors"
      >
        <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />
        <span className="truncate max-w-[280px]">{excelOriginalName}</span>
      </a>
      {imagePaths.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 max-w-md">
          {imageUrls.map((url, i) =>
            url ? (
              <li key={imagePaths[i]} className="aspect-square rounded-md overflow-hidden border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={url} target="_blank" rel="noopener">
                  <img src={url} alt={`첨부 이미지 ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              </li>
            ) : (
              <li
                key={`missing-${i}`}
                className="aspect-square rounded-md border grid place-items-center text-muted-foreground"
              >
                <ImageIcon className="h-5 w-5" aria-hidden />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/inbound/InboundAttachmentList.tsx
git commit -m "feat(inbound): attachment list with signed URLs"
```

---

## Task 10: Comment list (server)

**Files:**
- Create: `components/inbound/InboundCommentList.tsx`

- [ ] **Step 1: Implement**

Create `components/inbound/InboundCommentList.tsx`:

```tsx
import { Shield, User as UserIcon } from 'lucide-react';
import { formatShortDateTimeKR } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { InboundCommentRow } from '@/lib/inbound/queries';
import { CommentRowActions } from './InboundCommentForm';

type Props = {
  comments: InboundCommentRow[];
  currentUserId: string;
  isAdmin: boolean;
};

export function InboundCommentList({ comments, currentUserId, isAdmin }: Props) {
  if (comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">아직 댓글이 없습니다.</p>
    );
  }
  return (
    <ul className="space-y-4">
      {comments.map((c) => {
        const isAuthor = c.author_id === currentUserId;
        const isAdminAuthor = c.author_role === 'admin';
        return (
          <li key={c.id} className="flex gap-3">
            <span
              className={cn(
                'h-7 w-7 rounded-full grid place-items-center shrink-0 mt-0.5',
                isAdminAuthor ? 'bg-accent/15 text-accent' : 'bg-muted text-foreground',
              )}
              aria-hidden
            >
              {isAdminAuthor ? <Shield className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {isAdminAuthor ? '관리자' : '작성자'}
                </span>
                <span>{formatShortDateTimeKR(c.created_at)}</span>
                {c.updated_at !== c.created_at && <span>(수정됨)</span>}
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap">{c.body}</p>
              <CommentRowActions
                commentId={c.id}
                createdAt={c.created_at}
                isAuthor={isAuthor}
                isAdmin={isAdmin}
                body={c.body}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: will fail because `CommentRowActions` and `InboundCommentForm` not yet created. That's the next task.

> Do not commit yet — depends on Task 11.

---

## Task 11: Comment form + row actions (client)

**Files:**
- Create: `components/inbound/InboundCommentForm.tsx`

- [ ] **Step 1: Implement form and per-row edit/delete actions**

Create `components/inbound/InboundCommentForm.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  addInboundCommentAction,
  updateInboundCommentAction,
  deleteInboundCommentAction,
} from '@/lib/actions/inbound-request';
import { COMMENT_EDIT_WINDOW_MS } from '@/lib/inbound/permissions';

export function InboundCommentForm({
  requestId,
  disabled,
  disabledReason,
}: {
  requestId: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  if (disabled) {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        {disabledReason ?? '댓글을 작성할 수 없습니다.'}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = body.trim();
        if (!trimmed) return;
        start(async () => {
          setError(null);
          const r = await addInboundCommentAction(requestId, trimmed);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setBody('');
          toast({ title: '댓글이 등록되었습니다.' });
          router.refresh();
        });
      }}
      className="space-y-2"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="댓글 입력 (최대 2000자)"
        className="w-full rounded-md border bg-background p-3 text-sm resize-y"
        aria-label="댓글 입력"
      />
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || body.trim().length === 0}>
          {pending ? '등록 중…' : '댓글 등록'}
        </Button>
      </div>
    </form>
  );
}

export function CommentRowActions({
  commentId,
  createdAt,
  isAuthor,
  isAdmin,
  body,
}: {
  commentId: string;
  createdAt: string;
  isAuthor: boolean;
  isAdmin: boolean;
  body: string;
}) {
  // All hooks must run on every render (rules-of-hooks). Compute `editable` after hooks.
  const created = useMemo(() => new Date(createdAt).getTime(), [createdAt]);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) return; // admin always edits
    if (!isAuthor) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [isAdmin, isAuthor]);

  const editable = isAdmin || (isAuthor && now - created < COMMENT_EDIT_WINDOW_MS);
  if (!editable) return null;

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-md border bg-background p-2 text-sm resize-y"
          aria-label="댓글 수정"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || draft.trim().length === 0}
            onClick={() =>
              start(async () => {
                const r = await updateInboundCommentAction(commentId, draft.trim());
                if (!r.ok) {
                  toast({ title: '수정 실패', description: r.error, variant: 'destructive' });
                  return;
                }
                setEditing(false);
                toast({ title: '수정되었습니다.' });
                router.refresh();
              })
            }
          >
            저장
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(body); }}>
            취소
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
      <button
        type="button"
        className="hover:underline"
        onClick={() => setEditing(true)}
      >
        수정
      </button>
      <button
        type="button"
        className="hover:underline text-destructive"
        onClick={() =>
          start(async () => {
            if (!confirm('이 댓글을 삭제할까요?')) return;
            const r = await deleteInboundCommentAction(commentId);
            if (!r.ok) {
              toast({ title: '삭제 실패', description: r.error, variant: 'destructive' });
              return;
            }
            toast({ title: '삭제되었습니다.' });
            router.refresh();
          })
        }
      >
        삭제
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean (Task 10's import now resolves).

- [ ] **Step 3: Commit (Task 10 + 11 together)**

```bash
git add components/inbound/InboundCommentList.tsx components/inbound/InboundCommentForm.tsx
git commit -m "feat(inbound): comment list (server) + form & row actions (client)"
```

---

## Task 12: Unread badge (client + Realtime)

**Files:**
- Create: `components/inbound/InboundUnreadBadge.tsx`

- [ ] **Step 1: Implement**

Create `components/inbound/InboundUnreadBadge.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';

type Role = 'user' | 'admin';

export function InboundUnreadBadge({
  role,
  initial,
  className,
}: {
  role: Role;
  initial: number;
  className?: string;
}) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      const { data } = await supabase
        .from('inbound_requests')
        .select(
          'id,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at',
        );
      if (cancelled || !data) return;
      const rows = data as Array<{
        last_comment_at: string | null;
        last_comment_by_role: 'user' | 'admin' | null;
        user_last_read_at: string | null;
        admin_last_read_at: string | null;
      }>;
      const next = rows.filter((r) => {
        if (!r.last_comment_at) return false;
        if (role === 'user') {
          return (
            r.last_comment_by_role === 'admin' &&
            (!r.user_last_read_at || r.last_comment_at > r.user_last_read_at)
          );
        }
        return (
          r.last_comment_by_role === 'user' &&
          (!r.admin_last_read_at || r.last_comment_at > r.admin_last_read_at)
        );
      }).length;
      setCount(next);
    }

    const channel = supabase
      .channel(`inbound-unread-${role}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbound_requests' },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbound_request_comments' },
        () => refresh(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [role]);

  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground',
        className,
      )}
      aria-label={`읽지 않음 ${count}건`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/inbound/InboundUnreadBadge.tsx
git commit -m "feat(inbound): realtime unread badge for nav"
```

---

## Task 13: User list page + Excel template card

**Files:**
- Create: `app/(user)/inbound-requests/page.tsx`

- [ ] **Step 1: Implement**

Create `app/(user)/inbound-requests/page.tsx`:

```tsx
import Link from 'next/link';
import { Download, FileSpreadsheet, Inbox, PlusCircle } from 'lucide-react';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchMyInboundRequests } from '@/lib/inbound/queries';
import { InboundStatusBadge } from '@/components/StatusBadge';
import type { InboundStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function InboundRequestsPage() {
  const rows = await fetchMyInboundRequests(50);

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">입고리스트</h1>
        <p className="text-sm text-muted-foreground mt-1">
          입고 요청을 비공개로 등록하고, 진행상황을 관리자와 댓글로 주고받으세요.
        </p>
      </header>

      <section className="rounded-lg border bg-surface-muted/40 p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-background grid place-items-center border shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">엑셀 양식 다운로드</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            입고리스트 양식에 품목·수량을 채워 업로드해주세요.
          </p>
        </div>
        <a
          href="/inbound-template.xlsx"
          download
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border bg-background text-sm hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          양식 받기
        </a>
      </section>

      <div className="flex justify-between items-center">
        <h2 className="font-heading font-semibold text-lg">내 입고요청</h2>
        <Link
          href="/inbound-requests/new"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
        >
          <PlusCircle className="h-3.5 w-3.5" aria-hidden />
          새 입고요청
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-medium">등록된 입고요청이 없습니다</p>
        </div>
      ) : (
        <ul className="rounded-lg border bg-card divide-y">
          {rows.map((r) => {
            const unread =
              r.last_comment_at &&
              r.last_comment_by_role === 'admin' &&
              (!r.user_last_read_at || r.last_comment_at > r.user_last_read_at);
            return (
              <li key={r.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/inbound-requests/${r.id}`}
                    className="text-sm font-medium hover:underline truncate"
                  >
                    {r.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatShortDateTimeKR(r.created_at)}
                    {r.last_comment_at && (
                      <>
                        {' · '}최근 댓글 {formatShortDateTimeKR(r.last_comment_at)}
                      </>
                    )}
                  </p>
                </div>
                {unread && (
                  <span className="text-[11px] text-destructive font-medium">새 답변</span>
                )}
                <InboundStatusBadge status={r.status as InboundStatus} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(user)/inbound-requests/page.tsx"
git commit -m "feat(inbound): user list page with template card"
```

---

## Task 14: User new-request page + client form

**Files:**
- Create: `app/(user)/inbound-requests/new/page.tsx`
- Create: `app/(user)/inbound-requests/new/NewRequestForm.tsx`

- [ ] **Step 1: Server shell**

Create `app/(user)/inbound-requests/new/page.tsx`:

```tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewRequestForm } from './NewRequestForm';

export const dynamic = 'force-dynamic';

export default function NewInboundRequestPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <header className="pb-4 border-b">
        <Link
          href="/inbound-requests"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 입고리스트
        </Link>
        <h1 className="font-heading font-semibold text-2xl tracking-tight mt-2">
          새 입고요청
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          엑셀 양식과 (선택) 이미지를 첨부해주세요. 등록 후 비공개 게시글로 보관됩니다.
        </p>
      </header>
      <NewRequestForm />
    </div>
  );
}
```

- [ ] **Step 2: Client form**

Create `app/(user)/inbound-requests/new/NewRequestForm.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { submitInboundRequestAction } from '@/lib/actions/inbound-request';

const MAX_IMAGES = 3;

export function NewRequestForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [excel, setExcel] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!title.trim()) { setError('제목을 입력해주세요'); return; }
        if (!excel) { setError('엑셀 파일을 첨부해주세요'); return; }
        if (images.length > MAX_IMAGES) {
          setError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다`); return;
        }
        start(async () => {
          const fd = new FormData();
          fd.append('title', title.trim());
          fd.append('body', body);
          fd.append('excel', excel);
          images.forEach((img, i) => fd.append(`image${i}`, img));
          const r = await submitInboundRequestAction(fd);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          toast({ title: '입고요청이 등록되었습니다.' });
          router.push(`/inbound-requests/${r.requestId}`);
          router.refresh();
        });
      }}
      className="rounded-lg border bg-card p-5 space-y-4"
    >
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium">제목 *</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="body" className="text-sm font-medium">본문 (선택)</label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={5}
          className="w-full rounded-md border bg-background p-3 text-sm resize-y"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="excel" className="text-sm font-medium">엑셀 양식 (.xlsx, 최대 5MB) *</label>
        <input
          id="excel"
          type="file"
          accept=".xlsx"
          onChange={(e) => setExcel(e.target.files?.[0] ?? null)}
          className="block w-full text-sm border rounded-md p-2"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="images" className="text-sm font-medium">
          이미지 (선택, 최대 {MAX_IMAGES}장, jpg/png/webp, 각 5MB)
        </label>
        <input
          id="images"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES);
            setImages(list);
          }}
          className="block w-full text-sm border rounded-md p-2"
        />
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? '등록 중…' : '등록'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(user)/inbound-requests/new/page.tsx" "app/(user)/inbound-requests/new/NewRequestForm.tsx"
git commit -m "feat(inbound): user new-request page + client form"
```

---

## Task 15: User detail page

**Files:**
- Create: `app/(user)/inbound-requests/[id]/page.tsx`

- [ ] **Step 1: Implement**

Create `app/(user)/inbound-requests/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fetchInboundRequest } from '@/lib/inbound/queries';
import { InboundStatusBadge } from '@/components/StatusBadge';
import { InboundAttachmentList } from '@/components/inbound/InboundAttachmentList';
import { InboundCommentList } from '@/components/inbound/InboundCommentList';
import { InboundCommentForm } from '@/components/inbound/InboundCommentForm';
import { CancelInboundButton } from './CancelInboundButton';
import { formatShortDateTimeKR } from '@/lib/dates';
import { isLocked } from '@/lib/inbound/permissions';
import { markInboundReadAction } from '@/lib/actions/inbound-request';
import type { InboundStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function InboundRequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) notFound();

  const { request, comments } = await fetchInboundRequest(params.id);
  if (!request) notFound();

  // Mark as read on view (fire-and-forget)
  await markInboundReadAction(request.id);

  const status = request.status as InboundStatus;
  const locked = isLocked(status);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-start justify-between gap-3 pb-4 border-b">
        <div className="flex-1 min-w-0">
          <Link
            href="/inbound-requests"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 입고리스트
          </Link>
          <div className="flex items-center gap-2 mt-2">
            <InboundStatusBadge status={status} />
            <h1 className="font-heading font-semibold text-xl tracking-tight truncate">
              {request.title}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            작성 {formatShortDateTimeKR(request.created_at)}
          </p>
        </div>
        {status === 'open' && <CancelInboundButton requestId={request.id} />}
      </header>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        {request.body && (
          <p className="text-sm whitespace-pre-wrap">{request.body}</p>
        )}
        <InboundAttachmentList
          requestId={request.id}
          excelPath={request.excel_storage_path}
          excelOriginalName={request.excel_original_name}
          imagePaths={request.image_paths}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">댓글</h2>
        <InboundCommentList
          comments={comments}
          currentUserId={u.user.id}
          isAdmin={false}
        />
        <InboundCommentForm
          requestId={request.id}
          disabled={locked}
          disabledReason={
            status === 'completed'
              ? '완료된 요청이라 댓글을 작성할 수 없습니다.'
              : status === 'cancelled'
              ? '취소된 요청이라 댓글을 작성할 수 없습니다.'
              : undefined
          }
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Cancel button (client)**

Create `app/(user)/inbound-requests/[id]/CancelInboundButton.tsx`:

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cancelInboundRequestAction } from '@/lib/actions/inbound-request';

export function CancelInboundButton({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!confirm('이 입고요청을 취소할까요?')) return;
          const r = await cancelInboundRequestAction(requestId);
          if (!r.ok) {
            toast({ title: '취소 실패', description: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: '취소되었습니다.' });
          router.refresh();
        })
      }
    >
      {pending ? '처리 중…' : '취소'}
    </Button>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(user)/inbound-requests/[id]/page.tsx" "app/(user)/inbound-requests/[id]/CancelInboundButton.tsx"
git commit -m "feat(inbound): user detail page with cancel button"
```

---

## Task 16: Admin list page

**Files:**
- Create: `app/(admin)/admin/inbound-requests/page.tsx`

- [ ] **Step 1: Implement**

Create `app/(admin)/admin/inbound-requests/page.tsx`:

```tsx
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { fetchAllInboundRequests } from '@/lib/inbound/queries';
import { InboundStatusBadge } from '@/components/StatusBadge';
import { formatShortDateTimeKR } from '@/lib/dates';
import type { InboundStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TABS: { value: InboundStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'open', label: '접수' },
  { value: 'in_progress', label: '진행중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
];

export default async function AdminInboundRequestsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const raw = searchParams.status;
  const status =
    raw && TABS.some((t) => t.value === raw) ? (raw as InboundStatus | 'all') : 'all';
  const rows = await fetchAllInboundRequests(status as any, 200);

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">입고리스트</h1>
        <p className="text-sm text-muted-foreground mt-1">
          고객이 등록한 입고요청을 비공개로 검토하고 댓글로 회신합니다.
        </p>
      </header>

      <nav className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === 'all' ? '/admin/inbound-requests' : `/admin/inbound-requests?status=${t.value}`}
            className={cn(
              'px-3 h-9 inline-flex items-center text-sm border-b-2 transition-colors',
              status === t.value
                ? 'border-foreground text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-medium">입고요청이 없습니다</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 h-10 font-medium">상태</th>
                <th className="text-left px-3 h-10 font-medium">제목</th>
                <th className="text-left px-3 h-10 font-medium">작성자</th>
                <th className="text-left px-3 h-10 font-medium">최근 활동</th>
                <th className="text-left px-3 h-10 font-medium">작성일</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const unread =
                  r.last_comment_at &&
                  r.last_comment_by_role === 'user' &&
                  (!r.admin_last_read_at || r.last_comment_at > r.admin_last_read_at);
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <InboundStatusBadge status={r.status as InboundStatus} />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/inbound-requests/${r.id}`}
                        className="hover:underline"
                      >
                        {r.title}
                      </Link>
                      {unread && (
                        <span className="ml-2 text-[11px] text-destructive font-medium">
                          새 답변
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.profile?.name ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.last_comment_at ? formatShortDateTimeKR(r.last_comment_at) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatShortDateTimeKR(r.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/admin/inbound-requests/page.tsx"
git commit -m "feat(inbound): admin list page with status tabs"
```

---

## Task 17: Admin detail page + status controls

**Files:**
- Create: `app/(admin)/admin/inbound-requests/[id]/page.tsx`
- Create: `app/(admin)/admin/inbound-requests/[id]/StatusControls.tsx`

- [ ] **Step 1: Server detail page**

Create `app/(admin)/admin/inbound-requests/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fetchInboundRequest } from '@/lib/inbound/queries';
import { InboundStatusBadge } from '@/components/StatusBadge';
import { InboundAttachmentList } from '@/components/inbound/InboundAttachmentList';
import { InboundCommentList } from '@/components/inbound/InboundCommentList';
import { InboundCommentForm } from '@/components/inbound/InboundCommentForm';
import { StatusControls } from './StatusControls';
import { formatShortDateTimeKR } from '@/lib/dates';
import { isLocked } from '@/lib/inbound/permissions';
import { markInboundReadAction } from '@/lib/actions/inbound-request';
import type { InboundStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminInboundRequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) notFound();

  const { request, comments } = await fetchInboundRequest(params.id);
  if (!request) notFound();

  // Author display info
  const { data: author } = await supabase
    .from('profiles')
    .select('name,email')
    .eq('id', request.user_id)
    .maybeSingle();

  await markInboundReadAction(request.id);
  const status = request.status as InboundStatus;
  const locked = isLocked(status);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-start justify-between gap-3 pb-4 border-b">
        <div className="flex-1 min-w-0">
          <Link
            href="/admin/inbound-requests"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 입고리스트
          </Link>
          <div className="flex items-center gap-2 mt-2">
            <InboundStatusBadge status={status} />
            <h1 className="font-heading font-semibold text-xl tracking-tight truncate">
              {request.title}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            작성자 {author?.name ?? '—'} ({author?.email ?? '—'}) · {formatShortDateTimeKR(request.created_at)}
          </p>
        </div>
        <StatusControls requestId={request.id} status={status} />
      </header>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        {request.body && (
          <p className="text-sm whitespace-pre-wrap">{request.body}</p>
        )}
        <InboundAttachmentList
          requestId={request.id}
          excelPath={request.excel_storage_path}
          excelOriginalName={request.excel_original_name}
          imagePaths={request.image_paths}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">댓글</h2>
        <InboundCommentList
          comments={comments}
          currentUserId={u.user.id}
          isAdmin
        />
        <InboundCommentForm
          requestId={request.id}
          disabled={locked}
          disabledReason={
            locked ? '종결된 요청에는 댓글을 작성할 수 없습니다.' : undefined
          }
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Status controls (client)**

Create `app/(admin)/admin/inbound-requests/[id]/StatusControls.tsx`:

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { setInboundStatusAction } from '@/lib/actions/inbound-request';
import type { InboundStatus } from '@/lib/types';

export function StatusControls({
  requestId,
  status,
}: {
  requestId: string;
  status: InboundStatus;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function go(next: 'in_progress' | 'completed' | 'cancelled', confirmText: string) {
    start(async () => {
      if (!confirm(confirmText)) return;
      const r = await setInboundStatusAction(requestId, next);
      if (!r.ok) {
        toast({ title: '변경 실패', description: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: '상태가 변경되었습니다.' });
      router.refresh();
    });
  }

  if (status === 'open') {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => go('in_progress', '진행중으로 변경할까요?')}>
          진행중으로
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('cancelled', '이 요청을 취소할까요?')}>
          취소
        </Button>
      </div>
    );
  }
  if (status === 'in_progress') {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => go('completed', '완료 처리할까요?')}>
          완료 처리
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('cancelled', '이 요청을 취소할까요?')}>
          취소
        </Button>
      </div>
    );
  }
  return <p className="text-xs text-muted-foreground">종결됨 — 추가 액션 없음</p>;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/inbound-requests/[id]/page.tsx" "app/(admin)/admin/inbound-requests/[id]/StatusControls.tsx"
git commit -m "feat(inbound): admin detail page with status controls"
```

---

## Task 18: Nav integration (user + admin)

**Files:**
- Modify: `components/NavUser.tsx`
- Modify: `components/AdminSidebar.tsx`
- Modify: `app/(user)/layout.tsx` (pass initial unread count)
- Modify: `app/(admin)/admin/layout.tsx` (pass initial unread count)

- [ ] **Step 1: NavUser additions**

In `components/NavUser.tsx`:

1. Add to the `import { ... } from 'lucide-react'` line: `Inbox`.
2. Add a new client-side import below the existing `import` block:
   ```tsx
   import { InboundUnreadBadge } from '@/components/inbound/InboundUnreadBadge';
   ```
3. Insert into the `NAV` array between `사입재고 배송대행` and `예치금`:
   ```tsx
   { href: '/inbound-requests', label: '입고리스트', Icon: Inbox },
   ```
4. Render the badge next to the `입고리스트` link only. Wrap the `<Link>` body with the badge:

   Replace the existing `<span>{label}</span>` line inside the NAV `.map((...))` with:
   ```tsx
   <span>{label}</span>
   {href === '/inbound-requests' && (
     <InboundUnreadBadge role="user" initial={inboundUnread} className="ml-1" />
   )}
   ```
5. Update the `NavUser` props to accept `inboundUnread: number` and read it in both the desktop and mobile nav renderers.

> Concrete diff is shown below. Replace the function signature and add the prop to the rendered iteration.

Open `components/NavUser.tsx` and apply:

```tsx
export function NavUser({
  balance,
  name,
  inboundUnread,
}: {
  balance: number;
  name: string;
  inboundUnread: number;
}) {
  // ... existing body unchanged except `<span>{label}</span>` blocks below
}
```

In both `.map(({ href, label, Icon, exact }) => ...)` blocks (desktop nav at line ~42 and mobile bottom strip at line ~122), replace the inner `<span>{label}</span>` with:

```tsx
<span className="inline-flex items-center gap-1">
  {label}
  {href === '/inbound-requests' && (
    <InboundUnreadBadge role="user" initial={inboundUnread} />
  )}
</span>
```

- [ ] **Step 2: User layout passes count**

Modify `app/(user)/layout.tsx`:
- After fetching `profile`, also call `fetchUnreadCount('user')`:

```tsx
import { fetchUnreadCount } from '@/lib/inbound/queries';
// ...
const inboundUnread = await fetchUnreadCount('user');
// ...
<NavUser balance={Number(profile.deposit_balance)} name={profile.name} inboundUnread={inboundUnread} />
```

- [ ] **Step 3: AdminSidebar additions**

In `components/AdminSidebar.tsx`:

1. Add `Inbox` to the `lucide-react` import block.
2. Add client import:
   ```tsx
   import { InboundUnreadBadge } from '@/components/inbound/InboundUnreadBadge';
   ```
3. Insert into `NAV` array right after the line for `사입재고 배송대행`:
   ```tsx
   { href: '/admin/inbound-requests', label: '입고리스트', Icon: Inbox },
   ```
4. Update the function signature to accept `inboundUnread: number` and render the badge in the `입고리스트` link's `<span>`:

```tsx
export function AdminSidebar({ inboundUnread }: { inboundUnread: number }) {
  // ...
  <span className="inline-flex items-center gap-1">
    {label}
    {href === '/admin/inbound-requests' && (
      <InboundUnreadBadge role="admin" initial={inboundUnread} />
    )}
  </span>
}
```

- [ ] **Step 4: Admin layout passes count**

Modify `app/(admin)/admin/layout.tsx` (read it first to see exact structure; expect a server component that renders `<AdminSidebar />`). Wrap the existing sidebar instantiation:

```tsx
import { fetchUnreadCount } from '@/lib/inbound/queries';
const inboundUnread = await fetchUnreadCount('admin');
// ...
<AdminSidebar inboundUnread={inboundUnread} />
```

> If `AdminSidebar` is rendered in more than one layout location, update every call site.

- [ ] **Step 5: Typecheck + build**

Run: `pnpm typecheck && pnpm build 2>&1 | tail -40`
Expected: typecheck clean, build succeeds (App Router page outputs include new routes).

- [ ] **Step 6: Commit**

```bash
git add components/NavUser.tsx components/AdminSidebar.tsx "app/(user)/layout.tsx" "app/(admin)/admin/layout.tsx"
git commit -m "feat(inbound): nav integration + unread badges"
```

---

## Task 19: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm typecheck 2>&1 | tail -3 && pnpm test 2>&1 | tail -5`
Expected: typecheck clean; all unit tests pass (3 new test files + existing tests).

- [ ] **Step 2: Run lint**

Run: `pnpm lint 2>&1 | tail -20`
Expected: clean (no new warnings or errors from inbound files).

- [ ] **Step 3: Production build**

Run: `pnpm build 2>&1 | tail -40`
Expected: build succeeds, new routes show up in the route table:
- `/inbound-requests`
- `/inbound-requests/new`
- `/inbound-requests/[id]`
- `/admin/inbound-requests`
- `/admin/inbound-requests/[id]`

- [ ] **Step 4: Manual regression checklist (record in PR description)**

Start dev server (`pnpm dev`), and walk through each manually:

1. As an active user, click `입고리스트` in top nav → list page renders with template card.
2. Click `양식 받기` → downloads `inbound-template.xlsx`.
3. Click `새 입고요청` → fill title, body, attach xlsx + 2 images → 등록 → redirect to detail.
4. Verify the detail page shows attachments and signed image previews; xlsx download link works.
5. Sign in as admin in a separate browser → `/admin/inbound-requests` shows the new row in `접수` tab.
6. Admin: `진행중으로` → status badge updates on both sides; user nav shows no new badge (admin's comment hasn't been posted yet).
7. Admin: post a comment → user nav shows `1` badge.
8. User opens detail → badge clears (Realtime auto-update).
9. User posts reply within 10 minutes → user can edit/delete their comment.
10. Wait 10+ minutes (or simulate by changing system clock / DB timestamp); reload → edit/delete buttons disappear.
11. Admin: `완료 처리` → both sides see `완료` badge, comment input becomes a locked message.
12. As a second normal user, navigate directly to the first user's `/inbound-requests/<id>` → 404.
13. Reload list page after the 60-second signed-URL window expires (just stay on the detail page > 60s without refresh, then click the image link) → image link returns a 400; refresh the page → new URL works. (Acceptable behavior.)
14. Cancel (open status): user clicks `취소` on an open request → status goes to `cancelled`, comment input locked.
15. Verify the existing `배송대행` flows are unaffected (open list, attempt upload).

- [ ] **Step 5: Commit any small fixes from the regression pass**

```bash
git add -A
git commit -m "fix(inbound): regression fixes from manual QA pass"
```

(Skip if no fixes needed.)

- [ ] **Step 6: Push branch**

```bash
git push -u origin feature/입고리스트메뉴생성
```

---

## Self-Review Notes

- **Spec coverage:** Every spec section maps to one or more tasks above. Tasks 1–4 cover sections 3.1–3.5, 4.1–4.5. Tasks 5–12 cover sections 5.6–5.7 and 6. Tasks 13–17 cover sections 5.1–5.5. Task 18 wires up section 2 nav and the read-marker realtime in section 3.4. Task 19 covers section 8 testing.
- **Cleanup function**: Section 7.2 mentions `cleanup_orphan_inbound_pending` as out-of-range for scheduling. Migration in Task 4 intentionally omits it; if you want it for future use, add it as a follow-up task without scheduling, but it is not required for the feature to be complete.
- **Edit policy** in spec section 4.1 allows owner to edit `inbound_requests` while `status='open'`, but the UI does NOT expose an edit form for the title/body in this plan. If the user later wants in-place edit, add a `app/(user)/inbound-requests/[id]/edit/page.tsx` task. For now: title/body are write-once, cancel-and-recreate if needed.
- **Type consistency:** All helpers and components use `InboundStatus` from `lib/types.ts`. All RPC names match between migration (Task 4) and server actions (Task 8): `set_inbound_status`, `cancel_inbound_request`, `mark_inbound_read`, `add_inbound_comment`. Comment edit-window constant `COMMENT_EDIT_WINDOW_MS` is defined once in `lib/inbound/permissions.ts` and reused by both server action and client row actions.
