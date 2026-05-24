# Admin User Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add instant name search with Korean initial-consonant matching to `/admin/users`.

**Architecture:** Keep profile loading in the existing server page, then filter by tab and search query before Korean-name sorting. Put Hangul initial extraction and matching in a pure helper with unit tests. Put the search input in a small client component that syncs the typed value into the URL `q` parameter while preserving the current tab filter.

**Tech Stack:** Next.js App Router, React 18, TypeScript, Supabase SSR client, Vitest, Tailwind CSS.

---

## File Structure

- Create `lib/admin/user-search.ts`: pure helper functions for normalizing search text, generating Hangul initials, and matching a profile name against a query.
- Create `tests/unit/admin-user-search.test.ts`: focused Vitest coverage for Korean name search and initial-consonant matching.
- Create `components/admin/AdminUserSearchInput.tsx`: client component that updates `/admin/users?q=...` with `router.replace` as the admin types.
- Modify `app/(admin)/admin/users/page.tsx`: read `searchParams.q`, preserve `q` in tab links, render the search input, apply name search after tab filtering, and keep Korean-name sort.

## Task 1: Add Search Helper Tests

**Files:**
- Create: `tests/unit/admin-user-search.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/admin-user-search.test.ts` with this exact content:

```ts
import { describe, expect, it } from 'vitest';
import { getHangulInitials, matchesAdminUserNameQuery } from '@/lib/admin/user-search';

describe('admin user search helpers', () => {
  it('generates Korean initial consonants for complete Hangul syllables', () => {
    expect(getHangulInitials('김민정')).toBe('ㄱㅁㅈ');
  });

  it('matches a full Korean initial query', () => {
    expect(matchesAdminUserNameQuery('김민정', 'ㄱㅁㅈ')).toBe(true);
  });

  it('matches a partial Korean initial query', () => {
    expect(matchesAdminUserNameQuery('김민정', 'ㄱㅁ')).toBe(true);
  });

  it('matches a partial Korean name query', () => {
    expect(matchesAdminUserNameQuery('김민정', '민정')).toBe(true);
  });

  it('treats an empty query as a match', () => {
    expect(matchesAdminUserNameQuery('김민정', '   ')).toBe(true);
  });

  it('matches non-Korean letters case-insensitively', () => {
    expect(matchesAdminUserNameQuery('TestUser', 'test')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/admin-user-search.test.ts
```

Expected: FAIL because `@/lib/admin/user-search` does not exist yet.

- [ ] **Step 3: Commit the failing test**

Run:

```bash
git add tests/unit/admin-user-search.test.ts
git commit -m "test: cover admin user name search"
```

Expected: commit succeeds with only the new test file staged.

## Task 2: Implement Hangul Search Helper

**Files:**
- Create: `lib/admin/user-search.ts`
- Test: `tests/unit/admin-user-search.test.ts`

- [ ] **Step 1: Add the helper implementation**

Create `lib/admin/user-search.ts` with this exact content:

```ts
const HANGUL_BASE_CODE = 0xac00;
const HANGUL_LAST_CODE = 0xd7a3;
const HANGUL_INITIAL_UNIT = 588;

const HANGUL_INITIALS = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR');
}

export function getHangulInitials(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < HANGUL_BASE_CODE || code > HANGUL_LAST_CODE) return char;

      const initialIndex = Math.floor((code - HANGUL_BASE_CODE) / HANGUL_INITIAL_UNIT);
      return HANGUL_INITIALS[initialIndex] ?? char;
    })
    .join('');
}

export function matchesAdminUserNameQuery(name: string, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  const normalizedName = normalizeSearchValue(name);
  const normalizedInitials = normalizeSearchValue(getHangulInitials(name));

  return normalizedName.includes(normalizedQuery) || normalizedInitials.includes(normalizedQuery);
}
```

- [ ] **Step 2: Run the helper test**

Run:

```bash
pnpm vitest run tests/unit/admin-user-search.test.ts
```

Expected: PASS for all 6 tests.

- [ ] **Step 3: Commit the helper implementation**

Run:

```bash
git add lib/admin/user-search.ts tests/unit/admin-user-search.test.ts
git commit -m "feat: add admin user search helper"
```

Expected: commit succeeds with the helper and test.

## Task 3: Add URL-Synced Search Input

**Files:**
- Create: `components/admin/AdminUserSearchInput.tsx`

- [ ] **Step 1: Create the client component**

Create `components/admin/AdminUserSearchInput.tsx` with this exact content:

```tsx
'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

type AdminUserSearchInputProps = {
  initialQuery: string;
};

export function AdminUserSearchInput({ initialQuery }: AdminUserSearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextValue = value.trim();
    const currentValue = searchParams.get('q')?.trim() ?? '';

    if (currentValue === nextValue) return;

    if (nextValue) {
      params.set('q', nextValue);
    } else {
      params.delete('q');
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [pathname, router, searchParams, value]);

  return (
    <div className="relative max-w-sm">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="이름 또는 초성 검색"
        className="h-9 w-full rounded-md border bg-background pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        aria-label="사용자 이름 또는 초성 검색"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="검색어 지우기"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      {isPending ? <span className="sr-only">검색 중</span> : null}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
pnpm typecheck
```

Expected: PASS. The component is not imported yet, but its types should compile.

- [ ] **Step 3: Commit the search input component**

Run:

```bash
git add components/admin/AdminUserSearchInput.tsx
git commit -m "feat: add admin user search input"
```

Expected: commit succeeds with only the component file.

## Task 4: Wire Search Into Admin Users Page

**Files:**
- Modify: `app/(admin)/admin/users/page.tsx`
- Use: `components/admin/AdminUserSearchInput.tsx`
- Use: `lib/admin/user-search.ts`

- [ ] **Step 1: Add imports**

In `app/(admin)/admin/users/page.tsx`, add these imports near the existing imports:

```ts
import { AdminUserSearchInput } from '@/components/admin/AdminUserSearchInput';
import { matchesAdminUserNameQuery } from '@/lib/admin/user-search';
```

- [ ] **Step 2: Accept the `q` search parameter**

Replace the page props type:

```ts
  searchParams: { filter?: string };
```

with:

```ts
  searchParams: { filter?: string; q?: string };
```

- [ ] **Step 3: Normalize the query**

Below the existing `const filter = searchParams.filter;`, add:

```ts
  const q = searchParams.q?.trim() ?? '';
```

- [ ] **Step 4: Apply name search before sorting**

Replace the current `const filtered = list...` block with:

```ts
  const filtered = list
    .filter((u) => {
      if (filter === 'low') return Number(u.deposit_balance) <= Number(u.low_balance_threshold);
      if (filter === 'pending') return u.status === 'pending';
      if (filter === 'rejected') return u.status === 'rejected';
      return true;
    })
    .filter((u) => matchesAdminUserNameQuery(u.name || '', q))
    .sort((a, b) => koreanNameCollator.compare(a.name || '', b.name || ''));
```

- [ ] **Step 5: Preserve `q` in tab links**

Inside the `TABS.map` callback, replace:

```ts
              const href = t.key ? `/admin/users?filter=${t.key}` : '/admin/users';
```

with:

```ts
              const params = new URLSearchParams();
              if (t.key) params.set('filter', t.key);
              if (q) params.set('q', q);
              const query = params.toString();
              const href = query ? `/admin/users?${query}` : '/admin/users';
```

- [ ] **Step 6: Render the search input**

Inside the card, after the tabs block and before the empty-state/table conditional, add:

```tsx
        <div className="border-b px-4 py-3">
          <AdminUserSearchInput initialQuery={q} />
        </div>
```

- [ ] **Step 7: Make the empty state search-aware**

Replace the empty-state copy:

```tsx
            <p className="text-sm text-muted-foreground">해당 사용자가 없습니다.</p>
```

with:

```tsx
            <p className="text-sm text-muted-foreground">
              {q ? '검색 결과가 없습니다.' : '해당 사용자가 없습니다.'}
            </p>
```

- [ ] **Step 8: Run verification**

Run:

```bash
pnpm vitest run tests/unit/admin-user-search.test.ts
pnpm typecheck
```

Expected: both commands PASS.

- [ ] **Step 9: Commit the page wiring**

Run:

```bash
git add "app/(admin)/admin/users/page.tsx" components/admin/AdminUserSearchInput.tsx lib/admin/user-search.ts tests/unit/admin-user-search.test.ts
git commit -m "feat: search admin users by name"
```

Expected: commit succeeds with the page wiring.

## Task 5: Browser Verification

**Files:**
- Verify: `/admin/users`

- [ ] **Step 1: Start the dev server if one is not already running**

Run:

```bash
pnpm dev
```

Expected: Next.js starts and prints a local URL such as `http://localhost:3000`.

- [ ] **Step 2: Open the admin user page**

Use the in-app browser to open:

```text
http://localhost:3000/admin/users
```

Expected: the user management page renders with tabs and a search input above the table.

- [ ] **Step 3: Test Korean name search**

Type:

```text
김
```

Expected: only users whose name includes `김` remain visible, and the URL contains `q=%EA%B9%80`.

- [ ] **Step 4: Test Korean initial search**

Clear the input and type:

```text
ㄱ
```

Expected: users whose generated initials contain `ㄱ` remain visible, including names beginning with `김`.

- [ ] **Step 5: Test tab preservation**

With a query still entered, click the `잔액 낮음` tab.

Expected: the URL keeps both `filter=low` and `q=...`, and the list shows only low-balance users matching the query.

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short --branch
```

Expected: clean working tree after the implementation commits.
