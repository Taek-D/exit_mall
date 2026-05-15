# 사용자/관리자 가이드북 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 엑시트몰에 앱 내장 가이드북(`/guide`, `/admin/guide`)과 관리자 편집 가능한 FAQ를 추가한다.

**Architecture:**
입문 가이드 본문은 사용자 그룹(group1/group2)별/관리자별로 분리된 TSX 컴포넌트로 작성하고, FAQ는 `faqs` 테이블 + 관리자 UI로 관리한다. 첫 로그인 시 dismissible 배너를 1회 노출해 가이드로 유도한다. RLS로 사용자/관리자 audience 분리, group1/group2 노출 분리를 enforce한다.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui, Supabase, Zod, react-markdown (+ remark-gfm, rehype-sanitize), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-15-guidebook-design.md`

---

## File Structure (생성/수정 매핑)

### Create
- `supabase/migrations/20260515000001_guide_banner_and_faqs.sql` — 컬럼·테이블·RLS·트리거
- `lib/guide/categories.ts` — 카테고리 enum + 한글 label
- `lib/guide/markdown.tsx` — 안전한 markdown 렌더링 컴포넌트
- `lib/guide/schemas.ts` — Zod 스키마 (FAQ 입력 검증)
- `lib/guide/faqs.ts` — 조회 + server actions (create/update/delete)
- `lib/guide/banner.ts` — `dismissGuideBanner` server action
- `app/(user)/guide/page.tsx`
- `app/(user)/guide/faq/page.tsx`
- `app/(admin)/admin/guide/page.tsx`
- `app/(admin)/admin/guide/faq/page.tsx`
- `app/(admin)/admin/guide/faq/manage/page.tsx`
- `app/(admin)/admin/guide/faq/manage/new/page.tsx`
- `app/(admin)/admin/guide/faq/manage/[id]/edit/page.tsx`
- `components/guide/Group1Guide.tsx`
- `components/guide/Group2Guide.tsx`
- `components/guide/AdminGuide.tsx`
- `components/guide/GuideSection.tsx`
- `components/guide/GuideTOC.tsx`
- `components/guide/FaqAnswer.tsx`
- `components/guide/FaqItem.tsx`
- `components/guide/FaqList.tsx`
- `components/guide/FaqEditor.tsx`
- `components/guide/GuideBanner.tsx`
- `scripts/seed-faqs.ts`
- Tests:
  - `tests/lib/guide/categories.test.ts`
  - `tests/lib/guide/schemas.test.ts`
  - `tests/lib/guide/faqs.test.ts`
  - `tests/lib/guide/markdown.test.tsx`
  - `tests/e2e/guide-user.spec.ts`
  - `tests/e2e/guide-admin.spec.ts`

### Modify
- `package.json` — `react-markdown`, `remark-gfm`, `rehype-sanitize` 추가
- `lib/auth/user-groups.ts` — `GROUP2_ALLOWED_PREFIXES`에 `/guide` 추가
- `components/NavUser.tsx` — "가이드" 메뉴 항목 추가
- `components/AdminSidebar.tsx` — "관리자 가이드", "FAQ 관리" 메뉴 항목 추가
- `components/MobileAdminNav.tsx` — 동일하게 모바일 메뉴 추가
- `app/(user)/layout.tsx` — `<GuideBanner />` 통합
- `app/(admin)/admin/layout.tsx` — `<GuideBanner />` 통합

---

## Phase 1 — DB & Library Foundation

### Task 1: Migration — `guide_banner_dismissed_at` + `faqs` 테이블

**Files:**
- Create: `supabase/migrations/20260515000001_guide_banner_and_faqs.sql`

- [ ] **Step 1: 기존 `set_updated_at` 트리거 함수 확인**

Run:
```bash
Get-ChildItem supabase/migrations | Select-String -Pattern "create.*function.*set_updated_at" -CaseSensitive:$false
```
Expected: 기존 마이그레이션에 함수가 정의되어 있어야 함. 없으면 이번 마이그레이션에 정의 포함.

- [ ] **Step 2: 마이그레이션 파일 작성**

Create `supabase/migrations/20260515000001_guide_banner_and_faqs.sql`:
```sql
-- 1. profiles에 가이드 안내 배너 dismiss 시각 추가
alter table public.profiles
  add column guide_banner_dismissed_at timestamptz null;

comment on column public.profiles.guide_banner_dismissed_at is
  '가이드 안내 배너를 닫은 시각. NULL이면 다음 진입 시 1회 노출.';

-- 2. faqs 테이블
create table public.faqs (
  id          uuid primary key default gen_random_uuid(),
  audience    text not null check (audience in ('user', 'admin')),
  user_groups text[] null,
  category    text not null,
  question    text not null,
  answer      text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid not null references auth.users(id),
  updated_by  uuid not null references auth.users(id)
);

alter table public.faqs add constraint faqs_user_groups_required
  check (
    (audience = 'admin' and user_groups is null)
    or (audience = 'user' and array_length(user_groups, 1) >= 1)
  );

create index faqs_audience_category_sort_idx
  on public.faqs (audience, category, sort_order);

-- 3. updated_at 트리거 (기존 set_updated_at 함수 재사용)
create trigger faqs_set_updated_at
  before update on public.faqs
  for each row execute function public.set_updated_at();

-- 4. RLS
alter table public.faqs enable row level security;

create policy faqs_user_select on public.faqs
  for select to authenticated
  using (
    audience = 'user'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'
        and p.user_group is not null
        and faqs.user_groups @> array[p.user_group]
    )
  );

create policy faqs_admin_all on public.faqs
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );
```

- [ ] **Step 3: 마이그레이션 적용 + 타입 생성**

Run:
```powershell
./node_modules/supabase/bin/supabase.exe db reset
./node_modules/supabase/bin/supabase.exe gen types typescript --local > lib/db-types.ts
```
Expected: 에러 없이 완료. `lib/db-types.ts`에 `faqs` 테이블 타입과 `profiles.guide_banner_dismissed_at` 필드 생성됨.

- [ ] **Step 4: 타입 확인**

Run:
```powershell
Select-String -Path lib/db-types.ts -Pattern "guide_banner_dismissed_at|faqs:" | Select-Object -First 5
```
Expected: 두 식별자가 모두 출력.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260515000001_guide_banner_and_faqs.sql lib/db-types.ts
git commit -m "feat(guide): add faqs table and profile banner dismiss column"
```

---

### Task 2: Markdown 의존성 + sanitize 컴포넌트

**Files:**
- Modify: `package.json`
- Create: `lib/guide/markdown.tsx`
- Test: `tests/lib/guide/markdown.test.tsx`

- [ ] **Step 1: 의존성 추가**

Run:
```bash
pnpm add react-markdown remark-gfm rehype-sanitize
```
Expected: 세 패키지가 `package.json` dependencies에 추가됨.

- [ ] **Step 2: 실패 테스트 작성**

Create `tests/lib/guide/markdown.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GuideMarkdown } from '@/lib/guide/markdown';

describe('GuideMarkdown', () => {
  it('renders basic markdown', () => {
    const { container } = render(<GuideMarkdown source="**bold** _italic_" />);
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('em')).not.toBeNull();
  });

  it('strips script tags', () => {
    const { container } = render(<GuideMarkdown source={'<script>alert(1)</script>안녕'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('안녕');
  });

  it('strips javascript: protocol from links', () => {
    const { container } = render(
      <GuideMarkdown source="[click](javascript:alert(1))" />,
    );
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).not.toMatch(/^javascript:/);
  });

  it('adds rel=noopener to external links', () => {
    const { container } = render(<GuideMarkdown source="[ex](https://example.com)" />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });
});
```

Also add `@testing-library/react` if not present:
```bash
pnpm add -D @testing-library/react jsdom
```

Update `vitest.config.ts` if needed to set `environment: 'jsdom'`.

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run:
```bash
pnpm test tests/lib/guide/markdown.test.tsx
```
Expected: FAIL — `GuideMarkdown` not defined.

- [ ] **Step 4: 컴포넌트 구현**

Create `lib/guide/markdown.tsx`:
```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const allowedTags = ['p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h3', 'h4', 'br', 'hr'];

const schema = {
  ...defaultSchema,
  tagNames: allowedTags,
  attributes: {
    ...defaultSchema.attributes,
    a: [['href', /^(https?:|mailto:|\/)/], 'title'],
  },
};

export function GuideMarkdown({ source }: { source: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-a:text-sky-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: ({ href, children, ...rest }) => {
            const isExternal = typeof href === 'string' && /^https?:/.test(href);
            return (
              <a
                {...rest}
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run:
```bash
pnpm test tests/lib/guide/markdown.test.tsx
```
Expected: PASS — 4개 모두 통과.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts lib/guide/markdown.tsx tests/lib/guide/markdown.test.tsx
git commit -m "feat(guide): add sanitized markdown renderer for FAQ answers"
```

---

### Task 3: FAQ 카테고리 모듈

**Files:**
- Create: `lib/guide/categories.ts`
- Test: `tests/lib/guide/categories.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/lib/guide/categories.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  USER_FAQ_CATEGORIES,
  ADMIN_FAQ_CATEGORIES,
  USER_FAQ_CATEGORY_LABEL,
  ADMIN_FAQ_CATEGORY_LABEL,
  isUserFaqCategory,
  isAdminFaqCategory,
} from '@/lib/guide/categories';

describe('FAQ categories', () => {
  it('user and admin categories are disjoint at the value level only where needed', () => {
    expect(USER_FAQ_CATEGORIES).toContain('purchase');
    expect(ADMIN_FAQ_CATEGORIES).toContain('approvals');
  });

  it('all user categories have label', () => {
    for (const c of USER_FAQ_CATEGORIES) {
      expect(USER_FAQ_CATEGORY_LABEL[c]).toBeTruthy();
    }
  });

  it('all admin categories have label', () => {
    for (const c of ADMIN_FAQ_CATEGORIES) {
      expect(ADMIN_FAQ_CATEGORY_LABEL[c]).toBeTruthy();
    }
  });

  it('isUserFaqCategory accepts only user values', () => {
    expect(isUserFaqCategory('purchase')).toBe(true);
    expect(isUserFaqCategory('approvals')).toBe(false);
    expect(isUserFaqCategory('bogus')).toBe(false);
  });

  it('isAdminFaqCategory accepts only admin values', () => {
    expect(isAdminFaqCategory('approvals')).toBe(true);
    expect(isAdminFaqCategory('purchase')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run:
```bash
pnpm test tests/lib/guide/categories.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 모듈 구현**

Create `lib/guide/categories.ts`:
```ts
export const USER_FAQ_CATEGORIES = [
  'getting-started',
  'purchase',
  'shipping-upload',
  'inventory',
  'inbound',
  'deposit',
  'account',
] as const;

export const ADMIN_FAQ_CATEGORIES = [
  'getting-started',
  'approvals',
  'deposits',
  'products',
  'orders',
  'shipping-upload',
  'inbound',
  'users',
  'etc',
] as const;

export type UserFaqCategory = (typeof USER_FAQ_CATEGORIES)[number];
export type AdminFaqCategory = (typeof ADMIN_FAQ_CATEGORIES)[number];

export const USER_FAQ_CATEGORY_LABEL: Record<UserFaqCategory, string> = {
  'getting-started': '시작하기',
  purchase: '상품 구매',
  'shipping-upload': '배송대행',
  inventory: '보유 재고',
  inbound: '입고 요청',
  deposit: '예치금',
  account: '계정',
};

export const ADMIN_FAQ_CATEGORY_LABEL: Record<AdminFaqCategory, string> = {
  'getting-started': '시작하기',
  approvals: '가입 승인',
  deposits: '입금',
  products: '상품',
  orders: '주문',
  'shipping-upload': '배송대행',
  inbound: '입고 요청',
  users: '사용자',
  etc: '기타',
};

export function isUserFaqCategory(v: unknown): v is UserFaqCategory {
  return typeof v === 'string' && (USER_FAQ_CATEGORIES as readonly string[]).includes(v);
}

export function isAdminFaqCategory(v: unknown): v is AdminFaqCategory {
  return typeof v === 'string' && (ADMIN_FAQ_CATEGORIES as readonly string[]).includes(v);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
pnpm test tests/lib/guide/categories.test.ts
```
Expected: PASS — 5개 모두 통과.

- [ ] **Step 5: Commit**

```bash
git add lib/guide/categories.ts tests/lib/guide/categories.test.ts
git commit -m "feat(guide): define FAQ categories for user and admin audiences"
```

---

### Task 4: FAQ Zod 스키마

**Files:**
- Create: `lib/guide/schemas.ts`
- Test: `tests/lib/guide/schemas.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/lib/guide/schemas.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FaqInputSchema } from '@/lib/guide/schemas';

const base = {
  question: 'Q',
  answer: 'A',
  sort_order: 0,
};

describe('FaqInputSchema', () => {
  it('accepts user audience with group1 only', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'user',
      user_groups: ['group1'],
      category: 'purchase',
    });
    expect(r.success).toBe(true);
  });

  it('accepts user audience with both groups', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'user',
      user_groups: ['group1', 'group2'],
      category: 'inbound',
    });
    expect(r.success).toBe(true);
  });

  it('rejects user audience without user_groups', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'user',
      user_groups: [],
      category: 'purchase',
    });
    expect(r.success).toBe(false);
  });

  it('rejects user audience with admin category', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'user',
      user_groups: ['group1'],
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });

  it('accepts admin audience with admin category and no user_groups', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
    });
    expect(r.success).toBe(true);
  });

  it('rejects admin audience with user_groups present', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      audience: 'admin',
      user_groups: ['group1'],
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty question', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      question: '',
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });

  it('rejects question over 200 chars', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      question: 'x'.repeat(201),
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });

  it('rejects answer over 5000 chars', () => {
    const r = FaqInputSchema.safeParse({
      ...base,
      answer: 'y'.repeat(5001),
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run:
```bash
pnpm test tests/lib/guide/schemas.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 스키마 구현**

Create `lib/guide/schemas.ts`:
```ts
import { z } from 'zod';
import {
  USER_FAQ_CATEGORIES,
  ADMIN_FAQ_CATEGORIES,
} from './categories';

const UserGroupEnum = z.enum(['group1', 'group2']);

const userInput = z.object({
  audience: z.literal('user'),
  user_groups: z.array(UserGroupEnum).min(1).max(2),
  category: z.enum(USER_FAQ_CATEGORIES),
});

const adminInput = z.object({
  audience: z.literal('admin'),
  user_groups: z.null(),
  category: z.enum(ADMIN_FAQ_CATEGORIES),
});

const commonInput = z.object({
  question: z.string().trim().min(1, '질문을 입력해주세요').max(200, '질문은 200자 이하여야 합니다'),
  answer: z.string().trim().min(1, '답변을 입력해주세요').max(5000, '답변은 5000자 이하여야 합니다'),
  sort_order: z.number().int().default(0),
});

export const FaqInputSchema = z.discriminatedUnion('audience', [
  userInput.merge(commonInput),
  adminInput.merge(commonInput),
]);

export type FaqInput = z.infer<typeof FaqInputSchema>;
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
pnpm test tests/lib/guide/schemas.test.ts
```
Expected: PASS — 9개 모두 통과.

- [ ] **Step 5: Commit**

```bash
git add lib/guide/schemas.ts tests/lib/guide/schemas.test.ts
git commit -m "feat(guide): add Zod schema for FAQ input validation"
```

---

### Task 5: FAQ 조회 + CRUD server actions

**Files:**
- Create: `lib/guide/faqs.ts`
- Test: `tests/lib/guide/faqs.test.ts`

- [ ] **Step 1: 실패 테스트 작성 — 비관리자 권한 차단**

Create `tests/lib/guide/faqs.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/actions/_guards', () => ({
  requireAdmin: vi.fn(),
  requireAuthActive: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createFaq, updateFaq, deleteFaq } from '@/lib/guide/faqs';
import { requireAdmin } from '@/lib/actions/_guards';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FAQ admin actions', () => {
  it('createFaq returns error when not admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false, error: '관리자 권한이 필요합니다.' });
    const r = await createFaq({
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
      question: 'Q',
      answer: 'A',
      sort_order: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('관리자');
  });

  it('updateFaq returns error when not admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false, error: '관리자 권한이 필요합니다.' });
    const r = await updateFaq('id', {
      audience: 'admin',
      user_groups: null,
      category: 'approvals',
      question: 'Q',
      answer: 'A',
      sort_order: 0,
    });
    expect(r.ok).toBe(false);
  });

  it('deleteFaq returns error when not admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false, error: '관리자 권한이 필요합니다.' });
    const r = await deleteFaq('id');
    expect(r.ok).toBe(false);
  });

  it('createFaq returns fieldErrors on invalid input', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      supabase: {} as any,
      user: { id: 'u' } as any,
      profile: { role: 'admin', status: 'active' },
    });
    const r = await createFaq({
      audience: 'user',
      user_groups: [],
      category: 'purchase',
      question: '',
      answer: '',
      sort_order: 0,
    } as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run:
```bash
pnpm test tests/lib/guide/faqs.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 모듈 구현**

Create `lib/guide/faqs.ts`:
```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/actions/_guards';
import type { UserGroup } from '@/lib/auth/user-groups';
import { FaqInputSchema, type FaqInput } from './schemas';
import {
  isUserFaqCategory,
  isAdminFaqCategory,
} from './categories';

export type Faq = {
  id: string;
  audience: 'user' | 'admin';
  user_groups: UserGroup[] | null;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function getUserFaqs(params: {
  userGroup: UserGroup;
  category?: string;
  query?: string;
}): Promise<Faq[]> {
  const supabase = createClient();
  let q = supabase
    .from('faqs')
    .select('*')
    .eq('audience', 'user')
    .contains('user_groups', [params.userGroup])
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });

  if (params.category && isUserFaqCategory(params.category)) {
    q = q.eq('category', params.category);
  }
  if (params.query && params.query.trim()) {
    const pattern = `%${params.query.replace(/[%_]/g, m => '\\' + m)}%`;
    q = q.or(`question.ilike.${pattern},answer.ilike.${pattern}`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Faq[];
}

export async function getAdminFaqs(params: {
  audience?: 'user' | 'admin';
  category?: string;
  query?: string;
}): Promise<Faq[]> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error(guard.error);

  let q = guard.supabase
    .from('faqs')
    .select('*')
    .order('audience', { ascending: true })
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });

  if (params.audience) q = q.eq('audience', params.audience);
  if (params.category) q = q.eq('category', params.category);
  if (params.query && params.query.trim()) {
    const pattern = `%${params.query.replace(/[%_]/g, m => '\\' + m)}%`;
    q = q.or(`question.ilike.${pattern},answer.ilike.${pattern}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Faq[];
}

export async function getFaqById(id: string): Promise<Faq | null> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error(guard.error);
  const { data, error } = await guard.supabase.from('faqs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Faq | null;
}

function flattenZodErrors(err: z.ZodError): Record<string, string[]> {
  const flat: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (flat[key] ??= []).push(issue.message);
  }
  return flat;
}

export async function createFaq(input: FaqInput): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = FaqInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '입력값을 확인해주세요.', fieldErrors: flattenZodErrors(parsed.error) };
  }

  const { data, error } = await guard.supabase
    .from('faqs')
    .insert({
      ...parsed.data,
      created_by: guard.user.id,
      updated_by: guard.user.id,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/guide/faq/manage');
  revalidatePath('/admin/guide/faq');
  revalidatePath('/guide/faq');
  return { ok: true, data: { id: data.id } };
}

export async function updateFaq(id: string, input: FaqInput): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = FaqInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '입력값을 확인해주세요.', fieldErrors: flattenZodErrors(parsed.error) };
  }

  const { error } = await guard.supabase
    .from('faqs')
    .update({
      ...parsed.data,
      updated_by: guard.user.id,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/guide/faq/manage');
  revalidatePath('/admin/guide/faq');
  revalidatePath('/guide/faq');
  return { ok: true };
}

export async function deleteFaq(id: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await guard.supabase.from('faqs').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/guide/faq/manage');
  revalidatePath('/admin/guide/faq');
  revalidatePath('/guide/faq');
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
pnpm test tests/lib/guide/faqs.test.ts
```
Expected: PASS — 4개 모두 통과.

- [ ] **Step 5: Commit**

```bash
git add lib/guide/faqs.ts tests/lib/guide/faqs.test.ts
git commit -m "feat(guide): add FAQ queries and admin CRUD server actions"
```

---

### Task 6: `dismissGuideBanner` server action

**Files:**
- Create: `lib/guide/banner.ts`

- [ ] **Step 1: 모듈 작성**

Create `lib/guide/banner.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './faqs';

export async function dismissGuideBanner(): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('profiles')
    .update({ guide_banner_dismissed_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
```

- [ ] **Step 2: 컴파일 확인**

Run:
```bash
pnpm typecheck
```
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add lib/guide/banner.ts
git commit -m "feat(guide): add dismissGuideBanner server action"
```

---

### Task 7: `GROUP2_ALLOWED_PREFIXES`에 `/guide` 추가

**Files:**
- Modify: `lib/auth/user-groups.ts:18-23`

- [ ] **Step 1: 배열 수정**

Edit `lib/auth/user-groups.ts`:
```ts
export const GROUP2_ALLOWED_PREFIXES = [
  '/shipping-uploads/purchased',
  '/inbound-requests',
  '/inbound-template.xlsx',
  '/account',
  '/guide',
] as const;
```

- [ ] **Step 2: 기존 테스트 회귀 확인**

Run:
```bash
pnpm test
```
Expected: 전체 테스트 PASS (group2 라우트 가드 테스트가 있다면 `/guide`가 허용 prefix로 인정됨).

- [ ] **Step 3: Commit**

```bash
git add lib/auth/user-groups.ts
git commit -m "feat(guide): allow group2 access to /guide"
```

---

## Phase 2 — Sidebar 메뉴 & Banner

### Task 8: NavUser 메뉴에 "가이드" 추가

**Files:**
- Modify: `components/NavUser.tsx`

- [ ] **Step 1: 기존 NavUser 구조 확인**

Run:
```bash
Get-Content components/NavUser.tsx | Select-Object -First 80
```
Expected: 메뉴 항목 배열 또는 JSX 리스트 확인. group2 메뉴 필터링 로직 위치 파악.

- [ ] **Step 2: "가이드" 항목 추가**

Find 메뉴 정의 부분에 다음 항목 추가 (예: `'/account'` 항목 바로 위 또는 적절한 위치). group1/group2 모두에게 노출:
```tsx
{ href: '/guide', label: '가이드', group: 'both' },
```
실제 자료 구조에 맞춰 형식 조정. 핵심은 group2 필터에서 차단되지 않도록 하는 것.

- [ ] **Step 3: 빌드 확인 + 시각 확인**

Run:
```bash
pnpm dev
```
group1 / group2 계정으로 로그인 후 사이드바에 "가이드" 항목이 보이는지 확인. 클릭 시 `/guide`로 이동.

- [ ] **Step 4: Commit**

```bash
git add components/NavUser.tsx
git commit -m "feat(guide): add guide menu to user sidebar"
```

---

### Task 9: AdminSidebar에 "관리자 가이드" + "FAQ 관리" 추가

**Files:**
- Modify: `components/AdminSidebar.tsx`
- Modify: `components/MobileAdminNav.tsx`

- [ ] **Step 1: 두 파일에 메뉴 항목 추가**

AdminSidebar:
```tsx
{ href: '/admin/guide', label: '관리자 가이드' },
{ href: '/admin/guide/faq/manage', label: 'FAQ 관리' },
```

MobileAdminNav도 동일하게.

- [ ] **Step 2: 시각 확인**

Run:
```bash
pnpm dev
```
관리자 계정 사이드바·모바일 메뉴에 두 항목이 노출되는지 확인.

- [ ] **Step 3: Commit**

```bash
git add components/AdminSidebar.tsx components/MobileAdminNav.tsx
git commit -m "feat(guide): add admin guide and FAQ management menu items"
```

---

### Task 10: GuideBanner 컴포넌트 + 통합

**Files:**
- Create: `components/guide/GuideBanner.tsx`
- Modify: `app/(user)/layout.tsx`
- Modify: `app/(admin)/admin/layout.tsx`

- [ ] **Step 1: 배너 컴포넌트 작성**

Create `components/guide/GuideBanner.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { dismissGuideBanner } from '@/lib/guide/banner';
import { Button } from '@/components/ui/button';

export function GuideBanner({ guideHref }: { guideHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const onDismiss = () => {
    start(async () => {
      await dismissGuideBanner();
      router.refresh();
    });
  };
  return (
    <div className="flex flex-col gap-2 border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-slate-700">
        처음이시면 가이드를 먼저 읽어보세요. 엑시트몰의 주요 흐름을 정리해 두었습니다.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="default" size="sm">
          <Link href={guideHref}>가이드 열기</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={pending}>
          닫기
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 사용자 레이아웃에 통합**

In `app/(user)/layout.tsx`, server-side에서 `guide_banner_dismissed_at` 조회 후 NULL이면 `<GuideBanner guideHref="/guide" />` 렌더:
```tsx
// 기존 레이아웃에서 profile 조회 부분을 확장
const { data: profile } = await supabase
  .from('profiles')
  .select('role, status, user_group, guide_banner_dismissed_at')
  .eq('id', user.id)
  .single();

// JSX 최상단에:
{profile && profile.guide_banner_dismissed_at === null && (
  <GuideBanner guideHref="/guide" />
)}
```

- [ ] **Step 3: 관리자 레이아웃에 통합**

In `app/(admin)/admin/layout.tsx`, 동일하게 `guideHref="/admin/guide"`로:
```tsx
{profile?.guide_banner_dismissed_at === null && (
  <GuideBanner guideHref="/admin/guide" />
)}
```

- [ ] **Step 4: 동작 확인**

Run `pnpm dev`. 신규 사용자(또는 SQL로 본인 `guide_banner_dismissed_at` NULL 처리한 계정) 로그인 → 배너 노출 → 닫기 클릭 → 배너 사라짐 → 새로고침 시 미노출 확인.

SQL (Supabase Studio):
```sql
update public.profiles set guide_banner_dismissed_at = null where email = 'test@example.com';
```

- [ ] **Step 5: Commit**

```bash
git add components/guide/GuideBanner.tsx app/(user)/layout.tsx app/\(admin\)/admin/layout.tsx
git commit -m "feat(guide): add first-login banner with dismiss action"
```

---

## Phase 3 — 입문 가이드 페이지

### Task 11: GuideSection + GuideTOC 컴포넌트

**Files:**
- Create: `components/guide/GuideSection.tsx`
- Create: `components/guide/GuideTOC.tsx`

- [ ] **Step 1: GuideSection 작성**

Create `components/guide/GuideSection.tsx`:
```tsx
import type { ReactNode } from 'react';

export function GuideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-4 text-2xl font-semibold text-slate-900">{title}</h2>
      <div className="prose prose-sm max-w-none text-slate-700">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: GuideTOC 작성**

Create `components/guide/GuideTOC.tsx`:
```tsx
'use client';

import Link from 'next/link';

type TocItem = { id: string; label: string };

export function GuideTOC({ items }: { items: TocItem[] }) {
  return (
    <nav className="sticky top-20 hidden text-sm lg:block">
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.id}>
            <Link href={`#${item.id}`} className="text-slate-600 hover:text-sky-700">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/guide/GuideSection.tsx components/guide/GuideTOC.tsx
git commit -m "feat(guide): add GuideSection and GuideTOC primitives"
```

---

### Task 12: Group1Guide 콘텐츠 컴포넌트

**Files:**
- Create: `components/guide/Group1Guide.tsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `components/guide/Group1Guide.tsx`:
```tsx
import Link from 'next/link';
import { GuideSection } from './GuideSection';
import { GuideTOC } from './GuideTOC';

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'purchase', label: '흐름 1: 상품 구매' },
  { id: 'shipping-upload', label: '흐름 2: 배송대행' },
  { id: 'inventory', label: '보유 재고' },
  { id: 'inbound', label: '입고 요청' },
  { id: 'deposit', label: '예치금' },
  { id: 'account', label: '계정' },
];

export function Group1Guide() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <aside className="lg:col-span-3"><GuideTOC items={TOC} /></aside>
      <main className="space-y-12 lg:col-span-9">
        <GuideSection id="getting-started" title="시작하기">
          <p>엑시트몰은 예치금 기반의 폐쇄몰입니다. 가입 신청 후 관리자의 승인을 받으면 사용할 수 있습니다.</p>
          <p>가장 먼저 <Link href="/deposit/new">예치금 충전 요청</Link>을 해주세요. 관리자가 입금을 확인하면 잔액에 반영됩니다.</p>
        </GuideSection>

        <GuideSection id="purchase" title="흐름 1: 상품 구매 (재고 적립)">
          <ol>
            <li><Link href="/shop">상점</Link>에서 상품을 장바구니에 담습니다.</li>
            <li><Link href="/cart">장바구니</Link>에서 수량을 확인합니다.</li>
            <li><Link href="/checkout">검토 요청</Link> 페이지에서 "검토 요청" 버튼을 누르면 주문이 생성됩니다. 이 단계에서는 예치금이 차감되지 않고 가용 잔액에서 예약(보류)만 됩니다.</li>
            <li>관리자가 승인하면 예치금이 차감되고 상품이 <Link href="/inventory">보유 재고</Link>에 적립됩니다. 이 단계에서는 발송이 일어나지 않습니다.</li>
          </ol>
          <p><strong>1인 누적 구매 한도</strong>: 상품별로 1인이 구매할 수 있는 한도가 있으며, 검토대기 중인 수량도 합산됩니다.</p>
          <p>주문은 검토대기 상태에서 <Link href="/orders">내 주문 내역</Link>에서 직접 취소할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="shipping-upload" title="흐름 2: 배송대행 (재고 발송)">
          <ol>
            <li><Link href="/shipping-uploads/exitmall">엑시트몰 배송대행</Link>에서 양식 엑셀을 다운로드합니다.</li>
            <li>받는사람 명단을 1행 1택배 양식으로 작성합니다.</li>
            <li>업로드 → 행별 미리보기에서 상품명 매칭과 검증 결과를 확인합니다.</li>
            <li>"검토 요청"을 누르면 보유 재고와 배송비가 예약 상태로 들어갑니다.</li>
            <li>관리자가 승인하면 보유 재고가 차감되고 배송비가 차감됩니다.</li>
            <li>관리자가 송장을 채운 엑셀을 재업로드하면 행별 송장이 노출되고 CJ 조회 버튼이 활성화됩니다.</li>
            <li>완료 처리되면 마무리됩니다.</li>
          </ol>
          <p>각 행의 상품명은 엑시트몰 상품 또는 본인이 등록한 수기 재고와 정확히 일치해야 매칭됩니다.</p>
        </GuideSection>

        <GuideSection id="inventory" title="보유 재고">
          <p><Link href="/inventory">보유 재고</Link>에는 엑시트몰 상품에서 적립된 수량과 사용자가 직접 등록한 수기 재고가 통합 표시됩니다.</p>
          <ul>
            <li><strong>가용</strong>: 지금 배송대행에 쓸 수 있는 수량</li>
            <li><strong>예약</strong>: 검토대기 중인 배송대행에 묶여 있는 수량</li>
            <li><strong>총보유</strong>: 가용 + 예약</li>
          </ul>
          <p>각 항목을 클릭하면 변동 내역(타임라인)을 확인할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="inbound" title="입고 요청">
          <p>사입 상품을 엑시트몰 창고로 보낼 때 <Link href="/inbound-requests">입고리스트</Link>에 비공개 게시글을 등록합니다. 엑셀 양식을 첨부하고 댓글로 관리자와 진행 상황을 주고받을 수 있습니다.</p>
          <p>상태는 접수 → 검토 → 입고완료 순으로 진행됩니다. 검토 전 상태에서는 직접 취소할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="deposit" title="예치금">
          <p><Link href="/deposit">예치금</Link>에서 잔액과 이체 내역을 확인할 수 있습니다. 충전이 필요하면 <Link href="/deposit/new">이체 요청</Link>을 등록하고 안내된 계좌로 송금해주세요.</p>
          <p>잔액은 <strong>가용</strong>과 <strong>검토대기 예약</strong>으로 분리되어 표시됩니다. 검토대기 중인 주문/배송대행이 승인되면 예약 분이 실제 차감됩니다.</p>
        </GuideSection>

        <GuideSection id="account" title="계정">
          <p><Link href="/account/password">비밀번호 변경</Link>은 계정 메뉴에서 할 수 있습니다.</p>
          <p>아이디를 잊었다면 <Link href="/find-account">아이디 찾기</Link>, 비밀번호를 잊었다면 <Link href="/reset-password">비밀번호 재설정</Link>을 이용해주세요.</p>
        </GuideSection>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/guide/Group1Guide.tsx
git commit -m "feat(guide): add group1 introduction guide content"
```

---

### Task 13: Group2Guide 콘텐츠 컴포넌트

**Files:**
- Create: `components/guide/Group2Guide.tsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `components/guide/Group2Guide.tsx`:
```tsx
import Link from 'next/link';
import { GuideSection } from './GuideSection';
import { GuideTOC } from './GuideTOC';

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'shipping-upload', label: '사입재고 배송대행' },
  { id: 'inbound', label: '입고 요청' },
  { id: 'account', label: '계정' },
];

export function Group2Guide() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <aside className="lg:col-span-3"><GuideTOC items={TOC} /></aside>
      <main className="space-y-12 lg:col-span-9">
        <GuideSection id="getting-started" title="시작하기">
          <p>2그룹 사용자는 사입재고 배송대행과 입고 요청만 사용할 수 있습니다. 엑시트몰 상점, 일반 보유 재고, 예치금 관리 메뉴는 노출되지 않습니다.</p>
          <p>가입 신청 후 관리자의 승인이 완료되면 메뉴가 활성화됩니다.</p>
        </GuideSection>

        <GuideSection id="shipping-upload" title="사입재고 배송대행">
          <p><strong>현재 준비 중입니다.</strong> 출시되면 직접 사입하신 재고를 엑시트몰을 통해 배송대행할 수 있게 됩니다.</p>
          <p>예상 흐름:</p>
          <ol>
            <li><Link href="/shipping-uploads/purchased">사입재고 배송대행</Link>에서 양식 엑셀을 다운로드합니다.</li>
            <li>받는사람 명단과 본인 사입 상품 정보를 작성합니다.</li>
            <li>업로드 → 검토 요청 → 관리자 승인 → 송장 노출 순으로 진행됩니다.</li>
          </ol>
          <p>상세한 사용 방법은 출시 시점에 가이드에 추가됩니다.</p>
        </GuideSection>

        <GuideSection id="inbound" title="입고 요청">
          <p>사입 상품을 엑시트몰 창고로 보낼 때 <Link href="/inbound-requests">입고리스트</Link>에 비공개 게시글을 등록합니다. 엑셀 양식을 첨부하고 댓글로 관리자와 진행 상황을 주고받을 수 있습니다.</p>
          <p>상태는 접수 → 검토 → 입고완료 순으로 진행됩니다. 검토 전 상태에서는 직접 취소할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="account" title="계정">
          <p><Link href="/account/password">비밀번호 변경</Link>은 계정 메뉴에서 할 수 있습니다.</p>
          <p>아이디를 잊었다면 <Link href="/find-account">아이디 찾기</Link>, 비밀번호를 잊었다면 <Link href="/reset-password">비밀번호 재설정</Link>을 이용해주세요.</p>
        </GuideSection>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/guide/Group2Guide.tsx
git commit -m "feat(guide): add group2 introduction guide content"
```

---

### Task 14: AdminGuide 콘텐츠 컴포넌트

**Files:**
- Create: `components/guide/AdminGuide.tsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `components/guide/AdminGuide.tsx`:
```tsx
import Link from 'next/link';
import { GuideSection } from './GuideSection';
import { GuideTOC } from './GuideTOC';

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'approvals', label: '가입 승인' },
  { id: 'deposits', label: '입금 확인' },
  { id: 'products', label: '상품 관리' },
  { id: 'product-import', label: '상품 엑셀 가져오기' },
  { id: 'orders', label: '주문 관리' },
  { id: 'shipping-upload', label: '배송대행 관리' },
  { id: 'inbound', label: '입고 요청 관리' },
  { id: 'users', label: '사용자 관리' },
  { id: 'low-balance-settings', label: '잔액 부족 / 설정' },
  { id: 'legacy', label: 'Legacy 화면' },
];

export function AdminGuide() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <aside className="lg:col-span-3"><GuideTOC items={TOC} /></aside>
      <main className="space-y-12 lg:col-span-9">
        <GuideSection id="getting-started" title="시작하기">
          <p>관리자는 <Link href="/admin">대시보드</Link>에서 신규 검토대기 토스트(Realtime) 알림을 받습니다. 일상 업무는 가입 승인 → 입금 확인 → 주문/배송대행 검토 흐름으로 진행됩니다.</p>
        </GuideSection>

        <GuideSection id="approvals" title="가입 승인">
          <p><Link href="/admin/approvals">가입 승인</Link>에서 신청 목록을 검토합니다. 승인 시 사용자 그룹(group1 / group2)을 선택해야 합니다.</p>
          <ul>
            <li><strong>group1</strong>: 엑시트몰 전체 기능 사용. 기본 선택.</li>
            <li><strong>group2</strong>: 배송대행 전용. 상점/주문/예치금 등 차단.</li>
          </ul>
          <p>거절된 사용자는 다시 신청할 수 있고 재신청 사실이 화면에 표시됩니다.</p>
        </GuideSection>

        <GuideSection id="deposits" title="입금 확인">
          <p><Link href="/admin/deposits">입금 확인</Link>에서 이체 요청을 검토하고, 실제 입금을 확인하면 고객의 예치금에 반영됩니다.</p>
        </GuideSection>

        <GuideSection id="products" title="상품 관리">
          <p><Link href="/admin/products">상품 관리</Link>에서 상품 CRUD, 1인 한도 설정, 이미지 업로드, 비활성 토글, 소프트 삭제를 처리합니다.</p>
          <p>삭제된 상품은 <Link href="/admin/products?view=deleted">삭제됨 탭</Link>에서 복구할 수 있습니다.</p>
        </GuideSection>

        <GuideSection id="product-import" title="상품 엑셀 가져오기">
          <p><Link href="/admin/products/import">상품 가져오기</Link>에서 엑셀을 업로드 → 미리보기로 검증(가격/한도/이미지 URL/중복) → 적용 순으로 진행합니다. 신규 상품은 비공개 상태로 생성됩니다.</p>
        </GuideSection>

        <GuideSection id="orders" title="주문 관리 (상품 구매 / stock_orders)">
          <p><Link href="/admin/orders">주문 관리</Link>에서 흐름 1(상품 구매) 검토대기 주문을 검토하고 승인/반려합니다.</p>
          <p>승인 시: 예치금 차감 + 마스터 재고 차감 + 사용자 보유 재고 적립 + 변동 내역 기록.</p>
          <p>반려 시: 차감 없이 사유와 함께 반려 처리되고, 주문자 화면에 사유가 노출됩니다.</p>
        </GuideSection>

        <GuideSection id="shipping-upload" title="배송대행 관리">
          <p><Link href="/admin/shipping-uploads/exitmall">엑시트몰 배송대행</Link>에서 검토대기 업로드를 검토합니다.</p>
          <ol>
            <li>원본 다운로드로 행별 내용을 확인합니다.</li>
            <li>승인 시 보유 재고가 차감(엑시트몰/수기 모두 포함)되고 배송비가 차감됩니다.</li>
            <li>송장을 채운 엑셀을 같은 업로드에 재업로드하면 행별 송장이 반영됩니다(멱등). 부분 발송도 가능합니다.</li>
            <li>모든 행이 발송되면 "완료 처리"로 마무리합니다.</li>
          </ol>
        </GuideSection>

        <GuideSection id="inbound" title="입고 요청 관리">
          <p><Link href="/admin/inbound-requests">입고리스트</Link>에서 사용자 게시글을 검토하고 상태(접수/검토/입고완료/취소)를 변경합니다. 댓글로 응답할 수 있으며 미확인 답변은 배지로 표시됩니다.</p>
        </GuideSection>

        <GuideSection id="users" title="사용자 관리">
          <p><Link href="/admin/users">사용자 관리</Link>에서 잔액 조정, 상태, 임계치, 사용자 그룹 변경을 처리합니다. 사용자별 수기 재고 등록·조정도 같은 화면에서 가능합니다.</p>
        </GuideSection>

        <GuideSection id="low-balance-settings" title="잔액 부족 / 설정">
          <p><Link href="/admin/low-balance">잔액 부족 고객</Link>에서 알림 대상 목록을 확인할 수 있습니다.</p>
          <p><Link href="/admin/settings">설정</Link>에서 입금 계좌 정보를 관리합니다.</p>
        </GuideSection>

        <GuideSection id="legacy" title="Legacy 화면">
          <p><Link href="/admin/orders-legacy">구 일반 주문</Link>과 <Link href="/admin/order-uploads">구 배송대행 업로드</Link>는 열람 전용입니다. 신규 흐름에서는 사용하지 않습니다.</p>
        </GuideSection>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/guide/AdminGuide.tsx
git commit -m "feat(guide): add admin operations guide content"
```

---

### Task 15: `/guide` 페이지 (group 분기 + admin 토글)

**Files:**
- Create: `app/(user)/guide/page.tsx`

- [ ] **Step 1: 페이지 작성**

Create `app/(user)/guide/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Group1Guide } from '@/components/guide/Group1Guide';
import { Group2Guide } from '@/components/guide/Group2Guide';

export const dynamic = 'force-dynamic';

export default async function GuidePage({
  searchParams,
}: {
  searchParams: { as?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, user_group')
    .eq('id', user.id)
    .single<{ role: string; user_group: string | null }>();
  if (!profile) redirect('/login');

  const isAdmin = profile.role === 'admin';
  const adminPreview = isAdmin && searchParams.as === 'group2';
  const effectiveGroup: 'group1' | 'group2' =
    adminPreview ? 'group2' : (profile.user_group === 'group2' ? 'group2' : 'group1');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">가이드</h1>
        <p className="mt-2 text-sm text-slate-600">
          엑시트몰의 주요 흐름과 사용법을 정리한 안내입니다.{' '}
          <Link href="/guide/faq" className="text-sky-700 hover:underline">자주 묻는 질문 →</Link>
        </p>
        {isAdmin && (
          <div className="mt-3 text-xs text-slate-500">
            관리자 보기: {effectiveGroup === 'group2' ? (
              <Link href="/guide" className="text-sky-700 hover:underline">group1 가이드로 돌아가기</Link>
            ) : (
              <Link href="/guide?as=group2" className="text-sky-700 hover:underline">group2 가이드 미리보기</Link>
            )}
          </div>
        )}
      </header>
      {effectiveGroup === 'group2' ? <Group2Guide /> : <Group1Guide />}
    </div>
  );
}
```

- [ ] **Step 2: 시각 확인**

Run `pnpm dev`. group1 / group2 / admin 계정으로 각각 `/guide` 접근. group2가 `?as=group1`을 시도해도 group2 가이드만 나오는지(`searchParams.as`는 admin만 반영) 확인.

- [ ] **Step 3: Commit**

```bash
git add app/\(user\)/guide/page.tsx
git commit -m "feat(guide): add /guide page with group routing and admin preview toggle"
```

---

### Task 16: `/admin/guide` 페이지

**Files:**
- Create: `app/(admin)/admin/guide/page.tsx`

- [ ] **Step 1: 페이지 작성**

Create `app/(admin)/admin/guide/page.tsx`:
```tsx
import Link from 'next/link';
import { AdminGuide } from '@/components/guide/AdminGuide';

export const dynamic = 'force-dynamic';

export default function AdminGuidePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">관리자 가이드</h1>
        <p className="mt-2 text-sm text-slate-600">
          엑시트몰 운영 업무 안내입니다.{' '}
          <Link href="/admin/guide/faq" className="text-sky-700 hover:underline">자주 묻는 질문 →</Link>
          {' '}|{' '}
          <Link href="/admin/guide/faq/manage" className="text-sky-700 hover:underline">FAQ 관리 →</Link>
        </p>
      </header>
      <AdminGuide />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/admin/guide/page.tsx
git commit -m "feat(guide): add /admin/guide page"
```

---

## Phase 4 — FAQ 표시

### Task 17: FaqAnswer 컴포넌트

**Files:**
- Create: `components/guide/FaqAnswer.tsx`

- [ ] **Step 1: 컴포넌트 작성 (markdown.tsx 재사용)**

Create `components/guide/FaqAnswer.tsx`:
```tsx
import { GuideMarkdown } from '@/lib/guide/markdown';

export function FaqAnswer({ source }: { source: string }) {
  return <GuideMarkdown source={source} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/guide/FaqAnswer.tsx
git commit -m "feat(guide): add FaqAnswer wrapper for sanitized markdown"
```

---

### Task 18: FaqItem 컴포넌트 (아코디언)

**Files:**
- Create: `components/guide/FaqItem.tsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `components/guide/FaqItem.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FaqAnswer } from './FaqAnswer';
import type { Faq } from '@/lib/guide/faqs';

export function FaqItem({ faq }: { faq: Faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 py-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-base font-medium text-slate-900"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span>{faq.question}</span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="mt-3 text-sm text-slate-700">
          <FaqAnswer source={faq.answer} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/guide/FaqItem.tsx
git commit -m "feat(guide): add FaqItem accordion component"
```

---

### Task 19: FaqList 컴포넌트 (검색 + 카테고리 필터)

**Files:**
- Create: `components/guide/FaqList.tsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `components/guide/FaqList.tsx`:
```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { FaqItem } from './FaqItem';
import type { Faq } from '@/lib/guide/faqs';

type CategoryDef = { value: string; label: string };

export function FaqList({
  faqs,
  categories,
}: {
  faqs: Faq[];
  categories: CategoryDef[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`?${next.toString()}`));
  };

  const grouped = new Map<string, Faq[]>();
  for (const f of faqs) {
    const arr = grouped.get(f.category) ?? [];
    arr.push(f);
    grouped.set(f.category, arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="질문/답변 검색"
          defaultValue={q}
          onChange={e => setParam('q', e.target.value)}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm sm:max-w-sm"
        />
        <select
          value={category}
          onChange={e => setParam('category', e.target.value)}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm sm:max-w-xs"
        >
          <option value="">전체 카테고리</option>
          {categories.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      {pending && <p className="text-xs text-slate-400">검색 중…</p>}
      {faqs.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          조건에 맞는 FAQ가 없습니다.
        </p>
      ) : (
        Array.from(grouped.entries()).map(([cat, items]) => (
          <section key={cat}>
            <h3 className="mb-2 text-sm font-semibold text-slate-500">
              {categories.find(c => c.value === cat)?.label ?? cat}
            </h3>
            <div className="divide-y divide-slate-100">
              {items.map(f => <FaqItem key={f.id} faq={f} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/guide/FaqList.tsx
git commit -m "feat(guide): add FaqList with search and category filter"
```

---

### Task 20: `/guide/faq` 페이지

**Files:**
- Create: `app/(user)/guide/faq/page.tsx`

- [ ] **Step 1: 페이지 작성**

Create `app/(user)/guide/faq/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserFaqs } from '@/lib/guide/faqs';
import { USER_FAQ_CATEGORIES, USER_FAQ_CATEGORY_LABEL } from '@/lib/guide/categories';
import { FaqList } from '@/components/guide/FaqList';
import type { UserGroup } from '@/lib/auth/user-groups';

export const dynamic = 'force-dynamic';

export default async function FaqPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, user_group')
    .eq('id', user.id)
    .single<{ role: string; user_group: string | null }>();
  if (!profile) redirect('/login');

  const userGroup: UserGroup = profile.user_group === 'group2' ? 'group2' : 'group1';
  const faqs = await getUserFaqs({
    userGroup,
    category: searchParams.category,
    query: searchParams.q,
  });

  const categories = USER_FAQ_CATEGORIES.map(v => ({
    value: v,
    label: USER_FAQ_CATEGORY_LABEL[v],
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-slate-900">자주 묻는 질문</h1>
      </header>
      <FaqList faqs={faqs} categories={categories} />
    </div>
  );
}
```

- [ ] **Step 2: 동작 확인**

`/guide/faq`로 접근. (시드 데이터가 아직 없으므로 빈 결과가 정상.)

- [ ] **Step 3: Commit**

```bash
git add app/\(user\)/guide/faq/page.tsx
git commit -m "feat(guide): add /guide/faq page with search and filters"
```

---

### Task 21: `/admin/guide/faq` 페이지 (관리자 미리보기)

**Files:**
- Create: `app/(admin)/admin/guide/faq/page.tsx`

- [ ] **Step 1: 페이지 작성**

Create `app/(admin)/admin/guide/faq/page.tsx`:
```tsx
import Link from 'next/link';
import { getAdminFaqs } from '@/lib/guide/faqs';
import {
  ADMIN_FAQ_CATEGORIES,
  ADMIN_FAQ_CATEGORY_LABEL,
} from '@/lib/guide/categories';
import { FaqList } from '@/components/guide/FaqList';

export const dynamic = 'force-dynamic';

export default async function AdminFaqPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string };
}) {
  const faqs = await getAdminFaqs({
    audience: 'admin',
    category: searchParams.category,
    query: searchParams.q,
  });

  const categories = ADMIN_FAQ_CATEGORIES.map(v => ({
    value: v,
    label: ADMIN_FAQ_CATEGORY_LABEL[v],
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-slate-900">관리자 FAQ</h1>
        <p className="mt-2 text-sm text-slate-600">
          <Link href="/admin/guide/faq/manage" className="text-sky-700 hover:underline">FAQ 관리 →</Link>
        </p>
      </header>
      <FaqList faqs={faqs} categories={categories} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/admin/guide/faq/page.tsx
git commit -m "feat(guide): add /admin/guide/faq read-only preview page"
```

---

## Phase 5 — 관리자 FAQ CRUD

### Task 22: FaqEditor 폼 컴포넌트

**Files:**
- Create: `components/guide/FaqEditor.tsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `components/guide/FaqEditor.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  USER_FAQ_CATEGORIES,
  ADMIN_FAQ_CATEGORIES,
  USER_FAQ_CATEGORY_LABEL,
  ADMIN_FAQ_CATEGORY_LABEL,
} from '@/lib/guide/categories';
import { createFaq, updateFaq, type Faq } from '@/lib/guide/faqs';
import { Button } from '@/components/ui/button';

type Props =
  | { mode: 'create' }
  | { mode: 'edit'; faq: Faq };

export function FaqEditor(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = props.mode === 'edit' ? props.faq : null;

  const [audience, setAudience] = useState<'user' | 'admin'>(initial?.audience ?? 'user');
  const [groups, setGroups] = useState<('group1' | 'group2')[]>(
    initial?.user_groups as ('group1' | 'group2')[] | null ?? ['group1'],
  );
  const [category, setCategory] = useState(initial?.category ?? 'getting-started');
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [topError, setTopError] = useState<string | null>(null);

  const categoryOptions =
    audience === 'user' ? USER_FAQ_CATEGORIES : ADMIN_FAQ_CATEGORIES;
  const labelMap =
    audience === 'user' ? USER_FAQ_CATEGORY_LABEL : ADMIN_FAQ_CATEGORY_LABEL;

  const toggleGroup = (g: 'group1' | 'group2') => {
    setGroups(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g],
    );
  };

  const submit = () => {
    setErrors({});
    setTopError(null);
    start(async () => {
      const input =
        audience === 'user'
          ? { audience: 'user' as const, user_groups: groups, category, question, answer, sort_order: sortOrder }
          : { audience: 'admin' as const, user_groups: null, category, question, answer, sort_order: sortOrder };
      const result =
        props.mode === 'create'
          ? await createFaq(input as any)
          : await updateFaq(props.faq.id, input as any);
      if (!result.ok) {
        setTopError(result.error);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        return;
      }
      router.push('/admin/guide/faq/manage');
      router.refresh();
    });
  };

  // 카테고리가 audience에 안 맞으면 첫 항목으로 리셋
  if (!(categoryOptions as readonly string[]).includes(category)) {
    setCategory(categoryOptions[0]);
  }

  return (
    <div className="space-y-4">
      {topError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{topError}</p>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">대상</label>
        <select
          value={audience}
          onChange={e => setAudience(e.target.value as 'user' | 'admin')}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="user">사용자 (group1/group2)</option>
          <option value="admin">관리자</option>
        </select>
      </div>

      {audience === 'user' && (
        <div>
          <label className="block text-sm font-medium text-slate-700">노출 그룹</label>
          <div className="mt-1 flex gap-4 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={groups.includes('group1')} onChange={() => toggleGroup('group1')} />
              group1
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={groups.includes('group2')} onChange={() => toggleGroup('group2')} />
              group2
            </label>
          </div>
          {errors.user_groups && <p className="mt-1 text-xs text-red-600">{errors.user_groups[0]}</p>}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">카테고리</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        >
          {categoryOptions.map(c => (
            <option key={c} value={c}>{(labelMap as Record<string, string>)[c]}</option>
          ))}
        </select>
        {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category[0]}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">질문 (최대 200자)</label>
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          maxLength={200}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
        {errors.question && <p className="mt-1 text-xs text-red-600">{errors.question[0]}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">답변 (markdown, 최대 5000자)</label>
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          maxLength={5000}
          rows={10}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm"
        />
        {errors.answer && <p className="mt-1 text-xs text-red-600">{errors.answer[0]}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">정렬 순서 (작은 값이 위)</label>
        <input
          type="number"
          value={sortOrder}
          onChange={e => setSortOrder(parseInt(e.target.value, 10) || 0)}
          className="mt-1 w-32 rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {props.mode === 'create' ? '등록' : '저장'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          취소
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/guide/FaqEditor.tsx
git commit -m "feat(guide): add FaqEditor form for create and edit"
```

---

### Task 23: `/admin/guide/faq/manage` 목록 + 삭제

**Files:**
- Create: `components/guide/FaqDeleteButton.tsx`
- Create: `app/(admin)/admin/guide/faq/manage/page.tsx`

- [ ] **Step 1: 삭제 버튼 client 컴포넌트 작성**

Create `components/guide/FaqDeleteButton.tsx`:
```tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFaq } from '@/lib/guide/faqs';

export function FaqDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm('이 FAQ를 삭제할까요? 되돌릴 수 없습니다.')) return;
        start(async () => {
          await deleteFaq(id);
          router.refresh();
        });
      }}
      className="text-red-600 hover:underline disabled:opacity-50"
    >
      삭제
    </button>
  );
}
```

> MASTER.md의 "모달 중첩 금지" 원칙에 맞춰 native `confirm()` 다이얼로그를 사용한다. shadcn Dialog로 별도 confirm UI를 만들지 않는다.

- [ ] **Step 2: 페이지 작성**

Create `app/(admin)/admin/guide/faq/manage/page.tsx`:
```tsx
import Link from 'next/link';
import { getAdminFaqs } from '@/lib/guide/faqs';
import {
  USER_FAQ_CATEGORY_LABEL,
  ADMIN_FAQ_CATEGORY_LABEL,
} from '@/lib/guide/categories';
import { Button } from '@/components/ui/button';
import { FaqDeleteButton } from '@/components/guide/FaqDeleteButton';

export const dynamic = 'force-dynamic';

export default async function FaqManagePage({
  searchParams,
}: {
  searchParams: { audience?: 'user' | 'admin'; q?: string };
}) {
  const faqs = await getAdminFaqs({
    audience: searchParams.audience,
    query: searchParams.q,
  });

  const labelFor = (audience: string, category: string) =>
    audience === 'user'
      ? (USER_FAQ_CATEGORY_LABEL as Record<string, string>)[category] ?? category
      : (ADMIN_FAQ_CATEGORY_LABEL as Record<string, string>)[category] ?? category;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold text-slate-900">FAQ 관리</h1>
        <Button asChild>
          <Link href="/admin/guide/faq/manage/new">새 FAQ 등록</Link>
        </Button>
      </header>

      <div className="mb-4 flex gap-2 text-sm">
        <Link href="/admin/guide/faq/manage" className={!searchParams.audience ? 'font-semibold text-sky-700' : 'text-slate-600'}>전체</Link>
        <Link href="/admin/guide/faq/manage?audience=user" className={searchParams.audience === 'user' ? 'font-semibold text-sky-700' : 'text-slate-600'}>사용자</Link>
        <Link href="/admin/guide/faq/manage?audience=admin" className={searchParams.audience === 'admin' ? 'font-semibold text-sky-700' : 'text-slate-600'}>관리자</Link>
      </div>

      {faqs.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          등록된 FAQ가 없습니다.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">대상</th>
              <th className="px-2 py-2">카테고리</th>
              <th className="px-2 py-2">노출 그룹</th>
              <th className="px-2 py-2">질문</th>
              <th className="px-2 py-2">순서</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {faqs.map(f => (
              <tr key={f.id}>
                <td className="px-2 py-2">{f.audience === 'user' ? '사용자' : '관리자'}</td>
                <td className="px-2 py-2">{labelFor(f.audience, f.category)}</td>
                <td className="px-2 py-2">{f.user_groups?.join(', ') ?? '-'}</td>
                <td className="px-2 py-2 max-w-md truncate">{f.question}</td>
                <td className="px-2 py-2 tabular-nums">{f.sort_order}</td>
                <td className="px-2 py-2 space-x-2 whitespace-nowrap">
                  <Link href={`/admin/guide/faq/manage/${f.id}/edit`} className="text-sky-700 hover:underline">수정</Link>
                  <FaqDeleteButton id={f.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 시각 확인**

`/admin/guide/faq/manage`에 접근. 빈 상태 표시 확인. 다음 task에서 FAQ를 등록한 후 행이 표시되는지 다시 확인.

- [ ] **Step 4: Commit**

```bash
git add components/guide/FaqDeleteButton.tsx app/\(admin\)/admin/guide/faq/manage/page.tsx
git commit -m "feat(guide): add FAQ management list with delete confirmation"
```

---

### Task 24: `/admin/guide/faq/manage/new` 페이지

**Files:**
- Create: `app/(admin)/admin/guide/faq/manage/new/page.tsx`

- [ ] **Step 1: 페이지 작성**

Create `app/(admin)/admin/guide/faq/manage/new/page.tsx`:
```tsx
import Link from 'next/link';
import { FaqEditor } from '@/components/guide/FaqEditor';

export const dynamic = 'force-dynamic';

export default function NewFaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">새 FAQ 등록</h1>
        <p className="mt-1 text-sm text-slate-600">
          <Link href="/admin/guide/faq/manage" className="text-sky-700 hover:underline">← 목록으로</Link>
        </p>
      </header>
      <FaqEditor mode="create" />
    </div>
  );
}
```

- [ ] **Step 2: 동작 확인**

신규 FAQ 등록 후 목록에 노출되는지, 해당 그룹 사용자가 `/guide/faq`에서 볼 수 있는지 확인.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/guide/faq/manage/new/page.tsx
git commit -m "feat(guide): add FAQ creation page"
```

---

### Task 25: `/admin/guide/faq/manage/[id]/edit` 페이지

**Files:**
- Create: `app/(admin)/admin/guide/faq/manage/[id]/edit/page.tsx`

- [ ] **Step 1: 페이지 작성**

Create `app/(admin)/admin/guide/faq/manage/[id]/edit/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFaqById } from '@/lib/guide/faqs';
import { FaqEditor } from '@/components/guide/FaqEditor';

export const dynamic = 'force-dynamic';

export default async function EditFaqPage({ params }: { params: { id: string } }) {
  const faq = await getFaqById(params.id);
  if (!faq) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">FAQ 수정</h1>
        <p className="mt-1 text-sm text-slate-600">
          <Link href="/admin/guide/faq/manage" className="text-sky-700 hover:underline">← 목록으로</Link>
        </p>
      </header>
      <FaqEditor mode="edit" faq={faq} />
    </div>
  );
}
```

- [ ] **Step 2: 동작 확인**

기존 FAQ 수정 → 저장 → 목록에 반영 확인.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/guide/faq/manage/\[id\]/edit/page.tsx
git commit -m "feat(guide): add FAQ edit page"
```

---

## Phase 6 — 시드 + E2E

### Task 26: 초기 FAQ 시드 스크립트

**Files:**
- Create: `scripts/seed-faqs.ts`

- [ ] **Step 1: 스크립트 작성**

Create `scripts/seed-faqs.ts`:
```ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'admin@example.com';

if (!url || !serviceRole) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRole);

async function main() {
  const { data: owner } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', ownerEmail)
    .single<{ id: string }>();
  if (!owner) {
    console.error(`No profile for ${ownerEmail}`);
    process.exit(1);
  }

  const rows = [
    {
      audience: 'user', user_groups: ['group1'], category: 'purchase',
      question: '검토대기 중인 주문을 취소하면 예치금은 어떻게 되나요?',
      answer: '검토대기 단계에서는 예치금이 차감되지 않고 예약만 되어 있어, 취소 즉시 가용 잔액으로 돌아갑니다.',
      sort_order: 10,
    },
    {
      audience: 'user', user_groups: ['group1', 'group2'], category: 'inbound',
      question: '입고 요청은 다른 사람에게도 보이나요?',
      answer: '아니요. 본인과 관리자만 열람할 수 있는 비공개 게시글입니다.',
      sort_order: 10,
    },
    {
      audience: 'admin', user_groups: null, category: 'shipping-upload',
      question: '송장 엑셀을 두 번 업로드하면 어떻게 되나요?',
      answer: '동일 업로드에 대해 송장 재업로드는 멱등합니다. 새 송장만 갱신되며 기존 송장은 유지됩니다.',
      sort_order: 10,
    },
  ];

  for (const r of rows) {
    const { error } = await supabase.from('faqs').insert({
      ...r,
      created_by: owner.id,
      updated_by: owner.id,
    });
    if (error) console.error('Insert failed:', r.question, error.message);
    else console.log('Inserted:', r.question);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 로컬에서 시드 실행**

Run:
```bash
pnpm tsx scripts/seed-faqs.ts
```
Expected: 3개 항목이 inserted 메시지와 함께 들어감.

- [ ] **Step 3: 시각 확인**

`/guide/faq`, `/admin/guide/faq`, `/admin/guide/faq/manage`에서 시드 데이터가 보이는지 확인.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-faqs.ts
git commit -m "feat(guide): add initial FAQ seed script"
```

---

### Task 27: E2E — 사용자 가이드 + FAQ + 배너

**Files:**
- Create: `tests/e2e/guide-user.spec.ts`

- [ ] **Step 1: 기존 인증 헬퍼 패턴 확인**

Run:
```bash
Get-ChildItem tests/e2e | Select-Object -First 5
Get-Content tests/e2e/auth.setup.ts -ErrorAction SilentlyContinue
```
Expected: 기존 로그인 헬퍼/스토리지 패턴 확인. group1·group2 계정 정의 위치 파악.

- [ ] **Step 2: 테스트 파일 작성**

Create `tests/e2e/guide-user.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

// 가정: storageState로 인증된 group1/group2 사용자가 미리 준비되어 있음

test.describe('group1 사용자 가이드', () => {
  test.use({ storageState: 'tests/e2e/.auth/group1.json' });

  test('가이드 페이지가 group1 본문을 보여준다', async ({ page }) => {
    await page.goto('/guide');
    await expect(page.getByRole('heading', { name: '가이드' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '흐름 1: 상품 구매 (재고 적립)' })).toBeVisible();
  });

  test('FAQ 페이지에서 group1 노출 항목을 볼 수 있다', async ({ page }) => {
    await page.goto('/guide/faq');
    await expect(page.getByText('검토대기 중인 주문을 취소하면')).toBeVisible();
  });
});

test.describe('group2 사용자 가이드', () => {
  test.use({ storageState: 'tests/e2e/.auth/group2.json' });

  test('가이드 페이지가 group2 본문을 보여주고 group1 섹션은 없다', async ({ page }) => {
    await page.goto('/guide');
    await expect(page.getByRole('heading', { name: '사입재고 배송대행' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '흐름 1: 상품 구매 (재고 적립)' })).toHaveCount(0);
  });

  test('?as=group1 시도해도 본인 그룹 본문만 노출', async ({ page }) => {
    await page.goto('/guide?as=group1');
    // group2 본문만 — 흐름1 헤딩 없음
    await expect(page.getByRole('heading', { name: '흐름 1: 상품 구매 (재고 적립)' })).toHaveCount(0);
  });
});
```

> group1/group2 storageState 파일은 기존 user-groups e2e 테스트에서 만들어 두었다고 가정. 없으면 셋업 spec(`auth.setup.ts` 또는 별도 prelude) 확장 필요.

- [ ] **Step 3: 테스트 실행**

Run:
```bash
pnpm test:e2e tests/e2e/guide-user.spec.ts
```
Expected: 4개 모두 PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/guide-user.spec.ts
git commit -m "test(guide): e2e for user guide and FAQ visibility"
```

---

### Task 28: E2E — 관리자 FAQ CRUD + 권한 차단

**Files:**
- Create: `tests/e2e/guide-admin.spec.ts`

- [ ] **Step 1: 테스트 작성**

Create `tests/e2e/guide-admin.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test.describe('관리자 FAQ CRUD', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' });

  // 직렬 실행 — 등록한 항목을 같은 흐름에서 수정·삭제
  test.describe.configure({ mode: 'serial' });

  const QUESTION = '테스트 질문입니다';
  const QUESTION_EDITED = '수정된 테스트 질문';

  test('새 FAQ 등록 → 목록에 노출', async ({ page }) => {
    await page.goto('/admin/guide/faq/manage/new');
    await page.locator('select').nth(0).selectOption('user');
    await page.locator('select').nth(1).selectOption('purchase');
    await page.getByLabel(/질문/).fill(QUESTION);
    await page.getByLabel(/답변/).fill('테스트 답변 내용');
    await page.getByRole('button', { name: '등록' }).click();
    await expect(page).toHaveURL(/\/admin\/guide\/faq\/manage$/);
    await expect(page.getByText(QUESTION)).toBeVisible();
  });

  test('FAQ 수정', async ({ page }) => {
    await page.goto('/admin/guide/faq/manage');
    // 방금 등록한 항목 행의 "수정" 링크 — 본문 텍스트 기반 행 찾기
    await page.getByRole('row', { name: new RegExp(QUESTION) })
      .getByRole('link', { name: '수정' })
      .click();
    await page.getByLabel(/질문/).fill(QUESTION_EDITED);
    await page.getByRole('button', { name: '저장' }).click();
    await expect(page.getByText(QUESTION_EDITED)).toBeVisible();
  });

  test('FAQ 삭제', async ({ page }) => {
    await page.goto('/admin/guide/faq/manage');
    page.once('dialog', d => d.accept());
    await page.getByRole('row', { name: new RegExp(QUESTION_EDITED) })
      .getByRole('button', { name: '삭제' })
      .click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(QUESTION_EDITED)).toHaveCount(0);
  });
});

test.describe('등록한 FAQ가 사용자 페이지에 노출', () => {
  // 별도 데이터 픽스처: 사전 seed-faqs 스크립트로 group1 노출 FAQ 1개가 존재한다고 가정
  test.use({ storageState: 'tests/e2e/.auth/group1.json' });

  test('group1 사용자가 본인 그룹 FAQ를 볼 수 있다', async ({ page }) => {
    await page.goto('/guide/faq');
    await expect(page.getByText('검토대기 중인 주문을 취소하면')).toBeVisible();
  });
});

test.describe('FAQ 관리 권한 차단', () => {
  test.use({ storageState: 'tests/e2e/.auth/group1.json' });

  test('group1 사용자가 /admin/guide/faq/manage 접근 시 admin이 아니므로 redirect', async ({ page }) => {
    await page.goto('/admin/guide/faq/manage');
    // 기존 admin 가드 동작 — /shop 또는 다른 사용자 경로로 redirect
    await expect(page).not.toHaveURL(/\/admin\/guide\/faq\/manage$/);
  });
});

test.describe('첫 로그인 배너', () => {
  // 가정: 별도 storageState `banner-fresh.json` — guide_banner_dismissed_at이 NULL인 사용자
  test.use({ storageState: 'tests/e2e/.auth/banner-fresh.json' });

  test('배너가 노출되고 닫으면 다시 안 보인다', async ({ page }) => {
    await page.goto('/shop'); // 사용자 페이지 진입
    await expect(page.getByText('처음이시면 가이드를 먼저 읽어보세요')).toBeVisible();
    await page.getByRole('button', { name: '닫기' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('처음이시면 가이드를 먼저 읽어보세요')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('처음이시면 가이드를 먼저 읽어보세요')).toHaveCount(0);
  });
});
```

> 권한 차단 테스트와 배너 테스트는 storageState 분기 필요. `playwright.config.ts`의 `projects` 패턴에 맞춰 보정.

- [ ] **Step 2: storageState 정비**

`banner-fresh.json` 생성을 위한 setup spec이 없다면 추가. 또는 테스트 시작 시 DB로 본인 row의 `guide_banner_dismissed_at`을 NULL로 reset하는 헬퍼 추가.

`tests/e2e/banner.setup.ts`:
```ts
import { test as setup } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

setup('reset banner dismiss', async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await supabase
    .from('profiles')
    .update({ guide_banner_dismissed_at: null })
    .eq('email', process.env.E2E_GROUP1_EMAIL!);
});
```

playwright.config의 dependencies/projects에 setup 등록.

- [ ] **Step 3: 테스트 실행**

Run:
```bash
pnpm test:e2e tests/e2e/guide-admin.spec.ts
```
Expected: 모두 PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/guide-admin.spec.ts tests/e2e/banner.setup.ts
git commit -m "test(guide): e2e for admin FAQ CRUD and banner dismiss"
```

---

### Task 29: 최종 회귀 검증

- [ ] **Step 1: 전체 검증 실행**

Run:
```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```
Expected: 모두 통과.

- [ ] **Step 2: 수동 검증 체크리스트**

`pnpm dev`로 실행하고:
- group1 / group2 / admin 세 계정으로 `/guide` 진입 — 각각 다른 본문 노출
- admin이 `/guide?as=group2` — group2 본문 미리보기 가능
- group2가 `/guide?as=group1` — 무시되고 group2 본문만
- `/guide/faq`, `/admin/guide/faq` 정상 동작
- 관리자 FAQ 등록/수정/삭제 동작
- 첫 로그인 배너 노출 → 닫기 → 새로고침 후 미노출
- 비관리자가 `/admin/guide/faq/manage` 접근 시 차단

- [ ] **Step 3: 최종 commit (필요 시)**

회귀 검증에서 수정한 게 있다면 별도 commit. 없으면 생략.

---

## Self-Review Notes

- 모든 spec 섹션이 task로 매핑됨:
  - 라우트 → Task 15, 16, 20, 21, 23, 24, 25
  - 데이터 모델 → Task 1
  - 입문 본문 → Task 11~14
  - FAQ 표시 → Task 17~21
  - FAQ 관리 → Task 22~25
  - 권한·RLS → Task 1 (RLS), 5 (server action guard), 7 (group2 prefix)
  - 배너 → Task 6, 10
  - 사이드바 → Task 8, 9
  - 카테고리 enum → Task 3
  - Zod 검증 → Task 4
  - markdown sanitize → Task 2
  - 시드 → Task 26
  - 테스트 → Task 2, 3, 4, 5, 27, 28
- `react-markdown` 등 의존성은 Task 2에서 추가
- `set_updated_at` 함수는 Task 1 Step 1에서 존재 확인 후 마이그레이션 사용
- group2의 `/guide` 허용은 Task 7
- 관리자 `?as=group2` 토글은 Task 15
- `dynamic = 'force-dynamic'`은 모든 가이드 페이지 상단에 명시됨

## Out of Scope (이 plan에서 다루지 않는 것)

- 다국어
- PDF 출력
- 가이드 본문 콘텐츠를 DB로 옮기는 작업
- FAQ 소프트 삭제·복구
- FAQ 항목 조회수/유용성 피드백
- 스크린샷·다이어그램 추가 (출시 후 별도 콘텐츠 PR로 점진 추가)
- 헬프 아이콘 / 맥락 인지 진입점
