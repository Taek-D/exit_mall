# 사용자 그룹 (User Groups) 설계

- **작성일**: 2026-05-14
- **상태**: Draft → Approved (사용자 검토 후 확정)
- **관련 영역**: profiles, admin approvals, admin users, middleware, user navigation

## 1. 배경 및 목표

현재 엑시트몰 사용자는 `profiles.role`(user/admin)과 `profiles.status`(pending/active/suspended/rejected)로만 분류된다. 모든 active user는 동일한 메뉴 8개에 접근 가능하다.

**목표:** 사용자를 두 그룹으로 나눠 일부 사용자에게는 "배송대행 + 입고리스트"만 노출한다.

- **1그룹 (`group1`, 엑시트몰 전체)**: 현행 모든 기능 사용 가능
- **2그룹 (`group2`, 배송대행 전용)**: `사입재고 배송대행`, `입고리스트` 두 메뉴 + 계정(비밀번호 변경/로그아웃)만 사용 가능

그룹은 가입 신청 시점이 아닌 **관리자 승인 시점**에 관리자가 선택해 부여한다. 승인 후에도 관리자가 변경 가능해야 한다.

## 2. 접근 방식

**옵션 A (Minimal): `profiles`에 단일 컬럼 추가 + middleware 라우트 가드 + NavUser 메뉴 필터 + 일부 server action 그룹 가드.** RLS는 손대지 않는다.

채택 이유: 변경 범위가 작고, 기존 RLS(본인 데이터만 접근)가 이미 데이터 유출을 방지하고 있어 라우트/액션 가드만 추가해도 충분하다. 향후 그룹 추가(`group3` 등)는 check 제약 확장만으로 가능.

## 3. 데이터 모델

`profiles` 테이블에 컬럼 1개 추가.

```sql
-- supabase/migrations/<timestamp>_user_groups.sql

alter table public.profiles
  add column user_group text
    check (user_group in ('group1','group2'));

create index profiles_user_group_idx on public.profiles (user_group);

-- 기존 active 사용자 백필 (전원 1그룹)
update public.profiles
   set user_group = 'group1'
 where status = 'active'
   and user_group is null;
```

**비즈니스 규칙 (애플리케이션 레이어에서 강제):**

- `status='pending'` (가입 신청 직후) → `user_group IS NULL`
- 승인 액션 시 `user_group`을 `group1` 또는 `group2`로 함께 set → `status='active'`이면 `user_group`은 NOT NULL
- 반려 시 `user_group`은 NULL인 채로 `status='rejected'`
- SQL CHECK 제약으로 "active ⇒ user_group NOT NULL"을 강제하지 않는 이유: 마이그레이션 시점/임시 상태에서 유연성을 확보하기 위함. 액션 단에서 검증.

## 4. 접근 제어 매트릭스

| 라우트 (prefix) | UI 라벨 | group1 | group2 |
|---|---|---|---|
| `/shop` | 상품 | ✅ | ❌ |
| `/cart` | 장바구니 | ✅ | ❌ |
| `/orders` | 주문 내역 | ✅ | ❌ |
| `/inventory` | 보유 재고 | ✅ | ❌ |
| `/shipping-uploads/exitmall` | 엑시트몰 배송대행 | ✅ | ❌ |
| `/shipping-uploads/purchased` | 사입재고 배송대행 | ✅ | ✅ |
| `/inbound-requests` | 입고리스트 | ✅ | ✅ |
| `/deposit` | 예치금 | ✅ | ❌ |
| `/account/**` | 계정 (비밀번호 변경) | ✅ | ✅ |
| `/admin/**` | 관리자 | admin only | admin only |

**SSOT (Single Source of Truth):** `lib/auth/user-groups.ts` 신규 파일

```ts
export type UserGroup = 'group1' | 'group2';

export const USER_GROUP_LABEL: Record<UserGroup, string> = {
  group1: '1그룹 (엑시트몰 전체)',
  group2: '2그룹 (배송대행 전용)',
};

export const GROUP2_ALLOWED_PREFIXES = [
  '/shipping-uploads/purchased',
  '/inbound-requests',
  '/account',
] as const;

export const GROUP2_HOME = '/shipping-uploads/purchased';

export function isPathAllowedForGroup2(pathname: string): boolean {
  return GROUP2_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}
```

향후 `/account` 하위에 group1 전용 페이지가 생기면 prefix를 좁힌다.

## 5. 라우트 가드

### 5.1 `middleware.ts`

`profile` 조회 컬럼에 `user_group` 추가하고, admin 가드 다음에 group2 차단 로직 추가.

```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('role, status, user_group')
  .eq('id', user.id)
  .single<{ role: string; status: string; user_group: string | null }>();

// ... 기존 status/admin 가드 ...

// group2 라우트 가드
if (
  profile.role === 'user' &&
  profile.user_group === 'group2' &&
  !isPathAllowedForGroup2(pathname)
) {
  const url = request.nextUrl.clone();
  url.pathname = GROUP2_HOME;
  return NextResponse.redirect(url);
}

// 루트 분기 (그룹 반영)
if (pathname === '/') {
  const url = request.nextUrl.clone();
  url.pathname =
    profile.role === 'admin' ? '/admin'
      : profile.user_group === 'group2' ? GROUP2_HOME
      : '/shop';
  return NextResponse.redirect(url);
}
```

`user_group IS NULL`이지만 `status='active'`인 비정상 케이스(있으면 안 됨)는 group1처럼 통과시킨다 — 안전 장치는 백필.

### 5.2 `components/NavUser.tsx`

`NAV` 배열의 각 항목에 `groups: ('group1'|'group2')[]` 필드 추가. props로 `userGroup` 받아 필터링.

```ts
const NAV = [
  { href: '/shop', label: '상품', Icon: Package, groups: ['group1'] },
  { href: '/cart', label: '장바구니', Icon: ShoppingBag, groups: ['group1'] },
  { href: '/orders', label: '주문 내역', Icon: ClipboardList, groups: ['group1'], exact: true },
  { href: '/inventory', label: '보유 재고', Icon: Boxes, groups: ['group1'] },
  { href: '/shipping-uploads/exitmall', label: '엑시트몰 배송대행', Icon: Upload, groups: ['group1'] },
  { href: '/shipping-uploads/purchased', label: '사입재고 배송대행', Icon: Upload, groups: ['group1','group2'] },
  { href: '/inbound-requests', label: '입고리스트', Icon: Inbox, groups: ['group1','group2'] },
  { href: '/deposit', label: '예치금', Icon: Wallet, groups: ['group1'] },
] as const;

const visibleNav = NAV.filter(item => item.groups.includes(userGroup ?? 'group1'));
```

데스크탑 nav와 모바일 하단 nav 모두 `visibleNav`를 사용.

### 5.3 `app/(user)/layout.tsx`

- `profile` 쿼리에 `user_group` 추가
- `<NavUser userGroup={profile.user_group}>` 전달
- group2 사용자에게는 `<LowBalanceBanner>` 숨김 (예치금 무관)
- `cartLimits` 계산용 `products`/`purchased` 쿼리는 group2 사용자에 대해 생략 가능 (선택적 최적화)

## 6. 가입 승인 UI + 그룹 변경 UI

### 6.1 `/admin/approvals` — `ApprovalRow` 변경

각 행에 그룹 선택 드롭다운(`Select`) 추가. [승인] 버튼은 그룹 선택 전까지 disabled.

```
[아바타] 홍길동
        hong@example.com · 010-1234-5678
        2026-05-14 10:23
        [ 그룹 선택 ▼ ]  [✓ 승인]  [✗ 반려]
```

- 그룹 옵션: `1그룹 (엑시트몰 전체)`, `2그룹 (배송대행 전용)`
- 기본값 미선택 (placeholder = "그룹 선택")
- [반려]는 그룹과 무관하게 동작 (기존과 동일)
- 행 단위 로컬 상태(`useState`)로 선택 보존

### 6.2 액션 시그니처 변경 — `lib/actions/admin-approvals.ts`

```ts
import type { UserGroup } from '@/lib/auth/user-groups';

export async function approveUserAction(userId: string, group: UserGroup) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  if (group !== 'group1' && group !== 'group2') {
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
  console.info('[admin-approvals] approved', { userId, group, by: guard.user.id });
  revalidatePaths(['/admin/approvals', '/admin/users', '/admin']);
  return { ok: true };
}
```

`rejectUserAction`은 변경 없음.

### 6.3 `/admin/users` 목록 — 그룹 컬럼 추가

테이블 헤더에 `그룹` 컬럼 추가, 표시:

| 이름 | 이메일 | 잔액 | 임계치 | 상태 | **그룹** | 역할 |
|---|---|---|---|---|---|---|

- `group1` → "1그룹" (기본 톤)
- `group2` → "2그룹" (`StatusPill tone="warning"` 등으로 시각 구분)
- NULL 또는 admin → "—"

선택: 좌측 탭에 `2그룹` 필터 추가 (기존 패턴 따라).

### 6.4 `/admin/users/[id]` 상세 — `GroupChangeForm` 카드 추가

기존 `BalanceAdjustForm`, `ThresholdForm`, `UserStatusButtons` 옆에 4번째 카드.

```
┌─ 그룹 ──────────────────────────────────┐
│ 현재: 1그룹 (엑시트몰 전체)              │
│  ○ 1그룹 (엑시트몰 전체)                 │
│  ○ 2그룹 (배송대행 전용)                 │
│              [ 변경 ]                    │
└──────────────────────────────────────────┘
```

- 라디오 그룹 + [변경] 버튼
- 현재 값과 동일하면 [변경] disabled
- `status !== 'active'`이면 카드 전체 비활성 + "승인 후 설정 가능" 안내
- `role === 'admin'`이면 카드 자체를 렌더하지 않음

액션 — `lib/actions/admin-users.ts`에 추가:

```ts
export async function setUserGroupAction(userId: string, group: UserGroup) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  if (group !== 'group1' && group !== 'group2') {
    return { error: '그룹이 올바르지 않습니다.' };
  }

  // 변경 전 값 로그용 조회
  const { data: before } = await guard.supabase
    .from('profiles').select('user_group, status, role').eq('id', userId).single();
  if (!before || before.status !== 'active' || before.role === 'admin') {
    return { error: '그룹을 변경할 수 없는 사용자입니다.' };
  }

  const { error } = await mutationTable(guard.supabase, 'profiles')
    .update({ user_group: group })
    .eq('id', userId);

  if (error) {
    console.error('[admin-users] group-change', { userId, error });
    return { error: '그룹을 변경하지 못했습니다.' };
  }
  console.info('[admin-users] group-change', {
    userId, before: before.user_group, after: group, by: guard.user.id,
  });
  revalidatePaths(['/admin/users', `/admin/users/${userId}`]);
  return { ok: true };
}
```

### 6.5 사용자 본인 화면

본인 화면에서 자기 그룹을 표시하지 않는다. 메뉴 자체가 필터되어 있어 자명함. (YAGNI)

## 7. Server Action 보안 (group1 전용 액션 가드)

라우트 가드만으로는 사용자가 직접 server action을 호출하는 케이스를 막지 못한다. 다음 액션들에 group1 가드 추가:

| 액션 | 위치 | 가드 추가 이유 |
|---|---|---|
| `addToCartAction`, `placeOrderAction` | `lib/actions/order.ts` 등 | group1 전용 주문 흐름 |
| `createDepositRequestAction` | `lib/actions/deposit.ts` | group2는 예치금 흐름 없음 |
| 엑시트몰 배송대행 관련 액션 | `lib/actions/shipping-upload.ts` (exitmall 흐름) | group1 전용 |

`lib/actions/_guards.ts`에 헬퍼 추가:

```ts
export async function requireUserGroup1() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles').select('status, user_group, role').eq('id', user.id)
    .single<{ status: string; user_group: string | null; role: string }>();

  if (!profile || profile.status !== 'active') {
    return { ok: false as const, error: '계정 상태가 올바르지 않습니다.' };
  }
  if (profile.role !== 'admin' && profile.user_group !== 'group1') {
    return { ok: false as const, error: '이 기능을 사용할 권한이 없습니다.' };
  }
  return { ok: true as const, supabase, user, profile };
}
```

사입재고 배송대행(`shipping-upload purchased` 흐름)과 입고리스트 액션, 계정/비밀번호 액션은 가드 없음(또는 기존 `requireUser`만).

**주의:** 기존 `requireUser`류 가드가 어떤 이름으로 어디에 있는지 실제 코드에 맞춰 구현 단계에서 매칭한다. 없으면 인라인으로 비슷한 패턴을 따른다.

## 8. 감사 로그

별도 감사 테이블은 만들지 않는다. `console.info` 한 줄로 Vercel 로그에 기록:

- 승인: `[admin-approvals] approved { userId, group, by }`
- 그룹 변경: `[admin-users] group-change { userId, before, after, by }`

향후 정식 감사 테이블이 필요해지면 별도 마일스톤에서 도입.

## 9. 엣지케이스

| 케이스 | 처리 |
|---|---|
| group2 사용자의 장바구니에 (이전 group1 시절) 상품이 남음 | `/cart` 접근 자체가 불가 → 무영향 |
| group1 → group2 변경 시 진행 중 주문/예치금 | 데이터 유지. 본인은 못 보지만 관리자 페이지에서 처리 |
| group1 → group2 변경 시 보유 재고 | 데이터 유지. 배송대행 백엔드가 자동 차감 |
| group2 사용자가 `/login` 후 자동 이동 | middleware의 `/` 분기에서 `GROUP2_HOME`으로 |
| 즐겨찾기로 `/shop` 직접 호출 | middleware가 `GROUP2_HOME`으로 redirect |
| `user_group IS NULL` + `status='active'` (비정상) | middleware는 group1처럼 통과. 백필이 안전망 |
| `pending` 상태 그룹 변경 시도 | UI 비활성 + 액션이 status 검증 후 reject |
| 그룹 변경 직후 페이지 이동 | middleware는 매 요청 fresh 조회 → 즉시 반영 |

## 10. 테스트 계획

- **마이그레이션 검증**: 기존 active 사용자 전원 `group1` 백필
- **middleware 단위 테스트** (가능한 범위에서):
  - group2가 `/shop`, `/cart`, `/orders`, `/inventory`, `/shipping-uploads/exitmall`, `/deposit` 접근 → `/shipping-uploads/purchased`로 redirect
  - group2가 `/shipping-uploads/purchased`, `/inbound-requests`, `/account/password` 접근 → 통과
  - group2가 `/` 접근 → `GROUP2_HOME` redirect
- **`approveUserAction`**:
  - 그룹 미선택(undefined/invalid) → reject
  - 정상 케이스 → `status='active'`, `user_group=group1|group2` 동시 set
- **`setUserGroupAction`**:
  - 비관리자 호출 → reject
  - pending 사용자에 호출 → reject
  - 정상 케이스
- **`requireUserGroup1`** 가드: group2 사용자가 `addToCart` 호출 → reject

E2E 테스트는 현행 코드베이스에 없어 보이므로 unit/integration 중심.

## 11. 구현 변경 범위

신규/수정 파일:

- `supabase/migrations/<timestamp>_user_groups.sql` (신규)
- `lib/auth/user-groups.ts` (신규)
- `lib/actions/_guards.ts` (`requireUserGroup1` 추가)
- `middleware.ts`
- `components/NavUser.tsx`
- `app/(user)/layout.tsx`
- `app/(admin)/admin/approvals/page.tsx` (필요 시 데이터 타입)
- `app/(admin)/admin/approvals/ApprovalRow.tsx`
- `lib/actions/admin-approvals.ts` (시그니처 변경)
- `app/(admin)/admin/users/page.tsx` (컬럼 추가)
- `app/(admin)/admin/users/[id]/page.tsx` (카드 추가)
- `app/(admin)/admin/users/[id]/GroupChangeForm.tsx` (신규)
- `lib/actions/admin-users.ts` (`setUserGroupAction` 추가)
- group1 전용 액션들 (`order`, `deposit`, `shipping-upload` exitmall 흐름) — 가드 1줄씩 추가
- 테스트 파일 (`tests/unit/` 신규)

## 12. 채택하지 않은 대안

- **옵션 B (라우트 + RLS)**: RLS에 그룹 조건 추가. 현재 RLS가 이미 본인 데이터로 제한하므로 추가 이득이 적고, RLS 변경은 회귀 위험. 라우트/액션 가드면 충분.
- **옵션 C (별도 권한 매트릭스 테이블)**: `user_groups` + `group_permissions(menu_key)` 분리. 지금 요구사항(고정 2그룹)에 과함. 메뉴 단위 권한 세분화가 실제로 필요해지면 그때 도입.
- **공식 감사 테이블**: 지금은 console 로그로 충분. 컴플라이언스 요구가 생기면 별도로.

## 13. 미해결 사항 (없음)

설계 시점 기준 모든 결정사항 확정.
