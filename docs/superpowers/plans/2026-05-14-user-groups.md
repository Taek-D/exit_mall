# 사용자 그룹 (User Groups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 가입 승인 시 사용자를 `group1`(엑시트몰 전체) 또는 `group2`(배송대행 전용) 중 하나로 배정하고, 이후 변경 가능하도록 한다. group2 사용자는 `사입재고 배송대행`과 `입고리스트`만 사용한다.

**Architecture:** `profiles.user_group` 컬럼 1개 추가 + `lib/auth/user-groups.ts` SSOT 모듈 + middleware 라우트 가드 + NavUser 메뉴 필터 + 일부 server action에 `requireUserGroup1` 가드. RLS는 손대지 않는다.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + auth), shadcn/ui (Radix Select/RadioGroup), Tailwind, Vitest.

**Spec:** [docs/superpowers/specs/2026-05-14-user-groups-design.md](../specs/2026-05-14-user-groups-design.md)

---

## 파일 구조 결정

**신규:**
- `supabase/migrations/20260514000001_user_groups.sql` — DB 컬럼 + 백필
- `lib/auth/user-groups.ts` — SSOT (타입, 라벨, 경로 매트릭스)
- `app/(admin)/admin/users/[id]/GroupChangeForm.tsx` — 그룹 변경 카드
- `tests/unit/user-groups.test.ts` — SSOT 유닛 테스트
- `tests/unit/admin-approvals-action.test.ts` — `approveUserAction` 입력 검증 테스트
- `tests/unit/admin-set-user-group.test.ts` — `setUserGroupAction` 입력 검증 테스트

**수정:**
- `lib/actions/_guards.ts` — `requireUserGroup1` 추가
- `lib/actions/admin-approvals.ts` — `approveUserAction` 시그니처 변경
- `lib/actions/admin-users.ts` — `setUserGroupAction` 추가
- `lib/actions/order.ts` — `requireUserGroup1` 가드 추가
- `lib/actions/stock-order.ts` — `requireUserGroup1` 가드 추가
- `lib/actions/deposit.ts` — `requireUserGroup1` 가드 추가
- `middleware.ts` — group2 라우트 차단 + 루트 리다이렉트 분기
- `components/NavUser.tsx` — NAV 항목별 `groups` 필드 + 필터
- `app/(user)/layout.tsx` — `user_group` 조회 + props 전달, group2면 배너 숨김
- `app/(admin)/admin/approvals/page.tsx` — `ApprovalRow` 시그니처 변경 흡수
- `app/(admin)/admin/approvals/ApprovalRow.tsx` — 그룹 선택 Select 추가
- `app/(admin)/admin/users/page.tsx` — 그룹 컬럼 추가
- `app/(admin)/admin/users/[id]/page.tsx` — `GroupChangeForm` 카드 추가

---

## 실행 순서

1. DB 마이그레이션부터 (Task 1) — 컬럼이 있어야 이후 모든 작업이 의미를 가진다
2. SSOT (Task 2) — 다른 곳에서 import할 단일 진실의 원천
3. 가드 헬퍼 (Task 3) — server action 보호
4. 승인 흐름 (Tasks 4-5) — 새 사용자가 그룹을 받도록
5. 사용자 관리 흐름 (Tasks 6-8) — 사후 그룹 변경 + 표시
6. 라우트/메뉴 가드 (Tasks 9-11) — 사용자 동선 차단
7. 액션 가드 적용 (Task 12) — 잔여 우회 경로 차단

---

## Task 1: DB 마이그레이션 — `user_group` 컬럼 추가 + 백필

**Files:**
- Create: `supabase/migrations/20260514000001_user_groups.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260514000001_user_groups.sql
-- profiles.user_group: 1그룹(전체) / 2그룹(배송대행 전용) / NULL(미지정)

alter table public.profiles
  add column user_group text
    check (user_group in ('group1','group2'));

create index profiles_user_group_idx on public.profiles (user_group);

-- 기존 active 사용자는 모두 group1로 백필
update public.profiles
   set user_group = 'group1'
 where status = 'active'
   and user_group is null;
```

- [ ] **Step 2: 로컬 Supabase에 마이그레이션 적용**

Run: `npx supabase migration up --local`
Expected: `Applying migration 20260514000001_user_groups.sql...` 메시지 후 성공.

- [ ] **Step 3: 컬럼이 생성됐는지 확인**

Run: `npx supabase db execute --local "select column_name, data_type from information_schema.columns where table_name = 'profiles' and column_name = 'user_group';"`

또는 SQL editor에서 동일 쿼리 실행.
Expected: `user_group | text` 1행 반환.

- [ ] **Step 4: 백필 결과 확인**

Run: `npx supabase db execute --local "select status, user_group, count(*) from public.profiles group by 1,2 order by 1,2;"`
Expected: `active` 행은 모두 `user_group=group1`, `pending`/`rejected` 행은 `user_group=NULL`.

- [ ] **Step 5: db-types 재생성**

Run: `pnpm run db:types`
Expected: `lib/db-types.ts`의 `profiles` Row 타입에 `user_group: string | null` 추가됨.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260514000001_user_groups.sql lib/db-types.ts
git commit -m "feat(auth): add profiles.user_group column with group1 backfill"
```

---

## Task 2: SSOT 모듈 — `lib/auth/user-groups.ts`

**Files:**
- Create: `lib/auth/user-groups.ts`
- Test: `tests/unit/user-groups.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/unit/user-groups.test.ts
import { describe, it, expect } from 'vitest';
import {
  isPathAllowedForGroup2,
  GROUP2_HOME,
  USER_GROUP_LABEL,
} from '@/lib/auth/user-groups';

describe('user-groups SSOT', () => {
  describe('USER_GROUP_LABEL', () => {
    it('group1 라벨에 "1그룹"이 포함된다', () => {
      expect(USER_GROUP_LABEL.group1).toContain('1그룹');
    });
    it('group2 라벨에 "2그룹"이 포함된다', () => {
      expect(USER_GROUP_LABEL.group2).toContain('2그룹');
    });
  });

  describe('GROUP2_HOME', () => {
    it('사입재고 배송대행 경로를 가리킨다', () => {
      expect(GROUP2_HOME).toBe('/shipping-uploads/purchased');
    });
  });

  describe('isPathAllowedForGroup2', () => {
    it.each([
      ['/shipping-uploads/purchased'],
      ['/shipping-uploads/purchased/abc-123'],
      ['/inbound-requests'],
      ['/inbound-requests/new'],
      ['/inbound-requests/abc-123'],
      ['/account'],
      ['/account/password'],
    ])('허용된 경로: %s', (p) => {
      expect(isPathAllowedForGroup2(p)).toBe(true);
    });

    it.each([
      ['/shop'],
      ['/cart'],
      ['/orders'],
      ['/orders/abc'],
      ['/inventory'],
      ['/inventory/product/abc'],
      ['/shipping-uploads/exitmall'],
      ['/shipping-uploads/exitmall/abc'],
      ['/deposit'],
      ['/admin'],
      ['/admin/users'],
      ['/'],
    ])('차단된 경로: %s', (p) => {
      expect(isPathAllowedForGroup2(p)).toBe(false);
    });

    it('prefix가 부분 일치인 경로는 차단된다', () => {
      // /account-foo 같은 가짜 경로
      expect(isPathAllowedForGroup2('/account-fake')).toBe(false);
      expect(isPathAllowedForGroup2('/inbound-requests-other')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test -- user-groups.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/user-groups'`

- [ ] **Step 3: SSOT 모듈 구현**

```ts
// lib/auth/user-groups.ts
export type UserGroup = 'group1' | 'group2';

export const USER_GROUPS: readonly UserGroup[] = ['group1', 'group2'] as const;

export const USER_GROUP_LABEL: Record<UserGroup, string> = {
  group1: '1그룹 (엑시트몰 전체)',
  group2: '2그룹 (배송대행 전용)',
};

export const USER_GROUP_SHORT_LABEL: Record<UserGroup, string> = {
  group1: '1그룹',
  group2: '2그룹',
};

// group2가 접근 가능한 경로 prefix
export const GROUP2_ALLOWED_PREFIXES = [
  '/shipping-uploads/purchased',
  '/inbound-requests',
  '/account',
] as const;

// group2 사용자가 차단된 경로로 진입하거나 / 로 진입할 때 보낼 홈
export const GROUP2_HOME = '/shipping-uploads/purchased';

export function isPathAllowedForGroup2(pathname: string): boolean {
  return GROUP2_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

export function isUserGroup(value: unknown): value is UserGroup {
  return value === 'group1' || value === 'group2';
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `pnpm test -- user-groups.test.ts`
Expected: PASS (모든 케이스)

- [ ] **Step 5: typecheck**

Run: `pnpm run typecheck`
Expected: 새 에러 없음

- [ ] **Step 6: Commit**

```bash
git add lib/auth/user-groups.ts tests/unit/user-groups.test.ts
git commit -m "feat(auth): user-groups SSOT module with path matrix"
```

---

## Task 3: `requireUserGroup1` 가드 헬퍼

**Files:**
- Modify: `lib/actions/_guards.ts`

- [ ] **Step 1: `_guards.ts` 끝에 `requireUserGroup1` 추가**

`lib/actions/_guards.ts` 파일 끝에 아래 함수를 추가한다. 기존 `requireAdmin`은 그대로 유지.

```ts
export type UserGroup1Context = {
  ok: true;
  supabase: SupabaseServerClient;
  user: User;
  profile: { role: string; status: string; user_group: string | null };
};

export async function requireUserGroup1(): Promise<UserGroup1Context | GuardError> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,status,user_group')
    .eq('id', user.id)
    .single<{ role: string; status: string; user_group: string | null }>();

  if (!profile || profile.status !== 'active') {
    return { ok: false, error: '계정이 활성 상태가 아닙니다.' };
  }
  // admin은 통과 (관리자는 권한 전권), 일반 사용자는 group1만 통과
  if (profile.role !== 'admin' && profile.user_group !== 'group1') {
    return { ok: false, error: '이 기능을 사용할 권한이 없습니다.' };
  }
  return { ok: true, supabase, user, profile };
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm run typecheck`
Expected: 새 에러 없음

- [ ] **Step 3: Commit**

```bash
git add lib/actions/_guards.ts
git commit -m "feat(auth): requireUserGroup1 server-action guard"
```

---

## Task 4: `approveUserAction` 시그니처 변경 — group 인자 받기

**Files:**
- Modify: `lib/actions/admin-approvals.ts`
- Test: `tests/unit/admin-approvals-action.test.ts`

이 액션은 Supabase 클라이언트를 사용하므로 액션 자체보다는 **입력 검증** 분기 테스트를 작성한다.

- [ ] **Step 1: 실패하는 검증 테스트 작성**

```ts
// tests/unit/admin-approvals-action.test.ts
import { describe, it, expect } from 'vitest';
import { isUserGroup } from '@/lib/auth/user-groups';

// approveUserAction에서 사용하는 입력 검증 로직만 격리해 검증한다.
// 액션 본체는 Supabase 통합 의존이라 별도 통합 테스트 환경 없이는 못 돌린다.
describe('approveUserAction input validation', () => {
  it('isUserGroup이 group1/group2만 통과시킨다', () => {
    expect(isUserGroup('group1')).toBe(true);
    expect(isUserGroup('group2')).toBe(true);
  });

  it('잘못된 값은 거부한다', () => {
    expect(isUserGroup(undefined)).toBe(false);
    expect(isUserGroup(null)).toBe(false);
    expect(isUserGroup('')).toBe(false);
    expect(isUserGroup('group3')).toBe(false);
    expect(isUserGroup('admin')).toBe(false);
    expect(isUserGroup(1)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 통과하는지 확인**

Run: `pnpm test -- admin-approvals-action.test.ts`
Expected: PASS (`isUserGroup`은 Task 2에서 이미 구현됨)

- [ ] **Step 3: `approveUserAction` 수정**

`lib/actions/admin-approvals.ts`를 다음 내용으로 완전히 교체한다 (rejectUserAction은 그대로 유지):

```ts
'use server';
import { requireAdmin } from '@/lib/actions/_guards';
import { mutationTable, revalidatePaths } from '@/lib/actions/_shared';
import { isUserGroup, type UserGroup } from '@/lib/auth/user-groups';

export async function approveUserAction(userId: string, group: UserGroup) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  if (!isUserGroup(group)) {
    return { error: '그룹이 올바르지 않습니다.' };
  }

  const { error } = await mutationTable(guard.supabase, 'profiles')
    .update({
      status: 'active',
      user_group: group,
      approved_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) {
    console.error('[admin-approvals] approve', { userId, group, error });
    return { error: '가입을 승인하지 못했습니다.' };
  }
  console.info('[admin-approvals] approved', {
    userId,
    group,
    by: guard.user.id,
  });
  revalidatePaths(['/admin/approvals', '/admin/users', '/admin']);
  return { ok: true };
}

export async function rejectUserAction(userId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await mutationTable(guard.supabase, 'profiles')
    .update({ status: 'rejected' })
    .eq('id', userId);
  if (error) {
    console.error('[admin-approvals] reject', { userId, error });
    return { error: '가입을 반려하지 못했습니다.' };
  }
  revalidatePaths(['/admin/approvals', '/admin/users', '/admin']);
  return { ok: true };
}
```

- [ ] **Step 4: typecheck**

Run: `pnpm run typecheck`
Expected: `ApprovalRow.tsx`에서 `approveUserAction(profile.id)` 1-인자 호출이 에러로 잡힘 — 이는 Task 5에서 수정. 일단 그 에러 외에는 없어야 한다.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/admin-approvals.ts tests/unit/admin-approvals-action.test.ts
git commit -m "feat(admin): approveUserAction sets user_group on approval"
```

---

## Task 5: `ApprovalRow` UI — 그룹 선택 Select 추가

**Files:**
- Modify: `app/(admin)/admin/approvals/ApprovalRow.tsx`

기존 [승인] [반려] 두 버튼을 [그룹 Select][승인][반려]로 바꾼다.

- [ ] **Step 1: `ApprovalRow.tsx`를 다음 내용으로 교체**

```tsx
'use client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState, useTransition } from 'react';
import {
  approveUserAction,
  rejectUserAction,
} from '@/lib/actions/admin-approvals';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import {
  USER_GROUPS,
  USER_GROUP_LABEL,
  type UserGroup,
} from '@/lib/auth/user-groups';

type Profile = {
  id: string;
  email: string;
  name: string;
  phone: string;
  created_at: string;
};

export function ApprovalRow({ profile }: { profile: Profile }) {
  const [group, setGroup] = useState<UserGroup | ''>('');
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function approve() {
    if (!group) return;
    start(async () => {
      const r = await approveUserAction(profile.id, group);
      if (r.error) {
        toast({ title: '실패', description: r.error, variant: 'destructive' });
      } else {
        toast({ title: '승인 완료' });
        router.refresh();
      }
    });
  }

  function reject() {
    start(async () => {
      const r = await rejectUserAction(profile.id);
      if (r.error) {
        toast({ title: '실패', description: r.error, variant: 'destructive' });
      } else {
        toast({ title: '반려 완료' });
        router.refresh();
      }
    });
  }

  const initial = (profile.name || '?').charAt(0).toUpperCase();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 hover:bg-surface-muted/50 transition-colors">
      <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
        <div className="h-10 w-10 rounded-full bg-muted grid place-items-center shrink-0">
          <span className="text-sm font-medium">{initial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{profile.name}</p>
          <p className="text-xs text-muted-foreground break-all sm:truncate">
            {profile.email}
            <span className="text-muted-foreground/60"> · </span>
            <span className="font-mono tabular whitespace-nowrap">
              {profile.phone}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(profile.created_at).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0 sm:self-center">
        <Select value={group} onValueChange={(v) => setGroup(v as UserGroup)}>
          <SelectTrigger className="h-9 w-[180px]" aria-label="그룹 선택">
            <SelectValue placeholder="그룹 선택" />
          </SelectTrigger>
          <SelectContent>
            {USER_GROUPS.map((g) => (
              <SelectItem key={g} value={g}>
                {USER_GROUP_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={approve}
          disabled={pending || !group}
          className="flex-1 sm:flex-initial"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          승인
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={reject}
          disabled={pending}
          className="flex-1 sm:flex-initial"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          반려
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm run typecheck`
Expected: Task 4에서 발생했던 1-인자 호출 에러 사라짐. 새 에러 없음.

- [ ] **Step 3: 빌드 확인**

Run: `pnpm run lint`
Expected: 새 에러 없음

- [ ] **Step 4: 수동 검증 — 개발 서버에서 흐름 확인**

Run: `pnpm dev` (background)
브라우저에서 admin 계정으로 로그인 → `/admin/approvals` 접속 → pending 사용자가 있으면:
- 그룹을 선택하지 않은 상태로 [승인] 클릭 시도 → 버튼 비활성
- 그룹 선택 후 [승인] → 성공 토스트, 행이 사라짐, `/admin/users`에서 해당 사용자가 `active` + 선택한 그룹으로 보임
- pending 행이 없다면 새 가입 신청 후 검증

서버 중지: 백그라운드 프로세스 종료

- [ ] **Step 5: Commit**

```bash
git add app/(admin)/admin/approvals/ApprovalRow.tsx
git commit -m "feat(admin): group selection on signup approval"
```

---

## Task 6: `setUserGroupAction` — 사후 그룹 변경 액션

**Files:**
- Modify: `lib/actions/admin-users.ts`
- Test: `tests/unit/admin-set-user-group.test.ts`

- [ ] **Step 1: 입력 검증 테스트 작성**

```ts
// tests/unit/admin-set-user-group.test.ts
import { describe, it, expect } from 'vitest';
import { isUserGroup } from '@/lib/auth/user-groups';

describe('setUserGroupAction input validation', () => {
  it('isUserGroup은 group1/group2만 통과시킨다', () => {
    expect(isUserGroup('group1')).toBe(true);
    expect(isUserGroup('group2')).toBe(true);
    expect(isUserGroup('group3')).toBe(false);
    expect(isUserGroup(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 통과하는지 확인**

Run: `pnpm test -- admin-set-user-group.test.ts`
Expected: PASS

- [ ] **Step 3: `admin-users.ts` 끝에 `setUserGroupAction` 추가**

기존 함수 3개(`adjustBalanceAction`, `updateThresholdAction`, `setUserStatusAction`)는 유지하고 아래를 추가한다.

```ts
import { isUserGroup, type UserGroup } from '@/lib/auth/user-groups';
```

(파일 상단 import 블록에 위 줄을 추가)

파일 끝에:

```ts
export async function setUserGroupAction(userId: string, group: UserGroup) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  if (!isUserGroup(group)) return { error: '그룹이 올바르지 않습니다.' };
  if (guard.user.id === userId) return { error: '본인 그룹은 변경할 수 없습니다.' };

  const { data: before, error: readError } = await guard.supabase
    .from('profiles')
    .select('user_group, status, role')
    .eq('id', userId)
    .single<{ user_group: string | null; status: string; role: string }>();

  if (readError || !before) {
    console.error('[admin-users] setGroup read', { userId, error: readError });
    return { error: '사용자를 찾을 수 없습니다.' };
  }
  if (before.status !== 'active' || before.role === 'admin') {
    return { error: '그룹을 변경할 수 없는 사용자입니다.' };
  }
  if (before.user_group === group) {
    return { ok: true }; // 변경 없음
  }

  const { error } = await mutationTable(guard.supabase, 'profiles')
    .update({ user_group: group })
    .eq('id', userId);
  if (error) {
    console.error('[admin-users] setGroup', { userId, error });
    return { error: '그룹을 변경하지 못했습니다.' };
  }
  console.info('[admin-users] group-change', {
    userId,
    before: before.user_group,
    after: group,
    by: guard.user.id,
  });
  revalidatePaths(['/admin/users', `/admin/users/${userId}`]);
  return { ok: true };
}
```

- [ ] **Step 4: typecheck**

Run: `pnpm run typecheck`
Expected: 새 에러 없음

- [ ] **Step 5: Commit**

```bash
git add lib/actions/admin-users.ts tests/unit/admin-set-user-group.test.ts
git commit -m "feat(admin): setUserGroupAction for post-approval group change"
```

---

## Task 7: `GroupChangeForm` UI — 사용자 상세 페이지에 카드 추가

**Files:**
- Create: `app/(admin)/admin/users/[id]/GroupChangeForm.tsx`
- Modify: `app/(admin)/admin/users/[id]/page.tsx`

- [ ] **Step 1: `GroupChangeForm.tsx` 생성**

```tsx
// app/(admin)/admin/users/[id]/GroupChangeForm.tsx
'use client';
import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { setUserGroupAction } from '@/lib/actions/admin-users';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import {
  USER_GROUPS,
  USER_GROUP_LABEL,
  type UserGroup,
} from '@/lib/auth/user-groups';

export function GroupChangeForm({
  userId,
  currentGroup,
  status,
}: {
  userId: string;
  currentGroup: UserGroup | null;
  status: string;
}) {
  const initial: UserGroup = currentGroup ?? 'group1';
  const [selected, setSelected] = useState<UserGroup>(initial);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const isActive = status === 'active';
  const isDirty = selected !== currentGroup;

  function submit() {
    if (!isDirty || !isActive) return;
    start(async () => {
      const r = await setUserGroupAction(userId, selected);
      if ((r as { error?: string }).error) {
        toast({
          title: '실패',
          description: (r as { error: string }).error,
          variant: 'destructive',
        });
      } else {
        toast({ title: '그룹 변경 완료' });
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="h-11 px-4 flex items-center gap-2 border-b">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="font-heading font-semibold text-sm">그룹</h2>
      </header>
      <div className="p-4 space-y-3">
        {!isActive && (
          <p className="text-xs text-muted-foreground">
            승인 후 설정할 수 있습니다.
          </p>
        )}
        <div className="space-y-2">
          {USER_GROUPS.map((g) => (
            <label
              key={g}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="radio"
                name={`group-${userId}`}
                value={g}
                checked={selected === g}
                onChange={() => setSelected(g)}
                disabled={!isActive || pending}
                className="h-4 w-4"
              />
              <span>{USER_GROUP_LABEL[g]}</span>
            </label>
          ))}
        </div>
        <Button
          size="sm"
          onClick={submit}
          disabled={!isActive || pending || !isDirty}
          className="w-full"
        >
          {pending ? '저장 중…' : '변경'}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 사용자 상세 페이지에 카드 삽입**

`app/(admin)/admin/users/[id]/page.tsx`에서 변경 2곳:

**(a) import에 `GroupChangeForm` 추가** — 기존 `BalanceAdjustForm` import 옆에:

```tsx
import { GroupChangeForm } from './GroupChangeForm';
import type { UserGroup } from '@/lib/auth/user-groups';
```

**(b) 기존 3-카드 grid (`<section className="grid grid-cols-1 md:grid-cols-3 gap-4">`)를 4-카드 grid로 변경하되, admin 본인은 GroupChangeForm을 숨김:**

기존:
```tsx
<section className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <BalanceAdjustForm userId={user.id} />
  <ThresholdForm userId={user.id} defaultValue={Number(user.low_balance_threshold)} />
  <UserStatusButtons userId={user.id} status={user.status as UserStatus} />
</section>
```

변경:
```tsx
<section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <BalanceAdjustForm userId={user.id} />
  <ThresholdForm userId={user.id} defaultValue={Number(user.low_balance_threshold)} />
  <UserStatusButtons userId={user.id} status={user.status as UserStatus} />
  {user.role !== 'admin' && (
    <GroupChangeForm
      userId={user.id}
      currentGroup={(user.user_group ?? null) as UserGroup | null}
      status={user.status}
    />
  )}
</section>
```

- [ ] **Step 3: 사용자 상세 페이지가 `user_group` 컬럼을 읽어오는지 확인**

`lib/admin/user-detail.ts`의 `fetchAdminUserDetail`에서 profile select에 `user_group`이 포함되어 있는지 확인. 없다면 select 컬럼 목록에 추가.

Run: `grep -n "from('profiles')" lib/admin/user-detail.ts` (Grep 도구 사용)
profiles select가 `*`을 쓰고 있으면 자동으로 포함됨. 특정 컬럼만 select하고 있다면 `user_group` 추가.

(특정 select라면) profile select 라인을 다음처럼 수정:
```ts
.select('id,name,email,phone,role,status,user_group,deposit_balance,low_balance_threshold,approved_at,created_at')
```

- [ ] **Step 4: typecheck**

Run: `pnpm run typecheck`
Expected: 새 에러 없음. 만약 `user.user_group` 접근에서 타입 에러가 나면 위 Step 3에서 select에 컬럼이 빠진 것 — 추가하고 재실행.

- [ ] **Step 5: 수동 검증**

Run: `pnpm dev` (background)
admin 로그인 → `/admin/users/<active-user-id>` 접속:
- [그룹] 카드가 4번째로 표시되는지 확인
- 라디오로 group1 ↔ group2 변경 → [변경] 활성화 → 클릭 → 성공 토스트
- pending/rejected 사용자에서는 "승인 후 설정할 수 있습니다" 안내 + 라디오 비활성

서버 종료.

- [ ] **Step 6: Commit**

```bash
git add app/(admin)/admin/users/[id]/GroupChangeForm.tsx \
        app/(admin)/admin/users/[id]/page.tsx \
        lib/admin/user-detail.ts
git commit -m "feat(admin): group change card on user detail"
```

---

## Task 8: 관리자 사용자 목록 — 그룹 컬럼 추가

**Files:**
- Modify: `app/(admin)/admin/users/page.tsx`

- [ ] **Step 1: 타입과 표시 추가**

`app/(admin)/admin/users/page.tsx`에서 3곳을 변경:

**(a) `UserRow` 타입에 `user_group` 추가:**
```ts
type UserRow = {
  id: string;
  name: string;
  email: string;
  deposit_balance: number;
  low_balance_threshold: number;
  status: string;
  role: string;
  user_group: string | null;
};
```

**(b) import 블록에 SSOT 라벨 추가:**
```ts
import { USER_GROUP_SHORT_LABEL, isUserGroup } from '@/lib/auth/user-groups';
```

**(c) `<thead>`의 `<tr>` 안 `역할` 헤더 바로 앞에 `그룹` 헤더 셀 추가:**
```tsx
<th className="font-medium px-3">그룹</th>
<th className="font-medium px-3">역할</th>
```

**(d) `<tbody>`의 각 `<tr>`에서 `역할` 셀 직전에 `그룹` 셀 추가:**
```tsx
<td className="px-3">
  {u.role === 'admin' ? (
    <span className="text-xs text-muted-foreground">—</span>
  ) : isUserGroup(u.user_group) ? (
    <StatusPill tone={u.user_group === 'group2' ? 'warning' : 'neutral'}>
      {USER_GROUP_SHORT_LABEL[u.user_group]}
    </StatusPill>
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  )}
</td>
```

기존 `select('*')`가 모든 컬럼을 가져오므로 쿼리는 수정 불필요. 만약 명시적 컬럼 select라면 `user_group` 추가.

- [ ] **Step 2: typecheck**

Run: `pnpm run typecheck`
Expected: 새 에러 없음

- [ ] **Step 3: 수동 검증**

`pnpm dev` (background) → admin 로그인 → `/admin/users`:
- 그룹 컬럼이 표시됨
- group1 사용자는 "1그룹" (neutral pill), group2 사용자는 "2그룹" (warning pill), admin/pending은 "—"

서버 종료.

- [ ] **Step 4: Commit**

```bash
git add app/(admin)/admin/users/page.tsx
git commit -m "feat(admin): group column in users list"
```

---

## Task 9: middleware — group2 라우트 차단

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: `middleware.ts` 전체 교체**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware-client';
import {
  GROUP2_HOME,
  isPathAllowedForGroup2,
} from '@/lib/auth/user-groups';

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/pending',
  '/find-account',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/favicon.ico',
];
const ADMIN_PREFIX = '/admin';

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api/public')) return response;
  if (pathname.startsWith('/api/orders/') && pathname.endsWith('/tracking')) return response;
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return response;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, user_group')
    .eq('id', user.id)
    .single<{ role: string; status: string; user_group: string | null }>();

  if (!profile) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (profile.status !== 'active') {
    const url = request.nextUrl.clone();
    url.pathname = '/pending';
    url.searchParams.set('status', profile.status);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith(ADMIN_PREFIX) && profile.role !== 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = '/shop';
    return NextResponse.redirect(url);
  }

  // group2 라우트 가드: 일반 사용자(admin 제외)이고 group2이면 허용 경로 외 차단
  if (
    profile.role === 'user' &&
    profile.user_group === 'group2' &&
    !pathname.startsWith(ADMIN_PREFIX) &&
    !isPathAllowedForGroup2(pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = GROUP2_HOME;
    return NextResponse.redirect(url);
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname =
      profile.role === 'admin'
        ? '/admin'
        : profile.user_group === 'group2'
          ? GROUP2_HOME
          : '/shop';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: typecheck**

Run: `pnpm run typecheck`
Expected: 새 에러 없음

- [ ] **Step 3: 수동 검증 — group2 사용자 흐름**

준비: admin으로 `/admin/users/<some-user-id>`에서 한 명을 `group2`로 변경.

```
pnpm dev (background)
```

해당 사용자 계정으로 로그인:
- `/` 접속 → `/shipping-uploads/purchased`로 리다이렉트
- `/shop` 접속 → `/shipping-uploads/purchased`로 리다이렉트
- `/cart` 접속 → `/shipping-uploads/purchased`로 리다이렉트
- `/orders` 접속 → `/shipping-uploads/purchased`로 리다이렉트
- `/deposit` 접속 → `/shipping-uploads/purchased`로 리다이렉트
- `/inventory` 접속 → `/shipping-uploads/purchased`로 리다이렉트
- `/shipping-uploads/exitmall` 접속 → `/shipping-uploads/purchased`로 리다이렉트
- `/shipping-uploads/purchased` 접속 → 정상 통과
- `/inbound-requests` 접속 → 정상 통과
- `/account/password` 접속 → 정상 통과
- `/admin` 접속 → `/shop`으로 리다이렉트(role 가드, 이후 group2 가드로 GROUP2_HOME으로) — 최종적으로 `GROUP2_HOME`에 도달

group1 사용자 흐름은 모든 기존 메뉴가 정상이어야 한다.

서버 종료.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): middleware group2 route guard and root branching"
```

---

## Task 10: `NavUser` — 메뉴를 그룹별로 필터링

**Files:**
- Modify: `components/NavUser.tsx`

- [ ] **Step 1: `NavUser.tsx`에 그룹 필드와 props 추가**

`components/NavUser.tsx`를 다음 내용으로 교체한다.

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  Wallet,
  ShoppingBag,
  ClipboardList,
  Package,
  LogOut,
  Upload,
  KeyRound,
  Boxes,
  Inbox,
} from 'lucide-react';
import { InboundUnreadBadge } from '@/components/inbound/InboundUnreadBadge';
import type { UserGroup } from '@/lib/auth/user-groups';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type NavItem = {
  href: string;
  label: string;
  Icon: typeof Package;
  exact?: boolean;
  groups: readonly UserGroup[];
};

const NAV: readonly NavItem[] = [
  { href: '/shop', label: '상품', Icon: Package, groups: ['group1'] },
  { href: '/cart', label: '장바구니', Icon: ShoppingBag, groups: ['group1'] },
  { href: '/orders', label: '주문 내역', Icon: ClipboardList, exact: true, groups: ['group1'] },
  { href: '/inventory', label: '보유 재고', Icon: Boxes, groups: ['group1'] },
  { href: '/shipping-uploads/exitmall', label: '엑시트몰 배송대행', Icon: Upload, groups: ['group1'] },
  { href: '/shipping-uploads/purchased', label: '사입재고 배송대행', Icon: Upload, groups: ['group1', 'group2'] },
  { href: '/inbound-requests', label: '입고리스트', Icon: Inbox, groups: ['group1', 'group2'] },
  { href: '/deposit', label: '예치금', Icon: Wallet, groups: ['group1'] },
];

export function NavUser({
  balance,
  name,
  inboundUnread,
  userGroup,
}: {
  balance: number;
  name: string;
  inboundUnread: number;
  userGroup: UserGroup;
}) {
  const pathname = usePathname();
  const initial = (name || 'U').charAt(0).toUpperCase();
  const visibleNav = NAV.filter((item) => item.groups.includes(userGroup));
  const isGroup2 = userGroup === 'group2';
  const homeHref = isGroup2 ? '/shipping-uploads/purchased' : '/shop';

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl h-16 px-4 lg:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href={homeHref} className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary grid place-items-center">
              <span className="text-primary-foreground text-xs font-heading font-semibold">E</span>
            </div>
            <span className="font-heading font-semibold tracking-tight hidden sm:inline">엑시트몰</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {visibleNav.map(({ href, label, Icon, exact }) => {
              const active = exact
                ? pathname === href
                : pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 h-9 rounded-md text-sm transition-colors duration-150',
                    active
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {href === '/inbound-requests' && (
                      <InboundUnreadBadge role="user" initial={inboundUnread} />
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {!isGroup2 && (
            <div
              className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent/10 text-accent"
              aria-label={`보유 예치금 ${formatKRW(balance)}`}
            >
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono text-sm tabular">{formatKRW(balance)}</span>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 h-9 px-1.5 rounded-md hover:bg-muted transition-colors"
                aria-label="계정"
              >
                <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-medium">
                  {initial}
                </span>
                <span className="hidden sm:inline text-sm text-muted-foreground max-w-[140px] truncate">{name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{name}</p>
                {!isGroup2 && (
                  <p className="text-xs text-muted-foreground sm:hidden font-mono tabular mt-0.5">
                    {formatKRW(balance)}
                  </p>
                )}
              </div>
              <DropdownMenuSeparator />
              {!isGroup2 && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/deposit">예치금 관리</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/orders">주문 내역</Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem asChild>
                <Link href="/account/password">
                  <KeyRound className="h-4 w-4" aria-hidden />
                  <span>비밀번호 변경</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full cursor-pointer">
                    <LogOut className="h-4 w-4" aria-hidden />
                    <span>로그아웃</span>
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* mobile bottom strip for primary nav */}
      <nav className="md:hidden border-t">
        <ul className="mx-auto max-w-7xl px-2 flex">
          {visibleNav.map(({ href, label, Icon, exact }) => {
            const active = exact
              ? pathname === href
              : pathname === href || pathname.startsWith(href + '/');
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 h-12 text-[11px] transition-colors',
                    active ? 'text-foreground font-medium' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {href === '/inbound-requests' && (
                      <InboundUnreadBadge role="user" initial={inboundUnread} />
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: typecheck (`(user)/layout.tsx`가 새 prop 누락으로 에러 예상)**

Run: `pnpm run typecheck`
Expected: `NavUser`에 `userGroup` prop 누락 에러 1건 — Task 11에서 해결. 다른 에러 없어야 한다.

- [ ] **Step 3: Commit (아직 layout 미반영이지만 NavUser 단일 변경으로 묶어 커밋해도 무방. 다음 task에서 함께 묶으려면 보류)**

이 task는 다음 Task와 짝이라 보류하고 Task 11과 함께 커밋한다. 별도 커밋 안 함.

---

## Task 11: 사용자 레이아웃 — `user_group` 조회 + `NavUser`에 전달

**Files:**
- Modify: `app/(user)/layout.tsx`

- [ ] **Step 1: `app/(user)/layout.tsx` 수정**

profile select에 `user_group` 추가하고 `NavUser`에 전달. group2 사용자에게는 `LowBalanceBanner` 숨김.

기존 코드의 변경 포인트:

**(a) profile select**:

기존:
```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('name,deposit_balance,low_balance_threshold')
  .eq('id', user.id)
  .single<{ name: string; deposit_balance: number; low_balance_threshold: number }>();
```

변경:
```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('name,deposit_balance,low_balance_threshold,user_group')
  .eq('id', user.id)
  .single<{
    name: string;
    deposit_balance: number;
    low_balance_threshold: number;
    user_group: string | null;
  }>();
```

**(b) 그룹 정규화 (NULL 안전망: group1로 취급)**:

profile null 체크 이후 다음 줄을 추가:
```ts
const userGroup: 'group1' | 'group2' =
  profile.user_group === 'group2' ? 'group2' : 'group1';
const isGroup2 = userGroup === 'group2';
```

**(c) `NavUser` 호출에 prop 추가**:

```tsx
<NavUser
  balance={Number(profile.deposit_balance)}
  name={profile.name}
  inboundUnread={inboundUnread}
  userGroup={userGroup}
/>
```

**(d) `LowBalanceBanner`는 group1만**:

```tsx
{!isGroup2 && (
  <LowBalanceBanner
    balance={Number(profile.deposit_balance)}
    threshold={Number(profile.low_balance_threshold)}
  />
)}
```

(선택 최적화) cartLimits 계산은 그대로 둬도 무방. group2가 `/cart`로 못 가니 비용은 한 번의 쿼리만 추가. 작업 범위 줄이려면 그대로 둔다.

- [ ] **Step 2: typecheck**

Run: `pnpm run typecheck`
Expected: 새 에러 없음 (Task 10의 prop 누락 에러 해소)

- [ ] **Step 3: 수동 검증**

`pnpm dev` (background) → group1 사용자 로그인:
- 메뉴 8개 모두 표시
- 예치금 칩, LowBalanceBanner 정상

→ group2 사용자 로그인:
- 데스크탑 nav에 `사입재고 배송대행`, `입고리스트` 2개만 표시
- 모바일 하단 nav도 동일
- 예치금 칩 숨김, LowBalanceBanner 숨김
- 우측 드롭다운에 "예치금 관리"/"주문 내역" 없음, "비밀번호 변경"/"로그아웃"은 있음
- 로고 클릭 시 `/shipping-uploads/purchased`로 이동

서버 종료.

- [ ] **Step 4: Commit (Task 10 + 11 한 번에)**

```bash
git add components/NavUser.tsx app/(user)/layout.tsx
git commit -m "feat(nav): filter user nav by group and hide group1-only chrome"
```

---

## Task 12: group1 전용 server action 보호 — `requireUserGroup1` 적용

**Files:**
- Modify: `lib/actions/order.ts`
- Modify: `lib/actions/stock-order.ts`
- Modify: `lib/actions/deposit.ts`

라우트 가드를 우회한 직접 HTTP 호출을 막기 위해 group1 전용 액션 5개에 가드를 추가한다.

### 12-A. `lib/actions/order.ts`

- [ ] **Step 1: `placeOrderAction`, `cancelOrderAction`에 가드 추가**

상단 import에 추가:
```ts
import { requireUserGroup1 } from '@/lib/actions/_guards';
```

`placeOrderAction` 본문 첫 줄(zod parse 후, supabase 생성 직전)에 추가:
```ts
const guard = await requireUserGroup1();
if (!guard.ok) return { ok: false, error: guard.error };
```

그리고 기존 `const supabase = createClient();` 줄을 다음으로 교체:
```ts
const supabase = guard.supabase;
```

`cancelOrderAction`에서도 동일 패턴:

기존:
```ts
export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  const supabase = createClient();
  ...
}
```

변경:
```ts
export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  const guard = await requireUserGroup1();
  if (!guard.ok) return { ok: false, error: guard.error };
  const supabase = guard.supabase;
  ...
}
```

(기존 `import { createClient } from '@/lib/supabase/server';`는 더 이상 사용되지 않으면 제거. typecheck 시 unused import 경고가 뜨면 삭제.)

### 12-B. `lib/actions/stock-order.ts`

- [ ] **Step 2: `requestStockOrderAction`, `cancelStockOrderAction`에 동일 패턴 적용**

상단 import에 `requireUserGroup1` 추가. 각 함수의 supabase 생성 부분을 가드+`guard.supabase`로 교체.

`requestStockOrderAction` 본문에서 (zod parse 이후, supabase 생성 직전):
```ts
const guard = await requireUserGroup1();
if (!guard.ok) return { ok: false, error: guard.error };
const supabase = guard.supabase;
```

`cancelStockOrderAction`도 supabase 생성 직전에 동일 가드 삽입 + `supabase = guard.supabase`. 반환 타입이 다르면 `return { ok: false, error: guard.error }` 형태에 맞춘다 (기존 반환 모양을 그대로 따른다 — 보통 `{ error: string }` 형태).

> 참고: 기존 코드를 열어 정확한 반환 모양(`{ ok: false, error }` vs `{ error }`)을 따른다. 잘못 맞추면 호출부에서 타입 에러가 난다.

### 12-C. `lib/actions/deposit.ts`

- [ ] **Step 3: `createDepositRequestAction`에 가드 추가**

상단 import에 추가:
```ts
import { requireUserGroup1 } from '@/lib/actions/_guards';
```

기존:
```ts
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: '로그인이 필요합니다' };
```

변경:
```ts
const guard = await requireUserGroup1();
if (!guard.ok) return { error: guard.error };
const supabase = guard.supabase;
const user = guard.user;
```

(unused `createClient` import는 제거)

### 12-D. typecheck + 검증

- [ ] **Step 4: typecheck**

Run: `pnpm run typecheck`
Expected: 새 에러 없음

- [ ] **Step 5: 수동 검증 — group2 사용자가 직접 액션 호출을 시도해도 거부**

`pnpm dev` (background) → group2 사용자로 로그인 → 브라우저 콘솔에서:
```js
fetch('/cart', { method: 'GET' })
```
이건 미들웨어가 막음 (redirect 메모리).

서버 액션은 일반 fetch로 호출 어렵지만, 만약 호출됐을 때 `error: '이 기능을 사용할 권한이 없습니다.'` 메시지가 반환되는지 확인하려면 React DevTools에서 일시적으로 group2 사용자에게 group1 화면을 마운트해 액션을 호출하는 변칙 테스트는 생략 가능. **typecheck + 코드 리뷰로 충분.**

대신 group1 사용자에서 정상 동작은 반드시 검증:
- group1 계정으로 로그인 → `/shop`에서 상품 담아 `/cart` → 체크아웃 → 주문 성공
- `/deposit`에서 입금 요청 → 성공
- (stock-order는 admin이 만든 후 사용자가 사입 신청 흐름; 환경에 따라 검증 가능)

서버 종료.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/order.ts lib/actions/stock-order.ts lib/actions/deposit.ts
git commit -m "feat(auth): gate group1-only server actions (order/stock-order/deposit)"
```

---

## 최종 검증

- [ ] **Step 1: 전체 테스트 실행**

Run: `pnpm test`
Expected: 모든 테스트 통과 (기존 + 신규 3개 파일).

- [ ] **Step 2: 전체 typecheck**

Run: `pnpm run typecheck`
Expected: 에러 없음

- [ ] **Step 3: 빌드 시도**

Run: `pnpm run build`
Expected: 성공

- [ ] **Step 4: 수동 E2E 시나리오**

| 시나리오 | 기대 |
|---|---|
| 새 가입 → admin 승인 화면에서 group 미선택으로 [승인] 클릭 | 버튼 비활성 |
| 새 가입 → admin이 group2 선택해 [승인] | 사용자 active + user_group=group2 |
| group2 사용자가 로그인 | `/shipping-uploads/purchased`로 이동, 메뉴 2개만 |
| group2 사용자가 URL로 `/shop` 호출 | `/shipping-uploads/purchased`로 redirect |
| group2 사용자가 `/inbound-requests` 호출 | 정상 표시 |
| admin이 사용자 상세에서 group2 → group1로 변경 | 변경 성공, 다음 페이지 로드부터 메뉴 전체 노출 |
| admin이 본인 그룹 변경 시도 | "본인 그룹은 변경할 수 없습니다" |
| 기존 active 사용자(group1) | 메뉴/기능 변화 없음 |

---

## Self-Review 체크리스트 (구현자가 마지막에 직접 확인)

1. **Spec 13개 섹션 커버리지**: 데이터 모델(Task 1), SSOT(Task 2), 가드 헬퍼(Task 3), 승인(Tasks 4-5), 그룹 변경(Tasks 6-7), 목록(Task 8), middleware(Task 9), NavUser/layout(Tasks 10-11), 액션 보호(Task 12). 감사 로그는 console.info로 Task 4, 6에 포함됨.
2. **`addToCartAction`은 스펙에 언급됐지만 실제 코드에는 없는 가공의 액션이라 게이트 대상에서 제외**. Cart는 client-side(CartProvider/localStorage).
3. `shipping-upload` 액션은 exitmall/purchased 공유이므로 게이트 대상 아님 — 라우트 가드만으로 보호.
4. 기존 active 사용자는 마이그레이션에서 `group1`로 백필 → 행동 변화 없음.

---

## Notes

- 이 플랜은 단일 PR로 묶을 분량. 작업 시 Task별 커밋을 유지하면 리뷰가 쉽다.
- `pnpm` 가정. 환경이 `npm`이면 명령어의 `pnpm`을 `npm run`/`npx`로 치환.
- 마이그레이션 파일명 `20260514000001_user_groups.sql`는 같은 날 다른 마이그레이션이 추가됐다면 타임스탬프 충돌을 피해 끝자리 숫자를 올려라.
- shadcn `Select` 컴포넌트는 이미 `package.json`에 `@radix-ui/react-select`가 있어 `components/ui/select.tsx`가 존재한다는 가정. 없으면 `pnpm dlx shadcn@latest add select`로 추가.
