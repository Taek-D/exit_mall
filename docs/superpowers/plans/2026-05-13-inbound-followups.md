# 입고리스트 Follow-ups Implementation Plan

> **STATUS: pending approval** — Generated via /ralplan consensus. Awaiting user approval before any execution.

**Goal:** Close all medium/minor code-review findings from the 입고리스트 feature PR, without changing user-visible behavior. Strengthen rate-limit, storage path lifecycle, UI primitives, and RLS perf — all scoped to the inbound feature surface plus a tightly bounded project-wide guard.

**Architecture:** Additive migrations (rate-limit table + helper RPC, RLS policy rewrites for inbound tables only), pure code refactors (typed Supabase calls, column-scoped selects), UI primitive swaps (ConfirmDialog), and a storage rename step that is best-effort with logging. No data migration; no destructive changes.

**Tech Stack:** Next.js 14, Supabase (Postgres + RLS + Storage), TypeScript, Vitest. Existing primitives: `components/ConfirmDialog.tsx`, `useFormState`/`useFormStatus` from React.

**Branch:** `feature/inbound-followups` (new, branched from master after the predecessor PR merges).

**Predecessor**: `feature/입고리스트메뉴생성` already merged or pending.

---

## RALPLAN-DR Summary

### Principles
1. Each item is independently reviewable and revertible — split commits by concern.
2. Rate-limit enforced at DB layer (single source of truth) via a generic `rate_limit_check(action, limit, window)` helper.
3. UI polish reuses existing primitives (`ConfirmDialog`); no new dialog/modal components.
4. RLS `auth_rls_initplan` optimization scoped to inbound tables only — project-wide rollout is a separate concern.
5. Storage rename + orphan cleanup are best-effort; failures log but never block user-facing flows.

### Decision Drivers
1. Close all open M/Mn findings from the code review without expanding scope.
2. Preserve existing behavior — every change is additive or behavior-equivalent.
3. Keep PR diff small enough for a single human reviewer (~15 files, ~600 lines).

### Viable Options
| Option | Description | Pros | Cons |
|---|---|---|---|
| **A: One follow-up PR (recommended)** | All 11 items in one PR | Bundled review of related cleanup; easier to land before drift | Larger diff (~600 lines) |
| **B: Split into 2 PRs (DB/server + UI)** | First: rate-limit, rename, cleanup, RLS, queries. Second: ConfirmDialog, useFormState, signed URL UX, search | Smaller reviews; UI work parallelizable | More git overhead; UI PR blocked on DB landing if rate-limit affects UX |
| **C: Minor-only deferred** | Only do M-priority; defer Mn (3 polish items + signed URL UX) to ad-hoc fixes | Smaller PR | Polish drift; Mn items rot in backlog |

**Choice: A.** Items are small individually; one cohesive cleanup PR is operationally cheaper and the review burden is manageable.

### ADR — Architecture Decisions

| Decision | Rationale | Alternatives Considered | Consequences |
|---|---|---|---|
| **Single PR, ~6 commits** | Each commit isolates a concern; reviewer can scan diffs per topic | Multi-PR (Option B) | Larger PR but lower process overhead |
| **`rate_limit_check(action text, limit_count int, window_seconds int)` DB helper + amortized GC inside the function** | Single SQL function; opportunistic `delete ... where random() < 0.01` keeps table bounded without a scheduler | App-level rate limit (would require shared state); per-RPC duplicate counters (DRY); separate cron (extra infra) | Bounded table size; ~1% of calls pay the GC cost |
| **`submit_inbound_request_rpc` RPC + tightened `inbound_requests_self_insert` RLS** | RPC chokepoint enforces rate-limit; RLS policy requires `app.inbound_rpc=true` so direct insert is locked out — RPC stays the single source of truth | Precondition `check_rate_limit` + keep RLS-as-insert-gate (TOCTOU concern); leave RLS open (advisory rate-limit only) | Future direct `.insert()` callers fail RLS until they switch to the RPC; explicit migration note |
| **Storage rename via Supabase Storage `move` with **rollback on DB UPDATE failure** | Try-catch around `move + update`; on update fail, attempt `move` back to `_pending_*` path so the row's path stays valid | Two-phase commit (overengineered); leave update fire-and-forget (split-brain orphan) | Failure handling explicit; worst case = duplicate move attempt logged but no orphan |
| **RLS `(select auth.uid())` only for inbound tables** | Bounded scope; matches spec hardening intent; project-wide rollout is a separate decision | Full project sweep (out of scope) | Inbound tables benefit immediately; rest deferred |
| **`useConfirm()` hook for all 3 confirm sites** | The hook already exists in `components/ConfirmDialog.tsx`; aesthetic + a11y over native `confirm()` | Build a new component; keep native `confirm()` | Per-site `const { confirm, element } = useConfirm()` pattern repeats — acceptable for 3 sites |
| **Adapt `submitInboundRequestAction` signature to `(prevState, fd)` in place** | useFormState ignores extra args; one callsite (`NewRequestForm`); no dual API to maintain | Add sibling `submitInboundRequestFormAction` (duplicate code paths) | Existing callers unaffected; `prevState` is harmless boilerplate for non-form contexts |
| **Admin search via dedicated RPC `search_inbound_requests(p_q text, p_status text, p_limit int)`** | PostgREST `.or()` does not filter joined relations through embedded resource syntax — verified via Architect review | Client-side filter (loads too much); fragile `.or()` (broken) | One small RPC, server-side ILIKE on joined profiles, parameter binding eliminates injection risk |

### Follow-ups beyond this plan
- Project-wide `auth_rls_initplan` optimization (sweep across `profiles`, `orders`, `order_items`, `shipping_uploads`, etc.) — separate PR.
- Storage orphan cleanup scheduling (cron via Supabase Edge Function or external scheduler) — separate PR.
- Integration tests against Supabase local stack (`tests/integration/`) — separate PR per spec §8.2.

---

## Deploy Ordering (CRITICAL)

Task 2's migration `20260513000004_inbound_rate_limit.sql` tightens `inbound_requests_self_insert` to require `current_setting('app.inbound_rpc') = 'true'`. **Direct `.from('inbound_requests').insert()` calls will fail RLS after this migration applies.** The existing `submitInboundRequestAction` uses a direct insert.

To avoid a user-visible outage in the deploy window between migration apply and app deploy:

1. **Land the code change for Task 2 (Step 3 — `submitInboundRequestAction` calls the RPC) BEFORE applying migration `20260513000004`.**
2. CI/CD options:
   - Option A: Deploy app, then apply migration manually via `mcp__supabase__apply_migration` after deploy verification.
   - Option B: Split into two PRs — code-only PR first (still calls direct insert), then migration PR after merge+deploy.
3. The other migrations in this PR (`000003` helper, `000005` cleanup, `000007` search, `000008` RLS initplan) have no deploy-order dependency.

If applying all together: the migration `000004` will break submissions until the new app deploys. Acceptable only with a maintenance window or feature flag.

---

## File Structure

### Created files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260513000003_rate_limit_helper.sql` | `rate_limits` table + `rate_limit_check(action, limit_count, window_seconds)` RPC with amortized GC |
| `supabase/migrations/20260513000004_inbound_rate_limit.sql` | Wire `add_inbound_comment` to `rate_limit_check`; add `submit_inbound_request_rpc`; tighten `inbound_requests_self_insert` to require `app.inbound_rpc` flag |
| `supabase/migrations/20260513000005_inbound_pending_cleanup.sql` | `cleanup_orphan_inbound_pending(p_older_than interval)` admin-only RPC |
| `supabase/migrations/20260513000006_search_inbound_requests.sql` | `search_inbound_requests(p_q, p_status, p_limit)` RPC for admin search |
| `supabase/migrations/20260513000007_inbound_rls_initplan.sql` | Replace inbound RLS policies (except self_insert, already touched in Task 2) to use `(select auth.uid())` / `(select public.is_admin())` |

### Modified files

| Path | Change |
|---|---|
| `lib/actions/inbound-request.ts` | (1) Call `submit_inbound_request_rpc`; (2) storage rename `_pending_*` → `{request_id}` with rollback on DB update failure; (3) tighter `safeFilename`; (4) drop `(supabase.from as any)` at lines 222, 259, 300, 323 and any others now that db-types include inbound; (5) adapt `submitInboundRequestAction` signature to `(prevState, fd)` for useFormState |
| `lib/inbound/queries.ts` | (1) `fetchInboundRequest` replaces `select('*')` with explicit columns; (2) drop `as any` escape-hatches; (3) `fetchAllInboundRequests` calls new `search_inbound_requests` RPC |
| `components/inbound/InboundUnreadBadge.tsx` | Drop `as any` from `supabase.rpc('count_inbound_unread', ...)` |
| `components/inbound/InboundAttachmentList.tsx` | Failed signed-URL renders disabled state + alert message (no `href="#"`) |
| `app/(user)/inbound-requests/[id]/CancelInboundButton.tsx` | Replace `confirm()` with `useConfirm()` hook; move confirm logic outside `startTransition` |
| `app/(admin)/admin/inbound-requests/[id]/StatusControls.tsx` | Replace `confirm()` with `useConfirm()` hook; move confirm outside `startTransition` |
| `components/inbound/InboundCommentForm.tsx` | Replace `confirm()` in `CommentRowActions` delete with `useConfirm()` hook |
| `app/(user)/inbound-requests/new/NewRequestForm.tsx` | Convert to `useFormState`/`useFormStatus` per spec §5.2 |
| `app/(admin)/admin/inbound-requests/page.tsx` | Add `<input type="search" name="q">` inside `<form method="GET">` above the table |

---

## Task 1: Rate limit DB helper

**Files:**
- Create: `supabase/migrations/20260513000003_rate_limit_helper.sql`

- [ ] **Step 1: Write migration**

```sql
-- ============================================================================
-- 입고리스트 follow-up: generic per-user rate-limit
-- ============================================================================

create table public.rate_limits (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  occurred_at timestamptz not null default now()
);
-- bigserial PK avoids sub-microsecond duplicate-insert PK conflicts (e.g. quick double-submit).
create index rate_limits_user_action_idx
  on public.rate_limits (user_id, action, occurred_at desc);

alter table public.rate_limits enable row level security;

-- No app-level read/write; only RPCs touch this table.
-- Admin can audit if needed.
create policy rate_limits_admin_all on public.rate_limits
  for all using (public.is_admin()) with check (public.is_admin());

-- Idempotent helper: caller invokes once per action. Returns void on success,
-- raises 'RATE_LIMITED' if over the window quota.
create or replace function public.rate_limit_check(
  p_action text,
  p_limit int,
  p_window_seconds int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select count(*) into v_count
    from public.rate_limits
   where user_id = v_uid
     and action = p_action
     and occurred_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.rate_limits (user_id, action) values (v_uid, p_action);

  -- Amortized GC: 1% of calls clean rows older than 1 day. Keeps table bounded
  -- without a scheduler. Cheap because the index covers (user_id, action, occurred_at desc).
  if random() < 0.01 then
    delete from public.rate_limits where occurred_at < now() - interval '1 day';
  end if;
end; $$;

grant execute on function public.rate_limit_check(text, int, int) to authenticated;
```

- [ ] **Step 2: Apply migration** via `mcp__supabase__apply_migration` or local CLI.
- [ ] **Step 3: Commit** `feat(rate-limit): generic per-user rate-limit helper`

---

## Task 2: Inbound rate-limit wiring

**Files:**
- Create: `supabase/migrations/20260513000004_inbound_rate_limit.sql`
- Modify: `lib/actions/inbound-request.ts`

- [ ] **Step 1: Update `add_inbound_comment` to call rate_limit_check(20, 60 sec)**

```sql
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
  perform set_config('app.inbound_rpc', 'true', true);
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active() then raise exception 'INACTIVE'; end if;
  if length(body) < 1 or length(body) > 2000 then raise exception 'INVALID_BODY'; end if;

  -- Rate limit: 분당 20건. Admin bypasses because operations require fast
  -- triage across many threads. (Submit RPC does NOT bypass — admins rarely
  -- create submissions themselves, so the asymmetry is intentional.)
  if not v_is_admin then
    perform public.rate_limit_check('inbound_comment', 20, 60);
  end if;

  -- ... rest of body unchanged ...
end; $$;
```

- [ ] **Step 2: Add `submit_inbound_request_rpc(title, body, excel_path, excel_name, image_paths)` RPC that wraps INSERT + rate-limit (5/min)**

```sql
create or replace function public.submit_inbound_request_rpc(
  p_title text,
  p_body text,
  p_excel_path text,
  p_excel_name text,
  p_image_paths text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  perform set_config('app.inbound_rpc', 'true', true);
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active() then raise exception 'INACTIVE'; end if;

  -- 분당 5건
  perform public.rate_limit_check('inbound_request_create', 5, 60);

  if length(coalesce(p_title, '')) < 1 or length(p_title) > 200 then raise exception 'INVALID_TITLE'; end if;
  if length(coalesce(p_body, '')) > 5000 then raise exception 'INVALID_BODY'; end if;
  if p_image_paths is not null and cardinality(p_image_paths) > 3 then raise exception 'TOO_MANY_IMAGES'; end if;
  if p_excel_path is null or p_excel_name is null then raise exception 'MISSING_EXCEL'; end if;

  insert into public.inbound_requests (user_id, title, body, excel_storage_path, excel_original_name, image_paths)
  values (v_uid, p_title, p_body, p_excel_path, p_excel_name, coalesce(p_image_paths, '{}'::text[]))
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.submit_inbound_request_rpc(text, text, text, text, text[]) to authenticated;

-- Lock down the RLS insert path so the RPC is the only legal insert path.
-- Direct `.insert()` calls will now fail unless the caller is admin OR explicitly
-- inside an RPC (which sets the session flag).
drop policy if exists inbound_requests_self_insert on public.inbound_requests;
create policy inbound_requests_self_insert on public.inbound_requests
  for insert with check (
    user_id = auth.uid()
    and public.is_active()
    and coalesce(current_setting('app.inbound_rpc', true), '') = 'true'
  );
```

- [ ] **Step 3: Update `submitInboundRequestAction` to call the RPC** instead of direct insert. Catch `RATE_LIMITED` and return user-facing Korean error: "잠시 후 다시 시도해주세요 (분당 5건 제한)".

- [ ] **Step 4: Verify RLS lockdown** — manually attempt `supabase.from('inbound_requests').insert({...})` from a logged-in non-admin user; expect RLS denial. RPC path should succeed.

- [ ] **Step 5: Commit** `feat(inbound): server-side rate limits + RPC-only insert chokepoint`

---

## Task 3: Storage `_pending_` rename + cleanup function

**Files:**
- Modify: `lib/actions/inbound-request.ts`
- Create: rename function call after row insert

- [ ] **Step 1: After `submit_inbound_request_rpc` returns the new request_id, rename storage paths with rollback on DB update failure**

```ts
// After: const newId = (await rpc.call).data as string;
const originalExcelPath = excelPath;
const originalImagePaths = [...imagePaths];

const renamedExcel = `${u.user.id}/${newId}/excel/${safeFilename(excel.name)}`;
const { error: mvErr } = await supabase.storage
  .from('inbound-requests')
  .move(originalExcelPath, renamedExcel);

let finalExcelPath = originalExcelPath;
const finalImagePaths = [...imagePaths];

if (!mvErr) {
  finalExcelPath = renamedExcel;
}

// Same for each image: keep original nanoid filename, change segment.
for (let i = 0; i < imagePaths.length; i++) {
  const old = imagePaths[i];
  const newName = `${u.user.id}/${newId}/images/${old.split('/').pop()}`;
  const { error } = await supabase.storage.from('inbound-requests').move(old, newName);
  if (!error) finalImagePaths[i] = newName;
}

const renameHappened =
  finalExcelPath !== originalExcelPath ||
  finalImagePaths.some((p, i) => p !== originalImagePaths[i]);

if (renameHappened) {
  const { error: upErr } = await supabase
    .from('inbound_requests')
    .update({ excel_storage_path: finalExcelPath, image_paths: finalImagePaths })
    .eq('id', newId);

  if (upErr) {
    // Rollback: move files back so the row's path stays valid.
    console.error('[inbound] post-rename DB update failed; rolling back rename', upErr);
    const rollbackResults: Array<{ ok: boolean; from: string; to: string }> = [];
    if (finalExcelPath !== originalExcelPath) {
      const { error } = await supabase.storage
        .from('inbound-requests')
        .move(finalExcelPath, originalExcelPath);
      rollbackResults.push({ ok: !error, from: finalExcelPath, to: originalExcelPath });
      if (error) console.error('[inbound] excel rename rollback failed', error);
    }
    for (let i = 0; i < finalImagePaths.length; i++) {
      if (finalImagePaths[i] !== originalImagePaths[i]) {
        const { error } = await supabase.storage
          .from('inbound-requests')
          .move(finalImagePaths[i], originalImagePaths[i]);
        rollbackResults.push({ ok: !error, from: finalImagePaths[i], to: originalImagePaths[i] });
        if (error) console.error('[inbound] image rename rollback failed', error);
      }
    }
    // Cascade failure: at least one rollback `move` also failed. We end up in a
    // mixed state where some files are at canonical `{request_id}/...` paths
    // (rollback failed) and others are back at `_pending_*` (rollback succeeded).
    // For each path, point the DB at where the file actually IS now:
    //   - rollback succeeded → use original `_pending_*` path
    //   - rollback failed    → use canonical path (file is still there)
    // This avoids 404s on signed URLs at the cost of leaving the row in a mixed
    // state. The orphan cleanup function reclaims any abandoned `_pending_*` files.
    if (rollbackResults.some((r) => !r.ok)) {
      const chaseExcel = rollbackResults.find(
        (r) => !r.ok && r.from === finalExcelPath,
      ) ? finalExcelPath : originalExcelPath;
      const chaseImages = finalImagePaths.map((p, i) => {
        const failed = rollbackResults.find((r) => !r.ok && r.from === p);
        return failed ? p : originalImagePaths[i];
      });
      await supabase
        .from('inbound_requests')
        .update({ excel_storage_path: chaseExcel, image_paths: chaseImages })
        .eq('id', newId)
        .then(({ error }) => {
          if (error) console.error('[inbound] chase-update also failed; orphan possible', error);
        });
    }
  }
}
```

- [ ] **Step 2: Add `cleanup_orphan_inbound_pending(older_than interval default '24 hours')` SQL function** in a new migration `20260513000005_inbound_pending_cleanup.sql` (no schedule — call-able by admin only)

```sql
create or replace function public.cleanup_orphan_inbound_pending(p_older_than interval default '24 hours')
returns int
language plpgsql security definer set search_path = public as $$
declare v_removed int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  with d as (
    delete from storage.objects
     where bucket_id = 'inbound-requests'
       and name like '%/_pending_%/%'
       and created_at < now() - p_older_than
     returning 1
  )
  select count(*) into v_removed from d;

  return v_removed;
end; $$;

revoke execute on function public.cleanup_orphan_inbound_pending(interval) from public, anon;
grant execute on function public.cleanup_orphan_inbound_pending(interval) to authenticated;
```

> Note: `storage.objects` is the canonical Supabase table; DELETE on it removes both the row and the underlying file via Supabase's storage extension. `storage.delete_object(text, text)` is NOT a public function — Architect/Critic verified.

- [ ] **Step 3: Commit** `feat(inbound): canonical storage paths + orphan cleanup function`

---

## Task 4: Tighten `safeFilename`, drop escape-hatches, column-scope queries

**Files:**
- Modify: `lib/actions/inbound-request.ts`
- Modify: `lib/inbound/queries.ts`
- Modify: `components/inbound/InboundUnreadBadge.tsx`

- [ ] **Step 1: Tighter `safeFilename`**

```ts
function safeFilename(name: string) {
  return name
    .replace(/^\.+/, '')            // strip leading dots
    .replace(/\.{2,}/g, '.')        // collapse runs of dots
    .replace(/[^\w가-힣\.\-]+/g, '_');
}
```

- [ ] **Step 2: Drop `(supabase.from as any)` and `(supabase.rpc as any)` escape-hatches** — `lib/db-types.ts` already has the inbound table + RPC types from prod regen.
  - `lib/inbound/queries.ts`: 4 sites (fetchMyInboundRequests, fetchAllInboundRequests, fetchInboundRequest x2) + 1 `(supabase.rpc as any)` in fetchUnreadCount.
  - `lib/actions/inbound-request.ts`: enumerate every `(supabase.from as any)` / `(supabase.rpc as any)` — at minimum lines 222 (updateInboundCommentAction comments fetch), 259 (deleteInboundCommentAction comments fetch), 300 (getInboundAttachmentUrlAction requests fetch), 323 (deleteInboundRequestAction requests fetch). Verify after edit: `grep -n "as any" lib/actions/inbound-request.ts` returns zero hits.
  - `components/inbound/InboundUnreadBadge.tsx`: 1 site (rpc).
  - Use precise typed Supabase calls (e.g. `supabase.from('inbound_requests').select('id, ...')`) — the regenerated types will infer correctly.

- [ ] **Step 3: Replace `fetchInboundRequest` `select('*')` with explicit column lists** (excludes admin-only `reviewed_by` from user-facing queries; user detail page only reads safe fields anyway).

- [ ] **Step 4: Verify** `pnpm typecheck && pnpm test`.
- [ ] **Step 5: Commit** `refactor(inbound): drop escape-hatch casts and tighten select columns + filename`

---

## Task 5: useConfirm hook for 3 sites

**Files:**
- Modify: `app/(user)/inbound-requests/[id]/CancelInboundButton.tsx`
- Modify: `app/(admin)/admin/inbound-requests/[id]/StatusControls.tsx`
- Modify: `components/inbound/InboundCommentForm.tsx` (CommentRowActions delete)

> `components/ConfirmDialog.tsx` exports a `useConfirm()` hook (not a JSX component). The hook returns `{ confirm: async () => boolean, element: JSX }` — render the element once and call `await confirm()` from event handlers.

- [ ] **Step 1: Pattern for each site**:

```tsx
// Note: useConfirm uses `tone`, NOT `variant`. Verify against components/ConfirmDialog.tsx
// before copying. Other option names also live there.
const { confirm, element } = useConfirm({
  title: '이 입고요청을 취소할까요?',
  description: '취소하면 되돌릴 수 없습니다.',
  confirmLabel: '취소',
  cancelLabel: '닫기',
  tone: 'destructive',
});

async function onCancel() {
  if (!(await confirm())) return;
  start(async () => {
    const r = await cancelInboundRequestAction(requestId);
    // ...
  });
}

return (
  <>
    <Button onClick={onCancel} disabled={pending}>...</Button>
    {element}
  </>
);
```

Apply to:
- `CancelInboundButton.tsx` — replace the `confirm()` inside `start()`
- `StatusControls.tsx` — replace the 3 `confirm()` calls (open→in_progress, open→cancel, in_progress→complete, in_progress→cancel)
- `InboundCommentForm.tsx` `CommentRowActions` — replace the comment-delete `confirm()`

- [ ] **Step 2: Verify dialogs render**, focus management OK, ESC + outside-click dismisses.
- [ ] **Step 3: Commit** `feat(inbound): replace native confirm() with useConfirm hook`

---

## Task 6: useFormState in NewRequestForm (adapt action in place)

**Files:**
- Modify: `app/(user)/inbound-requests/new/NewRequestForm.tsx`
- Modify: `lib/actions/inbound-request.ts`

- [ ] **Step 1: Adapt `submitInboundRequestAction` signature in place to `(prevState: SubmitResult | null, fd: FormData)`** — `useFormState` requires this 2-arg form; `prevState` is harmless to ignore. No dual API.

```ts
export async function submitInboundRequestAction(
  _prevState: SubmitResult | null,
  fd: FormData,
): Promise<SubmitResult> {
  // existing body unchanged
}
```

There is exactly one caller (`NewRequestForm`) — update it to pass through `useFormState`.

- [ ] **Step 2: Rewrite `NewRequestForm`** to use `useFormState(submitInboundRequestAction, null)` for the submit action and `useFormStatus()` inside a `<SubmitButton>` child for the pending state.

```tsx
const [state, formAction] = useFormState(submitInboundRequestAction, null);
useEffect(() => {
  if (state?.ok) {
    toast({ title: '입고요청이 등록되었습니다.' });
    router.push(`/inbound-requests/${state.requestId}`);
  }
}, [state]);

return (
  <form action={formAction} className="rounded-lg border bg-card p-5 space-y-4">
    {/* fields unchanged */}
    {state && !state.ok && (
      <p className="text-sm text-destructive" role="alert">{state.error}</p>
    )}
    <SubmitButton />
  </form>
);

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? '등록 중…' : '등록'}</Button>;
}
```

- [ ] **Step 3: Preserve existing client-side validation** for image count and basic required checks by combining with a small `onSubmit` guard if needed (or move all validation server-side and rely on the action's Zod result).
- [ ] **Step 4: Commit** `refactor(inbound): use useFormState/useFormStatus per spec §5.2`

---

## Task 7: Signed-URL fallback UX

**Files:**
- Modify: `components/inbound/InboundAttachmentList.tsx`

- [ ] **Step 1: Replace `href={excelUrl ?? '#'}` with conditional rendering** — when `excelUrl` is null, render a non-link with an `aria-disabled` and inline message "다운로드 링크를 발급할 수 없습니다 (잠시 후 새로고침 하세요)".

- [ ] **Step 2: Same for failed image signatures** — show an "이미지를 불러올 수 없습니다" placeholder.
- [ ] **Step 3: Commit** `fix(inbound): graceful fallback for failed signed URLs`

---

## Task 8: Admin user search input via server-side RPC

**Files:**
- Create: `supabase/migrations/20260513000006_search_inbound_requests.sql`
- Modify: `lib/inbound/queries.ts`
- Modify: `app/(admin)/admin/inbound-requests/page.tsx`

> PostgREST's `.or()` does NOT filter on joined relations through embedded-resource syntax — verified by Architect review. Use a dedicated SECURITY DEFINER RPC instead. Parameter binding eliminates injection risk.

- [ ] **Step 1: Create the search RPC** that joins `inbound_requests` to `profiles` and ILIKEs name/email server-side.

```sql
create or replace function public.search_inbound_requests(
  p_q text default null,
  p_status text default null,
  p_limit int default 200
) returns table (
  id uuid,
  user_id uuid,
  title text,
  status text,
  last_comment_at timestamptz,
  last_comment_by_role text,
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  profile_name text,
  profile_email text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.user_id, r.title, r.status,
         r.last_comment_at, r.last_comment_by_role,
         r.user_last_read_at, r.admin_last_read_at,
         r.created_at, r.updated_at,
         p.name as profile_name, p.email as profile_email
    from public.inbound_requests r
    join public.profiles p on p.id = r.user_id
   where public.is_admin()
     and (p_status is null or r.status = p_status)
     and (
       p_q is null or p_q = '' or
       p.name  ilike '%' || p_q || '%' or
       p.email ilike '%' || p_q || '%'
     )
   order by r.created_at desc
   limit greatest(0, least(coalesce(p_limit, 200), 500));
$$;

grant execute on function public.search_inbound_requests(text, text, int) to authenticated;
```

- [ ] **Step 2: Replace `fetchAllInboundRequests` body** to call the RPC. Drop the old PostgREST join. Map `profile_name`/`profile_email` to the existing `InboundListRow.profile` shape.
- [ ] **Step 3: Add `<input type="search" name="q">` inside a `<form method="GET">` above the admin table** — controlled via URL `?q=...`. Reuse existing input styling.
- [ ] **Step 4: Verify** searching by name/email partial returns expected rows; non-admin caller of the RPC gets empty result (`is_admin()` guard).
- [ ] **Step 5: Commit** `feat(inbound/admin): user search via search_inbound_requests RPC`

---

## Task 9: RLS initplan optimization (inbound tables only)

**Files:**
- Create: `supabase/migrations/20260513000007_inbound_rls_initplan.sql`

> Note: Task 2 already touched `inbound_requests_self_insert` for the RPC chokepoint. This task rewrites the **remaining** policies. Exact policy names taken from `supabase/migrations/20260512000003_inbound_requests.sql`.

- [ ] **Step 1: Drop + recreate policies with `(select ...)` wrappers**

```sql
-- === inbound_requests (excludes self_insert which was rewritten in Task 2) ===

drop policy if exists inbound_requests_owner_admin_select on public.inbound_requests;
create policy inbound_requests_owner_admin_select on public.inbound_requests
  for select using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists inbound_requests_self_update on public.inbound_requests;
create policy inbound_requests_self_update on public.inbound_requests
  for update
  using (user_id = (select auth.uid()) and status = 'open')
  with check (user_id = (select auth.uid()) and status = 'open');

drop policy if exists inbound_requests_self_delete on public.inbound_requests;
create policy inbound_requests_self_delete on public.inbound_requests
  for delete using (user_id = (select auth.uid()) and status = 'open');

drop policy if exists inbound_requests_admin_all on public.inbound_requests;
create policy inbound_requests_admin_all on public.inbound_requests
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- === inbound_request_comments ===

drop policy if exists inbound_comments_select on public.inbound_request_comments;
create policy inbound_comments_select on public.inbound_request_comments
  for select using (
    exists (
      select 1 from public.inbound_requests r
      where r.id = request_id
        and (r.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists inbound_comments_self_update on public.inbound_request_comments;
create policy inbound_comments_self_update on public.inbound_request_comments
  for update using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists inbound_comments_self_delete on public.inbound_request_comments;
create policy inbound_comments_self_delete on public.inbound_request_comments
  for delete using (author_id = (select auth.uid()));

drop policy if exists inbound_comments_admin_all on public.inbound_request_comments;
create policy inbound_comments_admin_all on public.inbound_request_comments
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- === storage.objects (bucket: inbound-requests) ===

drop policy if exists "inbound-requests owner read" on storage.objects;
create policy "inbound-requests owner read" on storage.objects
  for select using (
    bucket_id = 'inbound-requests'
    and ((select auth.uid())::text = (storage.foldername(name))[1] or (select public.is_admin()))
  );

drop policy if exists "inbound-requests owner write" on storage.objects;
create policy "inbound-requests owner write" on storage.objects
  for insert with check (
    bucket_id = 'inbound-requests'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and (select public.is_active())
  );

drop policy if exists "inbound-requests owner update" on storage.objects;
create policy "inbound-requests owner update" on storage.objects
  for update using (
    bucket_id = 'inbound-requests'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "inbound-requests owner delete" on storage.objects;
create policy "inbound-requests owner delete" on storage.objects
  for delete using (
    bucket_id = 'inbound-requests'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "inbound-requests admin all" on storage.objects;
create policy "inbound-requests admin all" on storage.objects
  for all using (bucket_id = 'inbound-requests' and (select public.is_admin()))
  with check (bucket_id = 'inbound-requests' and (select public.is_admin()));
```

- [ ] **Step 2: Apply migration** and re-run `mcp__supabase__get_advisors --type performance` to confirm inbound auth_rls_initplan warnings cleared.
- [ ] **Step 3: Spot-check RLS behavior** — verify a user can still INSERT via the RPC (Task 2 path) and SELECT their own rows. Verify admin can SELECT all.
- [ ] **Step 4: Commit** `perf(inbound): wrap RLS auth.uid() / is_admin() in (select ...) per advisor`

---

## Task 10: Final verification

- [ ] **Step 1: Automated tests added in this PR**
  - `tests/unit/inbound-safe-filename.test.ts` — unit test for `safeFilename` covering: leading dots stripped, runs of dots collapsed, Korean preserved, traversal-like inputs sanitized.
  - Larger integration tests (rate-limit boundary, RPC chokepoint, search RPC) deferred to a follow-up PR per spec §8.2 (no integration test infra in `tests/integration/` yet).
- [ ] **Step 2:** `pnpm typecheck && pnpm test && pnpm lint && pnpm build` all clean.
- [ ] **Step 3: Manual regression** (build on prior plan §19 checklist) — focus on:
  - **Rate-limit**: try 6 submissions in 1 minute → 6th returns Korean RATE_LIMITED message.
  - **RPC chokepoint**: from a logged-in non-admin browser console, run `await supabase.from('inbound_requests').insert({...})` → expect RLS denial. RPC path works.
  - **Storage rename**: submit an inbound request, inspect the DB row's `excel_storage_path` — should be `{user_id}/{request_id}/excel/...`, not `_pending_*`.
  - **Admin DELETE after Task 9**: as admin, delete a user's inbound row → no RLS denial.
  - **Search**: filter admin list by partial user name and email — verify rows match.
  - **useConfirm dialogs**: cancel button, status change, comment delete all render the dialog (no native `confirm()`).
  - **Signed URL fallback**: simulate a signed URL failure (e.g., temporarily revoke storage policy) → page shows fallback message, not broken link.
- [ ] **Step 4: Re-run advisors** `mcp__supabase__get_advisors --type performance` → inbound `auth_rls_initplan` warnings should be 0.
- [ ] **Step 5: Open PR** with link to original PR + this plan + the Deploy Ordering note.

---

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Storage `move` fails before DB update | LOW | LOW | Row keeps `_pending_*` path; cleanup function reclaims later |
| Storage `move` succeeds but DB update fails | LOW | MEDIUM | Rollback step moves files back to `_pending_*` path (Task 3 try/catch) |
| Rate-limit blocks legitimate burst on first use | MEDIUM | LOW | Admin bypasses comment limit; quotas are generous (5 new/min, 20 comments/min); Korean error message in action |
| RLS self_insert lockdown breaks existing `add_inbound_comment` flow | LOW | HIGH | RPCs already set `app.inbound_rpc=true` via `set_config` (verified in migration `20260513000001`); insert lockdown only affects bare-metal `.from().insert()` |
| `rate_limits` table grows unbounded | LOW | LOW | Amortized GC inside `rate_limit_check` (1% of calls clean >24h rows) |
| RLS rewrite breaks RLS semantics | LOW | HIGH | One policy per `DROP POLICY IF EXISTS` + recreate; manual test as both user and admin on each policy after migration |
| useFormState differs subtly from useTransition error UX | LOW | LOW | Keep error message rendering identical; capture `state.error` in a `<p role="alert">` |
| `search_inbound_requests` RPC injection or escalation | LOW | MEDIUM | Parameter binding (no string interpolation), `is_admin()` gate inside the RPC, return-row `limit` bounded |

---

## Out of Scope

- Project-wide `auth_rls_initplan` optimization (affects `profiles`, `orders`, `order_items`, etc.) — separate PR
- Cron scheduling for `cleanup_orphan_inbound_pending` — separate PR (Edge Function or external scheduler)
- Integration tests in `tests/integration/` against Supabase local stack — separate PR
- Admin "internal note" comment type (admin-only visibility) — feature request, not a bug
- Author title/body edit UI — feature request, DB already supports it
