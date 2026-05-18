# 교환/반품 및 CS 문의 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private `교환/반품 및 CS 문의` board where customers submit exchange, return, and CS tickets with optional attachments, and admins respond through comments with separate status tracking and unread badges.

**Architecture:** Build a separate support-request subsystem beside the existing inbound-request subsystem: new Supabase tables/RPCs/Storage bucket, new `lib/support/**` helpers, new `components/support/**`, and new user/admin routes. Reuse shared UI primitives, date formatting, Supabase helpers, and the inbound implementation patterns, but keep support data, actions, and unread counts isolated.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase Postgres/RLS/RPC/Storage/Realtime, Tailwind CSS, shadcn/ui primitives, lucide-react, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-18-support-requests-design.md`

**Branch:** `feature/CStable`

---

## File Structure

### Created Files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260518000002_support_requests.sql` | Support tables, RLS, private Storage bucket, RPCs, Realtime publication |
| `lib/support/permissions.ts` | Pure state-machine and edit-window helpers |
| `lib/support/storage.ts` | Support-safe filename helper |
| `lib/support/upload-paths.ts` | Support attachment path and cleanup helpers |
| `lib/support/action-errors.ts` | Maps SQL/RPC error codes to Korean UI messages |
| `lib/support/queries.ts` | Server-side list/detail/unread query helpers |
| `lib/actions/support-request.ts` | Server actions for submit, cancel, status, read, comments, attachment URLs |
| `components/support/SupportStatusBadge.tsx` | Support status and category pills |
| `components/support/SupportAttachmentList.tsx` | Signed URL attachment rendering |
| `components/support/SupportCommentList.tsx` | Comment thread with edit/delete affordances |
| `components/support/SupportCommentForm.tsx` | Client comment form |
| `components/support/SupportUnreadBadge.tsx` | Realtime unread-count badge |
| `app/(user)/support-requests/page.tsx` | User support request list |
| `app/(user)/support-requests/new/page.tsx` | User new-request shell |
| `app/(user)/support-requests/new/NewSupportRequestForm.tsx` | User new-request client form |
| `app/(user)/support-requests/[id]/page.tsx` | User support request detail |
| `app/(user)/support-requests/[id]/CancelSupportRequestButton.tsx` | User cancel button |
| `app/(admin)/admin/support-requests/page.tsx` | Admin support request list |
| `app/(admin)/admin/support-requests/[id]/page.tsx` | Admin support request detail |
| `app/(admin)/admin/support-requests/[id]/StatusControls.tsx` | Admin status controls |
| `tests/unit/support-types.test.ts` | Type and label coverage |
| `tests/unit/support-schemas.test.ts` | Zod schema coverage |
| `tests/unit/support-permissions.test.ts` | State-machine and edit-window coverage |
| `tests/unit/support-upload-paths.test.ts` | Attachment path cleanup coverage |
| `tests/unit/support-action-errors.test.ts` | RPC error mapping coverage |

### Modified Files

| Path | Change |
|---|---|
| `lib/types.ts` | Add support status/category/reference types and labels |
| `lib/schemas.ts` | Add `supportRequestCreateSchema`, `supportCommentSchema` |
| `lib/db-types.ts` | Regenerate after migration if local Supabase is available |
| `components/NavUser.tsx` | Add user menu item and support unread badge |
| `components/admin-nav-items.ts` | Add admin menu item |
| `components/AdminSidebar.tsx` | Render support unread badge for admin menu item |
| `components/MobileAdminNav.tsx` | Render support unread badge for mobile admin menu |
| `components/AdminHeader.tsx` | Pass support unread count to mobile admin nav |
| `app/(user)/layout.tsx` | Fetch and pass user support unread count |
| `app/(admin)/admin/layout.tsx` | Fetch and pass admin support unread count |
| `lib/auth/user-groups.ts` | Allow group2 access to `/support-requests` |
| `README.md` | Add route/menu summary after implementation |

---

## Task 1: Types, Labels, and Status Badges

**Files:**
- Modify: `lib/types.ts`
- Create: `components/support/SupportStatusBadge.tsx`
- Test: `tests/unit/support-types.test.ts`

- [ ] **Step 1: Write the failing type test**

Create `tests/unit/support-types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_REFERENCE_TYPE_LABEL,
  SUPPORT_STATUS_LABEL,
  type SupportCategory,
  type SupportReferenceType,
  type SupportStatus,
} from '@/lib/types';

describe('support labels', () => {
  it('maps support statuses to Korean labels', () => {
    expect(SUPPORT_STATUS_LABEL.open).toBe('접수');
    expect(SUPPORT_STATUS_LABEL.in_progress).toBe('처리중');
    expect(SUPPORT_STATUS_LABEL.completed).toBe('완료');
    expect(SUPPORT_STATUS_LABEL.cancelled).toBe('취소');
    expect(Object.keys(SUPPORT_STATUS_LABEL)).toHaveLength(4);
  });

  it('maps support categories to Korean labels', () => {
    expect(SUPPORT_CATEGORY_LABEL.exchange).toBe('교환');
    expect(SUPPORT_CATEGORY_LABEL.return).toBe('반품');
    expect(SUPPORT_CATEGORY_LABEL.cs).toBe('CS문의');
    expect(SUPPORT_CATEGORY_LABEL.other).toBe('기타');
    expect(Object.keys(SUPPORT_CATEGORY_LABEL)).toHaveLength(4);
  });

  it('maps reference types to Korean labels', () => {
    expect(SUPPORT_REFERENCE_TYPE_LABEL.none).toBe('없음');
    expect(SUPPORT_REFERENCE_TYPE_LABEL.order).toBe('주문번호');
    expect(SUPPORT_REFERENCE_TYPE_LABEL.tracking).toBe('운송장번호');
    expect(SUPPORT_REFERENCE_TYPE_LABEL.other).toBe('기타');
    expect(Object.keys(SUPPORT_REFERENCE_TYPE_LABEL)).toHaveLength(4);
  });
});

describe('support union types', () => {
  it('accepts the known values', () => {
    const statuses: SupportStatus[] = ['open', 'in_progress', 'completed', 'cancelled'];
    const categories: SupportCategory[] = ['exchange', 'return', 'cs', 'other'];
    const references: SupportReferenceType[] = ['none', 'order', 'tracking', 'other'];

    expect(statuses).toHaveLength(4);
    expect(categories).toHaveLength(4);
    expect(references).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm test -- support-types`

Expected: FAIL because the support exports do not exist.

- [ ] **Step 3: Add support types and labels**

Append to `lib/types.ts`:

```ts
export type SupportStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';
export type SupportCategory = 'exchange' | 'return' | 'cs' | 'other';
export type SupportReferenceType = 'none' | 'order' | 'tracking' | 'other';

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: '접수',
  in_progress: '처리중',
  completed: '완료',
  cancelled: '취소',
};

export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = {
  exchange: '교환',
  return: '반품',
  cs: 'CS문의',
  other: '기타',
};

export const SUPPORT_REFERENCE_TYPE_LABEL: Record<SupportReferenceType, string> = {
  none: '없음',
  order: '주문번호',
  tracking: '운송장번호',
  other: '기타',
};
```

- [ ] **Step 4: Add status/category badge component**

Create `components/support/SupportStatusBadge.tsx`:

```tsx
import { StatusPill, type StatusPillTone } from '@/components/StatusBadge';
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUS_LABEL,
  type SupportCategory,
  type SupportStatus,
} from '@/lib/types';

const SUPPORT_STATUS_TONE: Record<SupportStatus, StatusPillTone> = {
  open: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
};

const SUPPORT_CATEGORY_TONE: Record<SupportCategory, StatusPillTone> = {
  exchange: 'violet',
  return: 'warning',
  cs: 'info',
  other: 'neutral',
};

export function SupportStatusBadge({
  status,
  className,
}: {
  status: SupportStatus;
  className?: string;
}) {
  return (
    <StatusPill tone={SUPPORT_STATUS_TONE[status]} className={className}>
      {SUPPORT_STATUS_LABEL[status]}
    </StatusPill>
  );
}

export function SupportCategoryBadge({
  category,
  className,
}: {
  category: SupportCategory;
  className?: string;
}) {
  return (
    <StatusPill tone={SUPPORT_CATEGORY_TONE[category]} className={className}>
      {SUPPORT_CATEGORY_LABEL[category]}
    </StatusPill>
  );
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
pnpm test -- support-types
pnpm typecheck
```

Expected: support type tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts components/support/SupportStatusBadge.tsx tests/unit/support-types.test.ts
git commit -m "feat(support): add support request types and badges"
```

---

## Task 2: Schemas, Permissions, Upload Helpers, and Error Mappers

**Files:**
- Modify: `lib/schemas.ts`
- Create: `lib/support/permissions.ts`
- Create: `lib/support/storage.ts`
- Create: `lib/support/upload-paths.ts`
- Create: `lib/support/action-errors.ts`
- Test: `tests/unit/support-schemas.test.ts`
- Test: `tests/unit/support-permissions.test.ts`
- Test: `tests/unit/support-upload-paths.test.ts`
- Test: `tests/unit/support-action-errors.test.ts`

- [ ] **Step 1: Write schema tests**

Create `tests/unit/support-schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { supportCommentSchema, supportRequestCreateSchema } from '@/lib/schemas';

describe('supportRequestCreateSchema', () => {
  it('accepts a valid support request', () => {
    const result = supportRequestCreateSchema.safeParse({
      category: 'exchange',
      title: '상품 교환 요청',
      body: '사이즈 교환 부탁드립니다.',
      referenceType: 'order',
      referenceValue: 'ORDER-100',
    });

    expect(result.success).toBe(true);
  });

  it('defaults reference fields when omitted', () => {
    const result = supportRequestCreateSchema.safeParse({
      category: 'cs',
      title: '문의',
      body: '내용입니다.',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.referenceType).toBe('none');
      expect(result.data.referenceValue).toBeNull();
    }
  });

  it('rejects an invalid category', () => {
    const result = supportRequestCreateSchema.safeParse({
      category: 'refund',
      title: '문의',
      body: '내용입니다.',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty title and body', () => {
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'return',
        title: '',
        body: '내용입니다.',
      }).success,
    ).toBe(false);
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'return',
        title: '반품',
        body: '',
      }).success,
    ).toBe(false);
  });

  it('rejects long fields', () => {
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'other',
        title: 'x'.repeat(201),
        body: '내용입니다.',
      }).success,
    ).toBe(false);
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'other',
        title: '기타',
        body: 'x'.repeat(5001),
      }).success,
    ).toBe(false);
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'other',
        title: '기타',
        body: '내용입니다.',
        referenceType: 'other',
        referenceValue: 'x'.repeat(101),
      }).success,
    ).toBe(false);
  });
});

describe('supportCommentSchema', () => {
  it('accepts a short comment', () => {
    expect(supportCommentSchema.safeParse({ body: '확인했습니다.' }).success).toBe(true);
  });

  it('rejects empty and overlong comments', () => {
    expect(supportCommentSchema.safeParse({ body: '' }).success).toBe(false);
    expect(supportCommentSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Add Zod schemas**

Append to `lib/schemas.ts`:

```ts
const supportCategorySchema = z.enum(['exchange', 'return', 'cs', 'other']);
const supportReferenceTypeSchema = z.enum(['none', 'order', 'tracking', 'other']);

export const supportRequestCreateSchema = z.object({
  category: supportCategorySchema,
  title: z.string().trim().min(1, '제목을 입력해주세요').max(200, '제목은 200자 이하여야 합니다'),
  body: z.string().trim().min(1, '내용을 입력해주세요').max(5000, '내용은 5000자 이하여야 합니다'),
  referenceType: supportReferenceTypeSchema.default('none'),
  referenceValue: z
    .string()
    .trim()
    .max(100, '참고번호는 100자 이하여야 합니다')
    .optional()
    .transform((value) => (value ? value : null)),
});

export const supportCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, '내용을 입력해주세요')
    .max(2000, '댓글은 2000자 이하여야 합니다'),
});
```

- [ ] **Step 3: Write permission tests**

Create `tests/unit/support-permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  canCancelSupportRequest,
  canEditSupportComment,
  getSupportCommentAccessError,
  canTransitionSupportStatus,
  isSupportLocked,
} from '@/lib/support/permissions';

describe('canTransitionSupportStatus', () => {
  it('allows the planned admin transitions', () => {
    expect(canTransitionSupportStatus('open', 'in_progress')).toBe(true);
    expect(canTransitionSupportStatus('open', 'cancelled')).toBe(true);
    expect(canTransitionSupportStatus('in_progress', 'completed')).toBe(true);
    expect(canTransitionSupportStatus('in_progress', 'cancelled')).toBe(true);
  });

  it('blocks skipped, same-state, and reopen transitions', () => {
    expect(canTransitionSupportStatus('open', 'completed')).toBe(false);
    expect(canTransitionSupportStatus('open', 'open')).toBe(false);
    expect(canTransitionSupportStatus('completed', 'in_progress')).toBe(false);
    expect(canTransitionSupportStatus('cancelled', 'open')).toBe(false);
  });
});

describe('isSupportLocked', () => {
  it('locks completed and cancelled only', () => {
    expect(isSupportLocked('open')).toBe(false);
    expect(isSupportLocked('in_progress')).toBe(false);
    expect(isSupportLocked('completed')).toBe(true);
    expect(isSupportLocked('cancelled')).toBe(true);
  });
});

describe('canCancelSupportRequest', () => {
  it('lets owners cancel only open requests', () => {
    expect(canCancelSupportRequest({ status: 'open', isOwner: true, isAdmin: false })).toBe(true);
    expect(canCancelSupportRequest({ status: 'in_progress', isOwner: true, isAdmin: false })).toBe(false);
  });

  it('lets admins cancel open and in_progress requests', () => {
    expect(canCancelSupportRequest({ status: 'open', isOwner: false, isAdmin: true })).toBe(true);
    expect(canCancelSupportRequest({ status: 'in_progress', isOwner: false, isAdmin: true })).toBe(true);
    expect(canCancelSupportRequest({ status: 'completed', isOwner: false, isAdmin: true })).toBe(false);
  });
});

describe('canEditSupportComment', () => {
  const now = new Date('2026-05-18T10:00:00Z');

  it('allows an author inside the 10 minute window', () => {
    expect(
      canEditSupportComment({
        createdAt: new Date('2026-05-18T09:51:00Z'),
        isAuthor: true,
        isAdmin: false,
        now,
      }),
    ).toBe(true);
  });

  it('blocks an author at exactly 10 minutes', () => {
    expect(
      canEditSupportComment({
        createdAt: new Date('2026-05-18T09:50:00Z'),
        isAuthor: true,
        isAdmin: false,
        now,
      }),
    ).toBe(false);
  });

  it('allows admins any time', () => {
    expect(
      canEditSupportComment({
        createdAt: new Date('2024-01-01T00:00:00Z'),
        isAuthor: false,
        isAdmin: true,
        now,
      }),
    ).toBe(true);
  });
});

describe('getSupportCommentAccessError', () => {
  const now = new Date('2026-05-18T10:00:00Z');

  it('returns null when author is inside edit window', () => {
    expect(
      getSupportCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u1',
        createdAt: '2026-05-18T09:55:00Z',
        isAdmin: false,
        now,
        action: '수정',
      }),
    ).toBeNull();
  });

  it('returns a time-window message for expired author comments', () => {
    expect(
      getSupportCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u1',
        createdAt: '2026-05-18T09:49:59Z',
        isAdmin: false,
        now,
        action: '삭제',
      }),
    ).toBe('댓글 삭제 가능 시간이 지났습니다 (10분).');
  });

  it('returns forbidden for non-author non-admin users', () => {
    expect(
      getSupportCommentAccessError({
        authorId: 'u1',
        currentUserId: 'u2',
        createdAt: '2026-05-18T09:59:00Z',
        isAdmin: false,
        now,
      }),
    ).toBe('권한이 없습니다.');
  });
});
```

- [ ] **Step 4: Implement permission helpers**

Create `lib/support/permissions.ts`:

```ts
import type { SupportStatus } from '@/lib/types';

export const SUPPORT_COMMENT_EDIT_WINDOW_MS = 10 * 60 * 1000;

const SUPPORT_TRANSITIONS: Record<SupportStatus, readonly SupportStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionSupportStatus(from: SupportStatus, to: SupportStatus): boolean {
  return SUPPORT_TRANSITIONS[from].includes(to);
}

export function isSupportLocked(status: SupportStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export function canCancelSupportRequest({
  status,
  isOwner,
  isAdmin,
}: {
  status: SupportStatus;
  isOwner: boolean;
  isAdmin: boolean;
}): boolean {
  if (isAdmin) return status === 'open' || status === 'in_progress';
  return isOwner && status === 'open';
}

export function canEditSupportComment({
  createdAt,
  isAuthor,
  isAdmin,
  now = new Date(),
}: {
  createdAt: Date;
  isAuthor: boolean;
  isAdmin: boolean;
  now?: Date;
}): boolean {
  if (isAdmin) return true;
  if (!isAuthor) return false;
  return now.getTime() - createdAt.getTime() < SUPPORT_COMMENT_EDIT_WINDOW_MS;
}

export function getSupportCommentAccessError({
  authorId,
  currentUserId,
  createdAt,
  isAdmin,
  now = new Date(),
  action = '수정',
}: {
  authorId: string;
  currentUserId: string;
  createdAt: string;
  isAdmin: boolean;
  now?: Date;
  action?: '수정' | '삭제';
}): string | null {
  const isAuthor = authorId === currentUserId;
  if (!isAdmin && !isAuthor) return '권한이 없습니다.';
  if (
    !canEditSupportComment({
      createdAt: new Date(createdAt),
      isAuthor,
      isAdmin,
      now,
    })
  ) {
    return `댓글 ${action} 가능 시간이 지났습니다 (10분).`;
  }
  return null;
}
```

- [ ] **Step 5: Write upload helper tests**

Create `tests/unit/support-upload-paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { supportAttachmentPath, supportCleanupPaths } from '@/lib/support/upload-paths';
import { safeSupportFilename } from '@/lib/support/storage';

describe('safeSupportFilename', () => {
  it('keeps Korean names and safe punctuation', () => {
    expect(safeSupportFilename('반품 사진 1.png')).toBe('반품_사진_1.png');
  });

  it('removes leading dots and collapses unsafe characters', () => {
    expect(safeSupportFilename('../../secret?.pdf')).toBe('secret_.pdf');
  });
});

describe('supportAttachmentPath', () => {
  it('builds a canonical private storage path', () => {
    expect(
      supportAttachmentPath({
        userId: 'user-1',
        requestId: 'request-1',
        attachmentId: 'attachment-1',
        originalName: '교환 증빙.png',
      }),
    ).toBe('user-1/request-1/attachments/attachment-1-교환_증빙.png');
  });
});

describe('supportCleanupPaths', () => {
  it('drops empty paths', () => {
    expect(supportCleanupPaths(['a/b.png', '', 'c/d.pdf'])).toEqual(['a/b.png', 'c/d.pdf']);
  });
});
```

- [ ] **Step 6: Implement upload helpers**

Create `lib/support/storage.ts`:

```ts
export function safeSupportFilename(name: string): string {
  const sanitized = name
    .normalize('NFKC')
    .replace(/^\.+/, '')
    .replace(/\.{2,}/g, '.')
    .replace(/[^\w가-힣.\-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || 'attachment';
}
```

Create `lib/support/upload-paths.ts`:

```ts
import { safeSupportFilename } from '@/lib/support/storage';

export function supportAttachmentPath({
  userId,
  requestId,
  attachmentId,
  originalName,
}: {
  userId: string;
  requestId: string;
  attachmentId: string;
  originalName: string;
}): string {
  return `${userId}/${requestId}/attachments/${attachmentId}-${safeSupportFilename(originalName)}`;
}

export function supportCleanupPaths(paths: string[]): string[] {
  return paths.filter(Boolean);
}
```

- [ ] **Step 7: Write and implement error mapper tests**

Create `tests/unit/support-action-errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  mapSupportCancelError,
  mapSupportCommentError,
  mapSupportStatusError,
  mapSubmitSupportRequestError,
} from '@/lib/support/action-errors';

describe('support action error mappers', () => {
  it('maps submit errors', () => {
    expect(mapSubmitSupportRequestError('RATE_LIMITED')).toBe('잠시 후 다시 시도해주세요 (분당 5건 제한).');
    expect(mapSubmitSupportRequestError('INVALID_CATEGORY')).toBe('문의 유형을 확인해주세요.');
    expect(mapSubmitSupportRequestError('UNKNOWN')).toBeNull();
  });

  it('maps cancel errors', () => {
    expect(mapSupportCancelError('NOT_CANCELLABLE')).toBe('취소할 수 없는 상태입니다.');
    expect(mapSupportCancelError('FORBIDDEN')).toBe('권한이 없습니다.');
  });

  it('maps status errors', () => {
    expect(mapSupportStatusError('FORBIDDEN')).toBe('관리자만 변경할 수 있습니다.');
    expect(mapSupportStatusError('INVALID_TRANSITION')).toBe('허용되지 않은 상태 전이입니다.');
  });

  it('maps comment errors', () => {
    expect(mapSupportCommentError('LOCKED')).toBe('이미 종결되어 댓글을 작성할 수 없습니다.');
    expect(mapSupportCommentError('INVALID_BODY')).toBe('댓글 내용을 확인해주세요.');
  });
});
```

Create `lib/support/action-errors.ts`:

```ts
export function mapSubmitSupportRequestError(message: string): string | null {
  if (message.includes('RATE_LIMITED')) return '잠시 후 다시 시도해주세요 (분당 5건 제한).';
  if (message.includes('INVALID_CATEGORY')) return '문의 유형을 확인해주세요.';
  if (message.includes('INVALID_REFERENCE_TYPE')) return '참고번호 유형을 확인해주세요.';
  if (message.includes('INVALID_BODY')) return '문의 내용을 확인해주세요.';
  return null;
}

export function mapSupportCancelError(message: string): string | null {
  if (message.includes('NOT_CANCELLABLE')) return '취소할 수 없는 상태입니다.';
  if (message.includes('FORBIDDEN')) return '권한이 없습니다.';
  return null;
}

export function mapSupportStatusError(message: string): string | null {
  if (message.includes('FORBIDDEN')) return '관리자만 변경할 수 있습니다.';
  if (message.includes('INVALID_TRANSITION')) return '허용되지 않은 상태 전이입니다.';
  return null;
}

export function mapSupportCommentError(message: string): string | null {
  if (message.includes('LOCKED')) return '이미 종결되어 댓글을 작성할 수 없습니다.';
  if (message.includes('INVALID_BODY')) return '댓글 내용을 확인해주세요.';
  if (message.includes('RATE_LIMITED')) return '잠시 후 다시 시도해주세요 (분당 20건 제한).';
  if (message.includes('FORBIDDEN')) return '권한이 없습니다.';
  return null;
}
```

- [ ] **Step 8: Run tests and commit**

Run:

```bash
pnpm test -- support-schemas support-permissions support-upload-paths support-action-errors
pnpm typecheck
```

Expected: all new helper tests PASS, typecheck clean.

Commit:

```bash
git add lib/schemas.ts lib/support tests/unit/support-schemas.test.ts tests/unit/support-permissions.test.ts tests/unit/support-upload-paths.test.ts tests/unit/support-action-errors.test.ts
git commit -m "feat(support): add validation and helper layer"
```

---

## Task 3: Database Migration

**Files:**
- Create: `supabase/migrations/20260518000002_support_requests.sql`
- Optional generated update: `lib/db-types.ts`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260518000002_support_requests.sql`:

```sql
-- ============================================================================
-- 교환/반품 및 CS 문의 (Support Requests) - private board with comments
-- ============================================================================

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('exchange','return','cs','other')),
  title text not null check (length(title) between 1 and 200),
  body text not null check (length(body) between 1 and 5000),
  reference_type text not null default 'none' check (reference_type in ('none','order','tracking','other')),
  reference_value text check (reference_value is null or length(reference_value) <= 100),
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  last_comment_at timestamptz,
  last_comment_by_role text check (last_comment_by_role in ('user','admin')),
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_requests_user_idx on public.support_requests (user_id, created_at desc);
create index support_requests_status_idx on public.support_requests (status, created_at desc);
create index support_requests_category_idx on public.support_requests (category, created_at desc);
create index support_requests_updated_idx on public.support_requests (updated_at desc);

create table public.support_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_role text not null check (author_role in ('user','admin')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index support_comments_request_idx on public.support_request_comments (request_id, created_at);

create table public.support_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  original_name text not null check (length(original_name) between 1 and 255),
  content_type text not null default 'application/octet-stream',
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  unique (storage_path)
);

create index support_attachments_request_idx on public.support_request_attachments (request_id, created_at);

alter table public.support_requests enable row level security;
alter table public.support_request_comments enable row level security;
alter table public.support_request_attachments enable row level security;

create policy support_requests_owner_admin_select on public.support_requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy support_requests_self_delete on public.support_requests
  for delete using (user_id = auth.uid() and status = 'open');

create policy support_requests_admin_all on public.support_requests
  for all using (public.is_admin()) with check (public.is_admin());

create policy support_comments_select on public.support_request_comments
  for select using (
    exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

create policy support_comments_self_update on public.support_request_comments
  for update using (
    author_id = auth.uid()
    and created_at >= now() - interval '10 minutes'
  )
  with check (author_id = auth.uid());

create policy support_comments_self_delete on public.support_request_comments
  for delete using (
    author_id = auth.uid()
    and created_at >= now() - interval '10 minutes'
  );

create policy support_comments_admin_all on public.support_request_comments
  for all using (public.is_admin()) with check (public.is_admin());

create policy support_attachments_select on public.support_request_attachments
  for select using (
    exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

create policy support_attachments_owner_insert on public.support_request_attachments
  for insert with check (
    user_id = auth.uid()
    and public.is_active()
    and exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and r.user_id = auth.uid()
        and r.status = 'open'
    )
  );

create policy support_attachments_owner_delete on public.support_request_attachments
  for delete using (
    user_id = auth.uid()
    and exists (
      select 1 from public.support_requests r
      where r.id = request_id and r.status = 'open'
    )
  );

create policy support_attachments_admin_all on public.support_request_attachments
  for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public) values
  ('support-requests', 'support-requests', false)
  on conflict (id) do nothing;

create policy "support-requests owner read" on storage.objects
  for select using (
    bucket_id = 'support-requests'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy "support-requests owner write" on storage.objects
  for insert with check (
    bucket_id = 'support-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active()
  );

create policy "support-requests owner delete" on storage.objects
  for delete using (
    bucket_id = 'support-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "support-requests admin all" on storage.objects
  for all using (bucket_id = 'support-requests' and public.is_admin())
  with check (bucket_id = 'support-requests' and public.is_admin());

create or replace function public.submit_support_request_rpc(
  p_category text,
  p_title text,
  p_body text,
  p_reference_type text default 'none',
  p_reference_value text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not public.is_active() then
    raise exception 'FORBIDDEN';
  end if;
  if p_category not in ('exchange','return','cs','other') then
    raise exception 'INVALID_CATEGORY';
  end if;
  if coalesce(p_reference_type, 'none') not in ('none','order','tracking','other') then
    raise exception 'INVALID_REFERENCE_TYPE';
  end if;
  if length(trim(coalesce(p_title, ''))) < 1 or length(trim(p_title)) > 200 then
    raise exception 'INVALID_TITLE';
  end if;
  if length(trim(coalesce(p_body, ''))) < 1 or length(trim(p_body)) > 5000 then
    raise exception 'INVALID_BODY';
  end if;
  if p_reference_value is not null and length(trim(p_reference_value)) > 100 then
    raise exception 'INVALID_REFERENCE';
  end if;
  if (
    select count(*)
    from public.support_requests
    where user_id = v_user and created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.support_requests (
    user_id, category, title, body, reference_type, reference_value, user_last_read_at
  ) values (
    v_user,
    p_category,
    trim(p_title),
    trim(p_body),
    coalesce(p_reference_type, 'none'),
    nullif(trim(coalesce(p_reference_value, '')), ''),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_support_request_rpc(text, text, text, text, text) to authenticated;

create or replace function public.set_support_status(
  p_request_id uuid,
  p_new_status text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_req from public.support_requests where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not (
    (v_req.status = 'open' and p_new_status in ('in_progress','cancelled'))
    or (v_req.status = 'in_progress' and p_new_status in ('completed','cancelled'))
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.support_requests
  set status = p_new_status,
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.set_support_status(uuid, text) to authenticated;

create or replace function public.cancel_support_request(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
begin
  select * into v_req from public.support_requests where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if public.is_admin() then
    if v_req.status not in ('open','in_progress') then
      raise exception 'NOT_CANCELLABLE';
    end if;
  elsif v_req.user_id = auth.uid() then
    if v_req.status <> 'open' then
      raise exception 'NOT_CANCELLABLE';
    end if;
  else
    raise exception 'FORBIDDEN';
  end if;

  update public.support_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.cancel_support_request(uuid) to authenticated;

create or replace function public.mark_support_read(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
begin
  select * into v_req from public.support_requests where id = p_request_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if public.is_admin() then
    update public.support_requests set admin_last_read_at = now() where id = p_request_id;
  elsif v_req.user_id = auth.uid() then
    update public.support_requests set user_last_read_at = now() where id = p_request_id;
  else
    raise exception 'FORBIDDEN';
  end if;
end;
$$;

grant execute on function public.mark_support_read(uuid) to authenticated;

create or replace function public.add_support_comment(
  p_request_id uuid,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
  v_role text;
  v_comment_id uuid;
begin
  if auth.uid() is null or length(trim(coalesce(p_body, ''))) < 1 or length(trim(p_body)) > 2000 then
    raise exception 'INVALID_BODY';
  end if;

  select * into v_req from public.support_requests where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_req.status in ('completed','cancelled') then
    raise exception 'LOCKED';
  end if;

  if public.is_admin() then
    v_role := 'admin';
  elsif v_req.user_id = auth.uid() and public.is_active() then
    v_role := 'user';
  else
    raise exception 'FORBIDDEN';
  end if;

  if (
    select count(*)
    from public.support_request_comments
    where author_id = auth.uid() and created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.support_request_comments (request_id, author_id, author_role, body)
  values (p_request_id, auth.uid(), v_role, trim(p_body))
  returning id into v_comment_id;

  update public.support_requests
  set last_comment_at = now(),
      last_comment_by_role = v_role,
      updated_at = now()
  where id = p_request_id;

  return v_comment_id;
end;
$$;

grant execute on function public.add_support_comment(uuid, text) to authenticated;

create or replace function public.count_support_unread(
  p_role text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_role = 'admin' then
    if not public.is_admin() then
      raise exception 'FORBIDDEN';
    end if;
    return (
      select count(*)::integer
      from public.support_requests
      where last_comment_by_role = 'user'
        and last_comment_at > coalesce(admin_last_read_at, 'epoch'::timestamptz)
    );
  end if;

  return (
    select count(*)::integer
    from public.support_requests
    where user_id = auth.uid()
      and last_comment_by_role = 'admin'
      and last_comment_at > coalesce(user_last_read_at, 'epoch'::timestamptz)
  );
end;
$$;

grant execute on function public.count_support_unread(text) to authenticated;

create or replace function public.search_support_requests(
  p_q text default null,
  p_status text default null,
  p_category text default null,
  p_limit integer default 100
) returns table (
  id uuid,
  user_id uuid,
  category text,
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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    r.id,
    r.user_id,
    r.category,
    r.title,
    r.status,
    r.last_comment_at,
    r.last_comment_by_role,
    r.user_last_read_at,
    r.admin_last_read_at,
    r.created_at,
    r.updated_at,
    p.name as profile_name,
    p.email as profile_email
  from public.support_requests r
  join public.profiles p on p.id = r.user_id
  where (p_status is null or r.status = p_status)
    and (p_category is null or r.category = p_category)
    and (
      p_q is null
      or lower(r.title) like '%' || lower(p_q) || '%'
      or lower(p.name) like '%' || lower(p_q) || '%'
      or lower(p.email) like '%' || lower(p_q) || '%'
    )
  order by r.updated_at desc, r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

grant execute on function public.search_support_requests(text, text, text, integer) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.support_requests;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.support_request_comments;
  exception when duplicate_object then
    null;
  end;
end $$;
```

- [ ] **Step 2: Run migration validation**

Run:

```bash
pnpm typecheck
```

Expected: typecheck still clean because no TypeScript uses the new tables yet.

- [ ] **Step 3: Regenerate DB types when local Supabase is available**

Run:

```bash
pnpm db:types
pnpm typecheck
```

Expected: `lib/db-types.ts` includes `support_requests`, `support_request_comments`, `support_request_attachments`, and support RPCs. If local Supabase is not running, leave `lib/db-types.ts` unchanged and use the existing `callRpc`/`mutationTable` casts in later tasks.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000002_support_requests.sql lib/db-types.ts
git commit -m "feat(support): add support request database model"
```

If `lib/db-types.ts` did not change, use:

```bash
git add supabase/migrations/20260518000002_support_requests.sql
git commit -m "feat(support): add support request database model"
```

---

## Task 4: Query and Server Action Layer

**Files:**
- Create: `lib/support/queries.ts`
- Create: `lib/actions/support-request.ts`

- [ ] **Step 1: Create query helpers**

Create `lib/support/queries.ts`:

```ts
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/actions/_shared';
import type { SupportCategory, SupportStatus } from '@/lib/types';

export type SupportListRow = {
  id: string;
  user_id: string;
  category: SupportCategory;
  title: string;
  status: SupportStatus;
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
  updated_at: string;
  profile?: { name: string; email?: string } | null;
};

export type SupportAttachmentRow = {
  id: string;
  request_id: string;
  user_id: string;
  storage_path: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export type SupportRequestDetail = SupportListRow & {
  body: string;
  reference_type: 'none' | 'order' | 'tracking' | 'other';
  reference_value: string | null;
  attachments: SupportAttachmentRow[];
};

export type SupportCommentRow = {
  id: string;
  request_id: string;
  author_id: string;
  author_role: 'user' | 'admin';
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type SearchSupportRow = {
  id: string;
  user_id: string;
  category: string;
  title: string;
  status: string;
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
  updated_at: string;
  profile_name: string;
  profile_email: string;
};

export async function fetchMySupportRequests(limit = 50): Promise<SupportListRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('support_requests')
    .select('id,user_id,category,title,status,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[support] fetchMySupportRequests', error);
    return [];
  }

  return (data ?? []) as unknown as SupportListRow[];
}

export async function fetchAllSupportRequests({
  status = 'all',
  category = 'all',
  limit = 200,
  search,
}: {
  status?: SupportStatus | 'all';
  category?: SupportCategory | 'all';
  limit?: number;
  search?: string;
} = {}): Promise<SupportListRow[]> {
  const supabase = createClient();
  const { data, error } = await callRpc(supabase, 'search_support_requests', {
    p_q: search?.trim() || null,
    p_status: status === 'all' ? null : status,
    p_category: category === 'all' ? null : category,
    p_limit: limit,
  });

  if (error) {
    console.error('[support] fetchAllSupportRequests', error);
    return [];
  }

  return ((data ?? []) as SearchSupportRow[]).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    category: row.category as SupportCategory,
    title: row.title,
    status: row.status as SupportStatus,
    last_comment_at: row.last_comment_at,
    last_comment_by_role: row.last_comment_by_role,
    user_last_read_at: row.user_last_read_at,
    admin_last_read_at: row.admin_last_read_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    profile: { name: row.profile_name, email: row.profile_email },
  }));
}

export async function fetchSupportRequest(id: string): Promise<{
  request: SupportRequestDetail | null;
  comments: SupportCommentRow[];
}> {
  const supabase = createClient();
  const [{ data: request }, { data: attachments }, { data: comments }] = await Promise.all([
    supabase
      .from('support_requests')
      .select('id,user_id,category,title,body,reference_type,reference_value,status,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at,created_at,updated_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('support_request_attachments')
      .select('id,request_id,user_id,storage_path,original_name,content_type,size_bytes,created_at')
      .eq('request_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('support_request_comments')
      .select('id,request_id,author_id,author_role,body,created_at,updated_at,deleted_at')
      .eq('request_id', id)
      .order('created_at', { ascending: true }),
  ]);

  return {
    request: request
      ? ({
          ...(request as unknown as Omit<SupportRequestDetail, 'attachments'>),
          attachments: (attachments ?? []) as unknown as SupportAttachmentRow[],
        } as SupportRequestDetail)
      : null,
    comments: (comments ?? []) as unknown as SupportCommentRow[],
  };
}

export async function fetchSupportUnreadCount(role: 'user' | 'admin'): Promise<number> {
  const supabase = createClient();
  const { data, error } = await callRpc(supabase, 'count_support_unread', {
    p_role: role,
  });

  if (error || data == null) {
    if (error) console.error('[support] fetchSupportUnreadCount', error);
    return 0;
  }

  return Number(data) || 0;
}
```

- [ ] **Step 2: Create server actions**

Create `lib/actions/support-request.ts`:

```ts
'use server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import {
  callRpc,
  formatZodError,
  mutationTable,
  revalidatePaths,
  type ActionResult,
} from '@/lib/actions/_shared';
import { fileToBuffer } from '@/lib/files/excel';
import { supportCommentSchema, supportRequestCreateSchema } from '@/lib/schemas';
import {
  mapSubmitSupportRequestError,
  mapSupportCancelError,
  mapSupportCommentError,
  mapSupportStatusError,
} from '@/lib/support/action-errors';
import { supportAttachmentPath, supportCleanupPaths } from '@/lib/support/upload-paths';
import { getSupportCommentAccessError } from '@/lib/support/permissions';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.xlsx', '.xls', '.docx', '.txt'];

export type SubmitSupportResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

function lower(value: string) {
  return value.toLowerCase();
}

function isAllowedAttachment(file: File): boolean {
  const name = lower(file.name);
  return ALLOWED_ATTACHMENT_EXT.some((ext) => name.endsWith(ext));
}

function collectAttachments(fd: FormData): File[] | { error: string } {
  const files = fd
    .getAll('attachments')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > MAX_ATTACHMENTS) {
    return { error: `첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 업로드할 수 있습니다.` };
  }

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { error: '첨부파일은 파일당 10MB 이하여야 합니다.' };
    }
    if (!isAllowedAttachment(file)) {
      return { error: '첨부파일은 jpg/png/webp/pdf/xlsx/xls/docx/txt 형식만 가능합니다.' };
    }
  }

  return files;
}

export async function submitSupportRequestAction(
  _prevState: SubmitSupportResult | null,
  fd: FormData,
): Promise<SubmitSupportResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = supportRequestCreateSchema.safeParse({
    category: String(fd.get('category') ?? ''),
    title: String(fd.get('title') ?? ''),
    body: String(fd.get('body') ?? ''),
    referenceType: String(fd.get('referenceType') ?? 'none'),
    referenceValue: String(fd.get('referenceValue') ?? ''),
  });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const attachments = collectAttachments(fd);
  if (!Array.isArray(attachments)) return { ok: false, error: attachments.error };

  const { data: requestId, error: rpcErr } = await callRpc(supabase, 'submit_support_request_rpc', {
    p_category: parsed.data.category,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_reference_type: parsed.data.referenceType,
    p_reference_value: parsed.data.referenceValue,
  });

  if (rpcErr || !requestId) {
    const mapped = mapSubmitSupportRequestError(rpcErr?.message ?? '');
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] submit_support_request_rpc', rpcErr);
    return { ok: false, error: '문의 등록에 실패했습니다.' };
  }

  const uploadedPaths: string[] = [];
  try {
    for (const file of attachments) {
      const attachmentId = randomUUID();
      const path = supportAttachmentPath({
        userId: u.user.id,
        requestId: String(requestId),
        attachmentId,
        originalName: file.name,
      });
      const buffer = await fileToBuffer(file);
      const { error: uploadErr } = await supabase.storage.from('support-requests').upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (uploadErr) throw uploadErr;
      uploadedPaths.push(path);

      const { error: metaErr } = await mutationTable(supabase, 'support_request_attachments').insert({
        id: attachmentId,
        request_id: requestId,
        user_id: u.user.id,
        storage_path: path,
        original_name: file.name,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
      });
      if (metaErr) throw metaErr;
    }
  } catch (error) {
    await supabase.storage.from('support-requests').remove(supportCleanupPaths(uploadedPaths));
    await mutationTable(supabase, 'support_requests').delete().eq('id', requestId);
    console.error('[support] attachment upload failed', error);
    return { ok: false, error: '첨부파일 업로드에 실패했습니다. 다시 시도해주세요.' };
  }

  revalidatePaths(['/support-requests', '/admin/support-requests']);
  return { ok: true, requestId: String(requestId) };
}

export async function cancelSupportRequestAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'cancel_support_request', {
    p_request_id: requestId,
  });
  if (error) {
    const mapped = mapSupportCancelError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] cancel', { requestId, error });
    return { ok: false, error: '취소 처리에 실패했습니다.' };
  }
  revalidatePaths(['/support-requests', `/support-requests/${requestId}`, '/admin/support-requests', `/admin/support-requests/${requestId}`]);
  return { ok: true };
}

export async function setSupportStatusAction(
  requestId: string,
  newStatus: 'in_progress' | 'completed' | 'cancelled',
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'set_support_status', {
    p_request_id: requestId,
    p_new_status: newStatus,
  });
  if (error) {
    const mapped = mapSupportStatusError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] setStatus', { requestId, newStatus, error });
    return { ok: false, error: '상태 변경에 실패했습니다.' };
  }
  revalidatePaths(['/support-requests', `/support-requests/${requestId}`, '/admin/support-requests', `/admin/support-requests/${requestId}`]);
  return { ok: true };
}

export async function markSupportReadAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'mark_support_read', {
    p_request_id: requestId,
  });
  if (error) {
    console.error('[support] markRead', { requestId, error });
    return { ok: false, error: '읽음 처리에 실패했습니다.' };
  }
  return { ok: true };
}

export async function addSupportCommentAction(
  requestId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = createClient();
  const parsed = supportCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const { data, error } = await callRpc(supabase, 'add_support_comment', {
    p_request_id: requestId,
    p_body: parsed.data.body,
  });
  if (error) {
    const mapped = mapSupportCommentError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] addComment', { requestId, error });
    return { ok: false, error: '댓글 작성에 실패했습니다.' };
  }
  revalidatePaths([`/support-requests/${requestId}`, `/admin/support-requests/${requestId}`]);
  return { ok: true, id: String(data) };
}

type CommentRow = { author_id: string; created_at: string; request_id: string };

export async function updateSupportCommentAction(commentId: string, body: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = supportCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const { data: row } = (await supabase
    .from('support_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', u.user.id).single<{ role: 'user' | 'admin' }>();
  const accessError = getSupportCommentAccessError({
    authorId: row.author_id,
    currentUserId: u.user.id,
    createdAt: row.created_at,
    isAdmin: prof?.role === 'admin',
    action: '수정',
  });
  if (accessError) return { ok: false, error: accessError };

  const { error } = await mutationTable(supabase, 'support_request_comments')
    .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) {
    console.error('[support] updateComment', { commentId, error });
    return { ok: false, error: '댓글 수정에 실패했습니다.' };
  }
  revalidatePaths([`/support-requests/${row.request_id}`, `/admin/support-requests/${row.request_id}`]);
  return { ok: true };
}

export async function deleteSupportCommentAction(commentId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const { data: row } = (await supabase
    .from('support_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', u.user.id).single<{ role: 'user' | 'admin' }>();
  const accessError = getSupportCommentAccessError({
    authorId: row.author_id,
    currentUserId: u.user.id,
    createdAt: row.created_at,
    isAdmin: prof?.role === 'admin',
    action: '삭제',
  });
  if (accessError) return { ok: false, error: accessError };

  const { error } = await mutationTable(supabase, 'support_request_comments').delete().eq('id', commentId);
  if (error) {
    console.error('[support] deleteComment', { commentId, error });
    return { ok: false, error: '댓글 삭제에 실패했습니다.' };
  }
  revalidatePaths([`/support-requests/${row.request_id}`, `/admin/support-requests/${row.request_id}`]);
  return { ok: true };
}

export type SupportAttachmentUrlResult = { ok: true; url: string } | { ok: false; error: string };

export async function getSupportAttachmentUrlAction(
  requestId: string,
  attachmentId: string,
): Promise<SupportAttachmentUrlResult> {
  const supabase = createClient();
  const { data: attachment } = (await supabase
    .from('support_request_attachments')
    .select('id, request_id, storage_path')
    .eq('id', attachmentId)
    .eq('request_id', requestId)
    .maybeSingle()) as { data: { storage_path: string } | null; error: unknown };
  if (!attachment) return { ok: false, error: '첨부파일을 찾을 수 없습니다.' };

  const { data, error } = await supabase.storage.from('support-requests').createSignedUrl(attachment.storage_path, 60);
  if (error || !data?.signedUrl) return { ok: false, error: error?.message ?? '서명 URL 생성 실패' };
  return { ok: true, url: data.signedUrl };
}
```

- [ ] **Step 3: Typecheck and commit**

Run:

```bash
pnpm typecheck
```

Expected: clean. If TypeScript complains about Supabase table names not being in `lib/db-types.ts`, keep the `as unknown as ...` casts and `mutationTable`/`callRpc` helper usage shown above.

Commit:

```bash
git add lib/support/queries.ts lib/actions/support-request.ts
git commit -m "feat(support): add query and action layer"
```

---

## Task 5: Support Components

**Files:**
- Create: `components/support/SupportAttachmentList.tsx`
- Create: `components/support/SupportCommentList.tsx`
- Create: `components/support/SupportCommentForm.tsx`
- Create: `components/support/SupportUnreadBadge.tsx`

- [ ] **Step 1: Create attachment list**

Create `components/support/SupportAttachmentList.tsx`:

```tsx
import { Download, FileText, ImageIcon } from 'lucide-react';
import { getSupportAttachmentUrlAction } from '@/lib/actions/support-request';
import type { SupportAttachmentRow } from '@/lib/support/queries';

function isImage(contentType: string, name: string) {
  return contentType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(name);
}

export async function SupportAttachmentList({
  requestId,
  attachments,
}: {
  requestId: string;
  attachments: SupportAttachmentRow[];
}) {
  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground">첨부파일 없음</p>;
  }

  const withUrls = await Promise.all(
    attachments.map(async (attachment) => {
      const result = await getSupportAttachmentUrlAction(requestId, attachment.id);
      return { attachment, url: result.ok ? result.url : null };
    }),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {withUrls.map(({ attachment, url }) => (
          <a
            key={attachment.id}
            href={url ?? '#'}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!url}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border bg-background text-sm hover:bg-muted transition-colors aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {attachment.original_name}
          </a>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {withUrls
          .filter(({ attachment, url }) => url && isImage(attachment.content_type, attachment.original_name))
          .map(({ attachment, url }) => (
            <a key={attachment.id} href={url ?? '#'} target="_blank" rel="noreferrer" className="group rounded-md border overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url ?? ''} alt={attachment.original_name} className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]" />
            </a>
          ))}
      </div>
      <div className="sr-only">
        <FileText aria-hidden />
        <ImageIcon aria-hidden />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create comment list**

Create `components/support/SupportCommentList.tsx`:

```tsx
import { Shield, User as UserIcon } from 'lucide-react';
import { formatShortDateTimeKR } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { SupportCommentRow } from '@/lib/support/queries';
import { CommentRowActions } from './SupportCommentForm';

type Props = {
  comments: SupportCommentRow[];
  currentUserId: string;
  isAdmin: boolean;
};

export function SupportCommentList({ comments, currentUserId, isAdmin }: Props) {
  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">아직 댓글이 없습니다.</p>;
  }

  return (
    <ul className="space-y-4">
      {comments.map((comment) => {
        const isAuthor = comment.author_id === currentUserId;
        const isAdminAuthor = comment.author_role === 'admin';
        return (
          <li key={comment.id} className="flex gap-3">
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
                <span className="font-medium text-foreground">{isAdminAuthor ? '관리자' : '작성자'}</span>
                <span>{formatShortDateTimeKR(comment.created_at)}</span>
                {comment.updated_at !== comment.created_at && <span>(수정됨)</span>}
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap">{comment.body}</p>
              <CommentRowActions
                commentId={comment.id}
                createdAt={comment.created_at}
                isAuthor={isAuthor}
                isAdmin={isAdmin}
                body={comment.body}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Create comment form**

Create `components/support/SupportCommentForm.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  addSupportCommentAction,
  deleteSupportCommentAction,
  updateSupportCommentAction,
} from '@/lib/actions/support-request';
import { SUPPORT_COMMENT_EDIT_WINDOW_MS } from '@/lib/support/permissions';
import { useConfirm } from '@/components/ConfirmDialog';

export function SupportCommentForm({
  requestId,
  disabled,
  disabledReason,
}: {
  requestId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();
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
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = body.trim();
        if (!trimmed) return;
        startTransition(async () => {
          setError(null);
          const result = await addSupportCommentAction(requestId, trimmed);
          if (!result.ok) {
            setError(result.error);
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
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="댓글 입력 (최대 2000자)"
        className="w-full rounded-md border bg-background p-3 text-sm resize-y"
        aria-label="댓글 입력"
      />
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || body.trim().length === 0}>
          {pending ? '등록 중...' : '댓글 등록'}
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
  const created = useMemo(() => new Date(createdAt).getTime(), [createdAt]);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, element } = useConfirm();

  useEffect(() => {
    if (isAdmin || !isAuthor) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [isAdmin, isAuthor]);

  const editable = isAdmin || (isAuthor && now - created < SUPPORT_COMMENT_EDIT_WINDOW_MS);
  if (!editable) return null;

  async function onDelete() {
    const result = await confirm({
      title: '이 댓글을 삭제할까요?',
      description: '삭제하면 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      cancelLabel: '닫기',
      tone: 'destructive',
    });
    if (!result.ok) return;
    startTransition(async () => {
      const response = await deleteSupportCommentAction(commentId);
      if (!response.ok) {
        toast({ title: '삭제 실패', description: response.error, variant: 'destructive' });
        return;
      }
      toast({ title: '삭제되었습니다.' });
      router.refresh();
    });
  }

  if (editing) {
    return (
      <>
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
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
                startTransition(async () => {
                  const response = await updateSupportCommentAction(commentId, draft.trim());
                  if (!response.ok) {
                    toast({ title: '수정 실패', description: response.error, variant: 'destructive' });
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(body);
              }}
            >
              취소
            </Button>
          </div>
        </div>
        {element}
      </>
    );
  }

  return (
    <>
      <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
        <button type="button" className="hover:underline" onClick={() => setEditing(true)}>
          수정
        </button>
        <button type="button" className="hover:underline text-destructive" onClick={onDelete}>
          삭제
        </button>
      </div>
      {element}
    </>
  );
}
```

- [ ] **Step 4: Create unread badge**

Create `components/support/SupportUnreadBadge.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';

type Role = 'user' | 'admin';

export function SupportUnreadBadge({
  role,
  initial,
  className,
}: {
  role: Role;
  initial: number;
  className?: string;
}) {
  const [count, setCount] = useState(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      const { data, error } = await (supabase.rpc as any)('count_support_unread', {
        p_role: role,
      });
      if (cancelled || error || data == null) return;
      setCount(Number(data) || 0);
    }

    function scheduleRefresh() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!cancelled) refresh();
      }, 1000);
    }

    const channelName = `support-unread-${role}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_requests' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_request_comments' }, scheduleRefresh)
      .subscribe();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
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

- [ ] **Step 5: Typecheck and commit**

Run:

```bash
pnpm typecheck
```

Expected: clean.

Commit:

```bash
git add components/support
git commit -m "feat(support): add support request components"
```

---

## Task 6: User Routes

**Files:**
- Create: `app/(user)/support-requests/page.tsx`
- Create: `app/(user)/support-requests/new/page.tsx`
- Create: `app/(user)/support-requests/new/NewSupportRequestForm.tsx`
- Create: `app/(user)/support-requests/[id]/page.tsx`
- Create: `app/(user)/support-requests/[id]/CancelSupportRequestButton.tsx`

- [ ] **Step 1: Implement user list page**

Create `app/(user)/support-requests/page.tsx`:

```tsx
import Link from 'next/link';
import { LifeBuoy, PlusCircle } from 'lucide-react';
import { SupportCategoryBadge, SupportStatusBadge } from '@/components/support/SupportStatusBadge';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchMySupportRequests } from '@/lib/support/queries';
import type { SupportCategory, SupportStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SupportRequestsPage() {
  const rows = await fetchMySupportRequests(50);

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">교환/반품 및 CS 문의</h1>
        <p className="text-sm text-muted-foreground mt-1">
          교환, 반품, 기타 문의를 비공개로 남기고 답변을 확인하세요.
        </p>
      </header>

      <div className="flex justify-between items-center">
        <h2 className="font-heading font-semibold text-lg">내 문의</h2>
        <Link href="/support-requests/new" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity">
          <PlusCircle className="h-3.5 w-3.5" aria-hidden />
          새 문의
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <LifeBuoy className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-medium">등록된 문의가 없습니다</p>
          <Link href="/support-requests/new" className="text-sm text-primary hover:underline">
            새 문의 작성
          </Link>
        </div>
      ) : (
        <ul className="rounded-lg border bg-card divide-y">
          {rows.map((row) => {
            const unread =
              row.last_comment_at &&
              row.last_comment_by_role === 'admin' &&
              (!row.user_last_read_at || row.last_comment_at > row.user_last_read_at);
            return (
              <li key={row.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <SupportCategoryBadge category={row.category as SupportCategory} />
                    <SupportStatusBadge status={row.status as SupportStatus} />
                  </div>
                  <Link href={`/support-requests/${row.id}`} className="text-sm font-medium hover:underline truncate">
                    {row.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatShortDateTimeKR(row.created_at)}
                    {row.last_comment_at && <> · 최근 답변 {formatShortDateTimeKR(row.last_comment_at)}</>}
                  </p>
                </div>
                {unread && <span className="text-[11px] text-destructive font-medium">새 답변</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement new-request page shell**

Create `app/(user)/support-requests/new/page.tsx`:

```tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewSupportRequestForm } from './NewSupportRequestForm';

export default function NewSupportRequestPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <header className="pb-4 border-b">
        <Link href="/support-requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 교환/반품 및 CS 문의
        </Link>
        <h1 className="font-heading font-semibold text-2xl tracking-tight mt-2">새 문의</h1>
      </header>
      <NewSupportRequestForm />
    </div>
  );
}
```

- [ ] **Step 3: Implement new-request form**

Create `app/(user)/support-requests/new/NewSupportRequestForm.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { submitSupportRequestAction, type SubmitSupportResult } from '@/lib/actions/support-request';

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? '등록 중...' : '등록'}</Button>;
}

export function NewSupportRequestForm() {
  const [state, formAction] = useFormState<SubmitSupportResult | null, FormData>(submitSupportRequestAction, null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (state?.ok) {
      toast({ title: '문의가 등록되었습니다.' });
      router.push(`/support-requests/${state.requestId}`);
      router.refresh();
    }
  }, [state, router, toast]);

  return (
    <form action={formAction} className="rounded-lg border bg-card p-5 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="category" className="text-sm font-medium">문의 유형 *</label>
        <select id="category" name="category" required className="w-full h-10 rounded-md border bg-background px-3 text-sm">
          <option value="exchange">교환</option>
          <option value="return">반품</option>
          <option value="cs">CS문의</option>
          <option value="other">기타</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium">제목 *</label>
        <input id="title" name="title" maxLength={200} className="w-full h-10 rounded-md border bg-background px-3 text-sm" required />
      </div>

      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1.5">
          <label htmlFor="referenceType" className="text-sm font-medium">참고번호</label>
          <select id="referenceType" name="referenceType" className="w-full h-10 rounded-md border bg-background px-3 text-sm">
            <option value="none">없음</option>
            <option value="order">주문번호</option>
            <option value="tracking">운송장번호</option>
            <option value="other">기타</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="referenceValue" className="text-sm font-medium">번호 입력</label>
          <input id="referenceValue" name="referenceValue" maxLength={100} className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="body" className="text-sm font-medium">내용 *</label>
        <textarea id="body" name="body" maxLength={5000} rows={7} className="w-full rounded-md border bg-background p-3 text-sm resize-y" required />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="attachments" className="text-sm font-medium">첨부파일 (선택, 최대 5개, 각 10MB)</label>
        <input id="attachments" name="attachments" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.xlsx,.xls,.docx,.txt" className="block w-full text-sm border rounded-md p-2" />
      </div>

      {state && !state.ok && <p className="text-sm text-destructive" role="alert">{state.error}</p>}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Implement cancel button and detail page**

Create `app/(user)/support-requests/[id]/CancelSupportRequestButton.tsx`:

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cancelSupportRequestAction } from '@/lib/actions/support-request';

export function CancelSupportRequestButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm('이 문의를 취소할까요?')) return;
        startTransition(async () => {
          const result = await cancelSupportRequestAction(requestId);
          if (!result.ok) {
            toast({ title: '취소 실패', description: result.error, variant: 'destructive' });
            return;
          }
          toast({ title: '문의가 취소되었습니다.' });
          router.refresh();
        });
      }}
    >
      취소
    </Button>
  );
}
```

Create `app/(user)/support-requests/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { SupportAttachmentList } from '@/components/support/SupportAttachmentList';
import { SupportCategoryBadge, SupportStatusBadge } from '@/components/support/SupportStatusBadge';
import { SupportCommentForm } from '@/components/support/SupportCommentForm';
import { SupportCommentList } from '@/components/support/SupportCommentList';
import { markSupportReadAction } from '@/lib/actions/support-request';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTimeKR } from '@/lib/dates';
import { isSupportLocked } from '@/lib/support/permissions';
import { fetchSupportRequest } from '@/lib/support/queries';
import { SUPPORT_REFERENCE_TYPE_LABEL, type SupportCategory, type SupportStatus } from '@/lib/types';
import { CancelSupportRequestButton } from './CancelSupportRequestButton';

export const dynamic = 'force-dynamic';

export default async function SupportRequestDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) notFound();

  const { request, comments } = await fetchSupportRequest(params.id);
  if (!request) notFound();

  await markSupportReadAction(request.id);

  const status = request.status as SupportStatus;
  const locked = isSupportLocked(status);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-start justify-between gap-3 pb-4 border-b">
        <div className="flex-1 min-w-0">
          <Link href="/support-requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 교환/반품 및 CS 문의
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <SupportCategoryBadge category={request.category as SupportCategory} />
            <SupportStatusBadge status={status} />
            <h1 className="font-heading font-semibold text-xl tracking-tight">{request.title}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">작성 {formatShortDateTimeKR(request.created_at)}</p>
        </div>
        {status === 'open' && <CancelSupportRequestButton requestId={request.id} />}
      </header>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        {request.reference_type !== 'none' && request.reference_value && (
          <p className="text-sm text-muted-foreground">
            {SUPPORT_REFERENCE_TYPE_LABEL[request.reference_type]}: <span className="text-foreground">{request.reference_value}</span>
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap">{request.body}</p>
        <SupportAttachmentList requestId={request.id} attachments={request.attachments} />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">댓글</h2>
        <SupportCommentList comments={comments} currentUserId={u.user.id} isAdmin={false} />
        <SupportCommentForm
          requestId={request.id}
          disabled={locked}
          disabledReason={
            status === 'completed'
              ? '완료된 문의라 댓글을 작성할 수 없습니다.'
              : status === 'cancelled'
                ? '취소된 문의라 댓글을 작성할 수 없습니다.'
                : undefined
          }
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and commit**

Run:

```bash
pnpm typecheck
```

Expected: clean.

Commit:

```bash
git add "app/(user)/support-requests"
git commit -m "feat(support): add user support request pages"
```

---

## Task 7: Admin Routes

**Files:**
- Create: `app/(admin)/admin/support-requests/page.tsx`
- Create: `app/(admin)/admin/support-requests/[id]/page.tsx`
- Create: `app/(admin)/admin/support-requests/[id]/StatusControls.tsx`

- [ ] **Step 1: Implement admin list**

Create `app/(admin)/admin/support-requests/page.tsx`:

```tsx
import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';
import { SupportCategoryBadge, SupportStatusBadge } from '@/components/support/SupportStatusBadge';
import { formatShortDateTimeKR } from '@/lib/dates';
import { fetchAllSupportRequests } from '@/lib/support/queries';
import { cn } from '@/lib/utils';
import type { SupportCategory, SupportStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUS_TABS: { value: SupportStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'open', label: '접수' },
  { value: 'in_progress', label: '처리중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
];

const CATEGORY_OPTIONS: { value: SupportCategory | 'all'; label: string }[] = [
  { value: 'all', label: '전체 유형' },
  { value: 'exchange', label: '교환' },
  { value: 'return', label: '반품' },
  { value: 'cs', label: 'CS문의' },
  { value: 'other', label: '기타' },
];

function listHref(status: SupportStatus | 'all', category: SupportCategory | 'all', q: string) {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (category !== 'all') params.set('category', category);
  if (q) params.set('q', q);
  const query = params.toString();
  return query ? `/admin/support-requests?${query}` : '/admin/support-requests';
}

export default async function AdminSupportRequestsPage({
  searchParams,
}: {
  searchParams: { status?: string; category?: string; q?: string };
}) {
  const status = STATUS_TABS.some((tab) => tab.value === searchParams.status)
    ? (searchParams.status as SupportStatus | 'all')
    : 'all';
  const category = CATEGORY_OPTIONS.some((option) => option.value === searchParams.category)
    ? (searchParams.category as SupportCategory | 'all')
    : 'all';
  const q = searchParams.q?.trim() ?? '';
  const rows = await fetchAllSupportRequests({ status, category, search: q || undefined });

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">교환/반품 및 CS 문의</h1>
        <p className="text-sm text-muted-foreground mt-1">고객 문의를 비공개로 확인하고 댓글로 회신합니다.</p>
      </header>

      <form method="GET" className="flex flex-col sm:flex-row gap-2 max-w-2xl">
        {status !== 'all' && <input type="hidden" name="status" value={status} />}
        <select name="category" defaultValue={category} className="h-9 rounded-md border bg-background px-3 text-sm">
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input type="search" name="q" defaultValue={q} placeholder="작성자 이름·이메일·제목 검색" className="flex-1 h-9 rounded-md border bg-background px-3 text-sm" />
        <button type="submit" className="h-9 px-3 rounded-md border bg-background text-sm hover:bg-muted transition-colors">검색</button>
      </form>

      <nav className="flex gap-1 border-b">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={listHref(tab.value, category, q)}
            className={cn(
              'px-3 h-9 inline-flex items-center text-sm border-b-2 transition-colors',
              status === tab.value ? 'border-foreground text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
            <LifeBuoy className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-medium">문의가 없습니다</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 h-10 font-medium">상태</th>
                <th className="text-left px-3 h-10 font-medium">유형</th>
                <th className="text-left px-3 h-10 font-medium">제목</th>
                <th className="text-left px-3 h-10 font-medium">작성자</th>
                <th className="text-left px-3 h-10 font-medium">최근 활동</th>
                <th className="text-left px-3 h-10 font-medium">작성일</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const unread =
                  row.last_comment_at &&
                  row.last_comment_by_role === 'user' &&
                  (!row.admin_last_read_at || row.last_comment_at > row.admin_last_read_at);
                return (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2"><SupportStatusBadge status={row.status as SupportStatus} /></td>
                    <td className="px-3 py-2"><SupportCategoryBadge category={row.category as SupportCategory} /></td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/support-requests/${row.id}`} className="hover:underline">{row.title}</Link>
                      {unread && <span className="ml-2 text-[11px] text-destructive font-medium">새 댓글</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.profile?.name ?? '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.last_comment_at ? formatShortDateTimeKR(row.last_comment_at) : '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatShortDateTimeKR(row.created_at)}</td>
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

- [ ] **Step 2: Implement admin status controls**

Create `app/(admin)/admin/support-requests/[id]/StatusControls.tsx`:

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { setSupportStatusAction } from '@/lib/actions/support-request';
import type { SupportStatus } from '@/lib/types';

export function StatusControls({ requestId, status }: { requestId: string; status: SupportStatus }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function go(next: 'in_progress' | 'completed' | 'cancelled', confirmText: string) {
    if (!confirm(confirmText)) return;
    startTransition(async () => {
      const result = await setSupportStatusAction(requestId, next);
      if (!result.ok) {
        toast({ title: '변경 실패', description: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: '상태가 변경되었습니다.' });
      router.refresh();
    });
  }

  if (status === 'open') {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => go('in_progress', '처리중으로 변경할까요?')}>처리중</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('cancelled', '이 문의를 취소할까요?')}>취소</Button>
      </div>
    );
  }

  if (status === 'in_progress') {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => go('completed', '완료 처리할까요?')}>완료 처리</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('cancelled', '이 문의를 취소할까요?')}>취소</Button>
      </div>
    );
  }

  return <p className="text-xs text-muted-foreground">종결됨</p>;
}
```

- [ ] **Step 3: Implement admin detail page**

Create `app/(admin)/admin/support-requests/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { SupportAttachmentList } from '@/components/support/SupportAttachmentList';
import { SupportCategoryBadge, SupportStatusBadge } from '@/components/support/SupportStatusBadge';
import { SupportCommentForm } from '@/components/support/SupportCommentForm';
import { SupportCommentList } from '@/components/support/SupportCommentList';
import { markSupportReadAction } from '@/lib/actions/support-request';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTimeKR } from '@/lib/dates';
import { isSupportLocked } from '@/lib/support/permissions';
import { fetchSupportRequest } from '@/lib/support/queries';
import { SUPPORT_REFERENCE_TYPE_LABEL, type SupportCategory, type SupportStatus } from '@/lib/types';
import { StatusControls } from './StatusControls';

export const dynamic = 'force-dynamic';

export default async function AdminSupportRequestDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) notFound();

  const { request, comments } = await fetchSupportRequest(params.id);
  if (!request) notFound();

  const { data: author } = await supabase
    .from('profiles')
    .select('name,email')
    .eq('id', request.user_id)
    .maybeSingle<{ name: string; email: string }>();

  await markSupportReadAction(request.id);

  const status = request.status as SupportStatus;
  const locked = isSupportLocked(status);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-start justify-between gap-3 pb-4 border-b">
        <div className="flex-1 min-w-0">
          <Link href="/admin/support-requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 교환/반품 및 CS 문의
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <SupportCategoryBadge category={request.category as SupportCategory} />
            <SupportStatusBadge status={status} />
            <h1 className="font-heading font-semibold text-xl tracking-tight">{request.title}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            작성자 {author?.name ?? '-'} ({author?.email ?? '-'}) · {formatShortDateTimeKR(request.created_at)}
          </p>
        </div>
        <StatusControls requestId={request.id} status={status} />
      </header>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        {request.reference_type !== 'none' && request.reference_value && (
          <p className="text-sm text-muted-foreground">
            {SUPPORT_REFERENCE_TYPE_LABEL[request.reference_type]}: <span className="text-foreground">{request.reference_value}</span>
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap">{request.body}</p>
        <SupportAttachmentList requestId={request.id} attachments={request.attachments} />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">댓글</h2>
        <SupportCommentList comments={comments} currentUserId={u.user.id} isAdmin />
        <SupportCommentForm requestId={request.id} disabled={locked} disabledReason={locked ? '종결된 문의에는 댓글을 작성할 수 없습니다.' : undefined} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and commit**

Run:

```bash
pnpm typecheck
```

Expected: clean.

Commit:

```bash
git add "app/(admin)/admin/support-requests"
git commit -m "feat(support): add admin support request pages"
```

---

## Task 8: Navigation, Layout Unread Counts, Group2 Access, and Docs

**Files:**
- Modify: `components/NavUser.tsx`
- Modify: `components/admin-nav-items.ts`
- Modify: `components/AdminSidebar.tsx`
- Modify: `components/MobileAdminNav.tsx`
- Modify: `components/AdminHeader.tsx`
- Modify: `app/(user)/layout.tsx`
- Modify: `app/(admin)/admin/layout.tsx`
- Modify: `lib/auth/user-groups.ts`
- Modify: `README.md`

- [ ] **Step 1: Add user navigation item and badge**

In `components/NavUser.tsx`:

1. Add `LifeBuoy` to the `lucide-react` import list.
2. Add `import { SupportUnreadBadge } from '@/components/support/SupportUnreadBadge';`.
3. Add `supportUnread: number` to `NavUser` props.
4. Insert this item immediately after the existing `/inbound-requests` item:

```ts
{ href: '/support-requests', label: '교환/반품 및 CS 문의', Icon: LifeBuoy, groups: ['group1', 'group2'] },
```

5. In both desktop and mobile nav badge render blocks, add:

```tsx
{href === '/support-requests' && (
  <SupportUnreadBadge role="user" initial={supportUnread} />
)}
```

- [ ] **Step 2: Fetch user support unread in layout**

In `app/(user)/layout.tsx`:

1. Add `import { fetchSupportUnreadCount } from '@/lib/support/queries';`.
2. Include support unread in the existing `Promise.all`:

```ts
const [{ data: products }, { data: purchased }, inboundUnread, supportUnread] = await Promise.all([
  supabase.from('products').select('id,per_user_limit').is('deleted_at', null),
  supabase
    .from('order_items')
    .select('product_id, quantity, orders!inner(user_id, status)')
    .eq('orders.user_id', user.id)
    .neq('orders.status', 'cancelled'),
  fetchUnreadCount('user'),
  fetchSupportUnreadCount('user'),
]);
```

3. Pass the new prop:

```tsx
<NavUser
  balance={Number(profile.deposit_balance)}
  name={profile.name}
  inboundUnread={inboundUnread}
  supportUnread={supportUnread}
  userGroup={userGroup}
/>
```

- [ ] **Step 3: Add admin nav item**

In `components/admin-nav-items.ts`:

1. Add `LifeBuoy` to the `lucide-react` import list.
2. Insert after `/admin/inbound-requests`:

```ts
{ href: '/admin/support-requests', label: '교환/반품 및 CS 문의', Icon: LifeBuoy },
```

- [ ] **Step 4: Render admin support badges**

In `components/AdminSidebar.tsx`:

1. Add `import { SupportUnreadBadge } from '@/components/support/SupportUnreadBadge';`.
2. Change props to:

```ts
export function AdminSidebar({
  inboundUnread,
  supportUnread,
}: {
  inboundUnread: number;
  supportUnread: number;
}) {
```

3. Add badge render next to admin support item:

```tsx
{href === '/admin/support-requests' && (
  <SupportUnreadBadge role="admin" initial={supportUnread} />
)}
```

In `components/MobileAdminNav.tsx`:

1. Add `import { SupportUnreadBadge } from '@/components/support/SupportUnreadBadge';`.
2. Add `supportUnread: number` to props.
3. Add the same support badge render for `/admin/support-requests`.

In `components/AdminHeader.tsx`:

1. Add `supportUnread: number` to props.
2. Pass it into `<MobileAdminNav />`:

```tsx
<MobileAdminNav
  open={open}
  onOpenChange={setOpen}
  inboundUnread={inboundUnread}
  supportUnread={supportUnread}
/>
```

- [ ] **Step 5: Fetch admin support unread in layout**

In `app/(admin)/admin/layout.tsx`:

1. Add `import { fetchSupportUnreadCount } from '@/lib/support/queries';`.
2. Fetch both counts:

```ts
const [inboundUnread, supportUnread] = await Promise.all([
  fetchUnreadCount('admin'),
  fetchSupportUnreadCount('admin'),
]);
```

3. Pass both props:

```tsx
<AdminSidebar inboundUnread={inboundUnread} supportUnread={supportUnread} />
<AdminHeader
  name={profile.name}
  email={user.email}
  inboundUnread={inboundUnread}
  supportUnread={supportUnread}
/>
```

- [ ] **Step 6: Allow group2 path**

In `lib/auth/user-groups.ts`, add `/support-requests` to `GROUP2_ALLOWED_PREFIXES`:

```ts
export const GROUP2_ALLOWED_PREFIXES = [
  '/shipping-uploads/purchased',
  '/inbound-requests',
  '/support-requests',
  '/inbound-template.xlsx',
  '/account',
  '/guide',
] as const;
```

- [ ] **Step 7: Update README**

In `README.md`, add these bullets near the existing inbound bullets:

```md
- 교환/반품 및 CS 문의(`/support-requests`) — 교환·반품·기타 CS 문의를 비공개 게시글로 등록, 선택 첨부파일 업로드, 관리자 댓글과 상태 추적
- 교환/반품 및 CS 문의(`/admin/support-requests`) — 사용자 CS 문의 검토, 상태 변경(접수/처리중/완료/취소), 첨부 확인, 댓글 응답, 미확인 답변 배지
```

- [ ] **Step 8: Typecheck and commit**

Run:

```bash
pnpm typecheck
```

Expected: clean.

Commit:

```bash
git add components/NavUser.tsx components/admin-nav-items.ts components/AdminSidebar.tsx components/MobileAdminNav.tsx components/AdminHeader.tsx "app/(user)/layout.tsx" "app/(admin)/admin/layout.tsx" lib/auth/user-groups.ts README.md
git commit -m "feat(support): wire support request navigation"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run targeted support tests**

Run:

```bash
pnpm test -- support
```

Expected: all support unit tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: no new lint errors from support files.

- [ ] **Step 4: Run production build**

Run:

```bash
pnpm build
```

Expected: build succeeds and includes these routes:

```text
/support-requests
/support-requests/new
/support-requests/[id]
/admin/support-requests
/admin/support-requests/[id]
```

- [ ] **Step 5: Manual QA**

Start dev server:

```bash
pnpm dev
```

Walk through this checklist:

1. Sign in as a `group1` user and open `/support-requests`.
2. Confirm the `교환/반품 및 CS 문의` nav item appears after `입고리스트`.
3. Submit a `교환` 문의 without attachments and confirm redirect to detail.
4. Submit a `반품` 문의 with image/PDF attachments and confirm signed URL links render.
5. Sign in as a `group2` user and confirm `/support-requests` is accessible.
6. Directly open another user's support detail URL and confirm 404.
7. Sign in as admin and open `/admin/support-requests`.
8. Filter by `처리중`, then by `반품`, then search by user name.
9. Admin posts a comment and user support unread badge increments.
10. User opens detail and user support unread badge clears.
11. User posts a comment and admin support unread badge increments.
12. Admin changes status `접수 -> 처리중 -> 완료`.
13. Confirm completed support request locks comment input.
14. Confirm existing `/inbound-requests` pages still load and inbound unread badge still works.

- [ ] **Step 6: Commit verification fixes**

If manual QA required fixes, commit them:

```bash
git add -A
git commit -m "fix(support): resolve support request QA issues"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Notes

- **Spec coverage:** Task 3 covers database, RLS, RPCs, Storage, and Realtime. Task 4 covers data access and mutations. Task 5 covers reusable support UI. Tasks 6 and 7 cover user/admin routes. Task 8 covers navigation, unread badges, group2 access, and documentation. Task 9 covers tests and manual QA.
- **Isolation:** Support requests do not reuse inbound tables, bucket, RPCs, route segments, query helpers, action files, unread badge components, or inbound-specific permission helpers.
- **Type consistency:** `SupportStatus`, `SupportCategory`, and `SupportReferenceType` are defined in `lib/types.ts` and referenced consistently across helpers, components, queries, and routes.
- **Security:** Direct support request insert/update is not exposed through ordinary RLS. Creation, status changes, read markers, and comments go through RPCs. Attachments remain in the private `support-requests` bucket and are exposed only via short-lived signed URLs.
