# 배송대행 흐름 재구성 — Phase 5: 송장 재업로드 + 행별 송장 표시 + 배송 상태 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 송장번호를 채운 엑셀을 재업로드하면 시스템이 행별 송장을 파싱해 `items[*].tracking_number` 를 갱신하고 status=shipped 로 전환한다. 고객 화면에는 행별 송장번호 + CJ 조회 버튼 + 송장 포함 엑셀 다운로드가 노출된다. 관리자가 "완료" 처리하면 status=completed.

**Architecture:** Phase 1의 `attach_tracking` / `complete_shipping_upload` RPC 를 사용. 재업로드는 새 server action `attachTrackingAction` 이 (1) 새 파서로 행 파싱 → (2) 원본과 행수 비교 → (3) Storage 업로드 → (4) RPC 호출 순서. 송장 포함 엑셀 다운로드는 `admin_storage_path` 의 signed URL 을 server action 으로 발급. 마지막으로 legacy 파일/UI 정리.

**Tech Stack:** Next.js 14, xlsx, Supabase Storage. CJ lookup 컴포넌트는 기존 `DeliveryTrackingLookup` 을 재사용하지만 input 을 송장번호 직접 받도록 약간 확장.

설계 문서: [docs/superpowers/specs/2026-05-08-shipping-flow-restructure-design.md](../specs/2026-05-08-shipping-flow-restructure-design.md)
선행: Phase 1, 2, 3, 4 완료.

---

## File Structure

**Created:**
- `lib/actions/admin-attach-tracking.ts` — 송장 재업로드 server action + 송장 엑셀 다운로드 URL 발급
- `app/(admin)/admin/shipping-uploads/[id]/AttachTrackingForm.tsx` — 재업로드 폼 (client)
- `app/(admin)/admin/shipping-uploads/[id]/CompleteButton.tsx` — 완료 처리 버튼 (client)
- `components/InvoiceLookupButton.tsx` — 송장번호 직접 입력으로 CJ 조회하는 작은 컴포넌트
- `tests/unit/attach-tracking.test.ts` — 행 매칭/파싱 단위 테스트

**Modified:**
- `app/(user)/shipping-uploads/[id]/page.tsx` — 행별 송장 컬럼 + CJ 조회 + 송장 엑셀 다운로드 추가
- `app/(admin)/admin/shipping-uploads/[id]/page.tsx` — approved/shipped 상태에서 재업로드 폼·완료 버튼 노출
- `components/AdminNav.tsx` — Phase 2 에서 추가했던 "Legacy 주문" 링크 제거 (선택적)

**Deprecated/Archive:**
- `lib/order-upload-parser.ts` — 더 이상 호출 없음. 파일 헤더에 archive 주석 추가.
- `lib/actions/order-upload.ts` — 더 이상 호출 없음. 파일 헤더에 archive 주석.
- `app/(admin)/admin/orders-legacy/*` — 유지(열람용). nav 에서 링크는 빼도 OK.

---

### Task 1: 송장 재업로드 + 다운로드 server action

**Files:**
- Create: `lib/actions/admin-attach-tracking.ts`

- [ ] **Step 1: server action 작성**

`lib/actions/admin-attach-tracking.ts`:

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';
import { parseShippingExcel, type ParsedShippingItem } from '@/lib/shipping-upload-parser';
import { mapShippingUploadError } from '@/lib/actions/admin-shipping-uploads';

const MAX_BYTES = 5 * 1024 * 1024;
const OOXML_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type AttachTrackingResult = { ok: true } | { ok: false; error: string };

export async function attachTrackingAction(
  uploadId: string,
  fd: FormData,
): Promise<AttachTrackingResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '송장 채운 엑셀 파일을 선택해주세요.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: '파일 크기는 5MB 이하여야 합니다.' };
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return { ok: false, error: '.xlsx 파일만 업로드할 수 있습니다.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(OOXML_MAGIC)) {
    return { ok: false, error: '엑셀(.xlsx) 파일 형식이 아닙니다.' };
  }

  let parsed;
  try {
    parsed = parseShippingExcel(buffer);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '엑셀 파싱 실패' };
  }

  // 원본 행 수 비교 (RPC 안에서도 검사하지만 미리 차단해 메시지 명확화)
  const { data: existing } = await guard.supabase
    .from('order_uploads')
    .select('items, status, user_id')
    .eq('id', uploadId)
    .single<{ items: unknown[]; status: string; user_id: string }>();
  if (!existing) return { ok: false, error: '업로드를 찾을 수 없습니다.' };
  if (!['approved', 'shipped'].includes(existing.status)) {
    return { ok: false, error: `현재 상태(${existing.status})에서는 송장 등록이 불가합니다.` };
  }
  if (existing.items.length !== parsed.items.length) {
    return {
      ok: false,
      error: `원본 ${existing.items.length}행과 새 파일 ${parsed.items.length}행이 다릅니다.`,
    };
  }

  // Storage 에 admin/<uploadId>/<timestamp>-<name> 으로 업로드
  const safeName = file.name.replace(/[^\w가-힣\.\-]+/g, '_');
  const storagePath = `admin/${uploadId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await guard.supabase.storage
    .from('order-uploads')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (upErr) return { ok: false, error: `파일 업로드 실패: ${upErr.message}` };

  // RPC 호출
  const { error: rpcErr } = await (guard.supabase.rpc as any)('attach_tracking', {
    upload_id: uploadId,
    storage_path: storagePath,
    parsed_items: parsed.items as ParsedShippingItem[],
  });
  if (rpcErr) {
    // Storage rollback
    await guard.supabase.storage.from('order-uploads').remove([storagePath]);
    console.error('[attach-tracking] rpc', rpcErr);
    return { ok: false, error: mapShippingUploadError(rpcErr.message) };
  }

  revalidatePath(`/admin/shipping-uploads/${uploadId}`);
  revalidatePath(`/shipping-uploads/${uploadId}`);
  revalidatePath('/admin/shipping-uploads');
  revalidatePath('/shipping-uploads');
  return { ok: true };
}

export async function getTrackingExcelUrl(
  storagePath: string,
  originalName?: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // 관리자/소유자 모두 호출 가능. RLS 가 storage 정책으로 정합성 보장(Phase 1.4 의 정책).
  // 단, server action 입장에선 user-scoped supabase client 가 필요. requireAdmin 대신 createClient 사용.
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('order-uploads')
    .createSignedUrl(storagePath, 60 * 5, { download: originalName || true });
  if (error || !data) {
    console.error('[attach-tracking] signedUrl', { storagePath, error });
    return { ok: false, error: '다운로드 URL을 만들지 못했습니다.' };
  }
  return { ok: true, url: data.signedUrl };
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add lib/actions/admin-attach-tracking.ts
git commit -m "feat(actions): 송장 재업로드 + 송장 엑셀 다운로드 URL 발급"
```

---

### Task 2: 행별 송장 매칭 단위 테스트

**Files:**
- Create: `tests/unit/attach-tracking.test.ts`
- Create: `tests/fixtures/shipping-with-tracking-partial.xlsx`

- [ ] **Step 1: 픽스처 추가**

`tests/fixtures/build-shipping-fixtures.cjs` 끝에 다음을 추가:

```javascript
build('shipping-with-tracking-partial.xlsx', [
  [1, '홍길동', '010-1234-5678', '서울시 1', 'SKR-001', '스니커즈', 1, '', '632012345678'],
  [2, '김철수', '010-2222-3333', '서울시 2', 'SKR-001', '스니커즈', 1, '', ''],
  [3, '박영희', '010-4444-5555', '부산시 3', 'TSH-002', '티셔츠', 1, '', '632099998888'],
]);
```

Run: `node tests/fixtures/build-shipping-fixtures.cjs`
Expected: 픽스처 생성됨.

- [ ] **Step 2: 테스트 작성**

`tests/unit/attach-tracking.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseShippingExcel } from '@/lib/shipping-upload-parser';

function load(name: string): Buffer {
  return fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name));
}

describe('재업로드 부분 송장', () => {
  it('일부 행만 송장이 채워진 엑셀을 그대로 파싱', () => {
    const r = parseShippingExcel(load('shipping-with-tracking-partial.xlsx'));
    expect(r.items.map((it) => it.tracking_number)).toEqual([
      '632012345678', null, '632099998888',
    ]);
  });

  it('원본/재업로드 행수 일치 검사 헬퍼', () => {
    const a = parseShippingExcel(load('shipping-valid.xlsx'));
    const b = parseShippingExcel(load('shipping-with-tracking-partial.xlsx'));
    expect(a.items.length).toBe(3);
    expect(b.items.length).toBe(3);
    expect(a.items.length === b.items.length).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `pnpm vitest run tests/unit/attach-tracking.test.ts`
Expected: PASS — 2/2 (파서가 이미 있으므로).

- [ ] **Step 4: 커밋**

```bash
git add tests/unit/attach-tracking.test.ts \
        tests/fixtures/build-shipping-fixtures.cjs \
        tests/fixtures/shipping-with-tracking-partial.xlsx
git commit -m "test: 부분 송장 채워진 재업로드 파싱"
```

---

### Task 3: AttachTrackingForm 컴포넌트

**Files:**
- Create: `app/(admin)/admin/shipping-uploads/[id]/AttachTrackingForm.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { attachTrackingAction } from '@/lib/actions/admin-attach-tracking';

export function AttachTrackingForm({ uploadId }: { uploadId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">송장 재업로드</h3>
      <p className="text-xs text-muted-foreground">
        원본 엑셀의 송장번호 컬럼을 채워서 다시 업로드하면, 행별 송장이 갱신되고 상태가 "발송중"으로 바뀝니다.
        부분 발송도 가능 — 송장 비어있는 행은 "미발송"으로 표시됩니다. 여러 번 덮어쓸 수 있습니다.
      </p>
      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm border rounded-md p-2"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        disabled={!file || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            if (!file) return;
            const fd = new FormData();
            fd.append('file', file);
            const r = await attachTrackingAction(uploadId, fd);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            toast({ title: '송장이 등록되었습니다', description: '고객 화면에 행별 송장이 노출됩니다.' });
            setFile(null);
            router.refresh();
          })
        }
      >
        {pending ? '업로드 중…' : '송장 채운 엑셀 업로드'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(admin\)/admin/shipping-uploads/\[id\]/AttachTrackingForm.tsx
git commit -m "feat(ui): AttachTrackingForm — 송장 재업로드 폼"
```

---

### Task 4: CompleteButton 컴포넌트

**Files:**
- Create: `app/(admin)/admin/shipping-uploads/[id]/CompleteButton.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { completeShippingUploadAction } from '@/lib/actions/admin-shipping-uploads';

export function CompleteButton({ uploadId }: { uploadId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await completeShippingUploadAction(uploadId);
          if (!r.ok) {
            toast({ title: '완료 처리 실패', description: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: '완료 처리되었습니다' });
          router.refresh();
        })
      }
    >
      {pending ? '처리 중…' : '완료 처리'}
    </Button>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(admin\)/admin/shipping-uploads/\[id\]/CompleteButton.tsx
git commit -m "feat(ui): CompleteButton — 배송 완료 처리"
```

---

### Task 5: 관리자 상세에 재업로드/완료 UI 끼움 + 송장 다운로드

**Files:**
- Modify: `app/(admin)/admin/shipping-uploads/[id]/page.tsx`

- [ ] **Step 1: 새 컬럼 / 위젯 끼우기**

Phase 4에서 만든 페이지에 다음 변화:

1. `select('*, ...')` 에 이미 `admin_storage_path`, `shipped_at`, `completed_at` 가 포함되어 있음(* 로 가져오므로). type 의 Upload 타입에 다음 필드 추가:

```diff
type Upload = {
  ...
+ admin_storage_path: string | null;
+ shipped_at: string | null;
+ completed_at: string | null;
};
```

2. 상세 페이지의 표 컬럼에 "송장번호" 컬럼을 추가:

```diff
  <thead>
    <tr>
      <th>#</th>
      <th>받는사람</th>
      <th>상품 (코드 / 옵션)</th>
      <th className="text-right">수량</th>
      <th className="text-right">배송비</th>
+     <th>송장번호</th>
    </tr>
  </thead>
  <tbody>
    {data.items.map((it) => (
      <tr key={it.no}>
        ...
+       <td className="px-3 py-2 font-mono text-xs">{it.tracking_number ?? '—'}</td>
      </tr>
    ))}
  </tbody>
```

3. 화면 하단에 상태별 컴포넌트:

```tsx
import { AttachTrackingForm } from './AttachTrackingForm';
import { CompleteButton } from './CompleteButton';

// JSX 안 (status === 'pending' 블록 아래에 추가):
{(data.status === 'approved' || data.status === 'shipped') && (
  <AttachTrackingForm uploadId={data.id} />
)}
{data.status === 'shipped' && <CompleteButton uploadId={data.id} />}
```

4. `admin_storage_path` 가 있으면 헤더에 "송장 포함 엑셀 다운로드" 추가 (DownloadButton 의 `storagePath` 인자 다른 값으로):

```tsx
{data.admin_storage_path && (
  <DownloadButton
    storagePath={data.admin_storage_path}
    originalName={`tracking-${data.original_name}`}
  />
)}
```

- [ ] **Step 2: typecheck + 수동 확인**

Run: `pnpm typecheck && pnpm dev`. 관리자 흐름:
1. approved 상태에서 AttachTrackingForm 보임
2. 원본 다운로드 → 일부 송장 채운 후 재업로드 → 토스트
3. 표의 송장번호 컬럼이 행별로 표시됨
4. shipped 상태에서 CompleteButton 보임 → 클릭 → completed 로 전환

- [ ] **Step 3: 커밋**

```bash
git add app/\(admin\)/admin/shipping-uploads/\[id\]/page.tsx
git commit -m "feat(admin): 송장 재업로드 폼 + 완료 처리 + 행별 송장 컬럼"
```

---

### Task 6: 고객 상세에 행별 송장 + CJ 조회 + 송장 엑셀 다운로드

**Files:**
- Modify: `app/(user)/shipping-uploads/[id]/page.tsx`
- Create: `components/InvoiceLookupButton.tsx`

- [ ] **Step 1: InvoiceLookupButton 작성**

기존 `DeliveryTrackingLookup` 은 `orderId` 기반이라 직접 송장번호로 조회하는 버전이 필요. 가장 단순한 옵션은 외부 CJ 조회 페이지를 새 탭으로 여는 것.

```tsx
import { ExternalLink } from 'lucide-react';

export function InvoiceLookupButton({ tracking }: { tracking: string }) {
  const url = `https://trace.cjlogistics.com/web/detail.jsp?slipno=${encodeURIComponent(tracking)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 h-7 px-2 rounded bg-surface-muted text-[11px] hover:bg-muted"
    >
      CJ 조회
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}
```

> 주의: CJ 공식 조회 URL 은 운영자가 검증해야 함. 위 URL 은 `lib/tracking.ts` 에서 사용 중인 패턴을 그대로 따름. 실제 url 헬퍼가 있으면 그것을 import 한다 — `lib/tracking.ts` 에 `getTrackingUrl(carrier, tracking)` 이 있으므로:

```tsx
import { getTrackingUrl } from '@/lib/tracking';

export function InvoiceLookupButton({ tracking }: { tracking: string }) {
  const url = getTrackingUrl('CJ대한통운', tracking);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="inline-flex items-center gap-1 h-7 px-2 rounded bg-surface-muted text-[11px] hover:bg-muted">
      CJ 조회
    </a>
  );
}
```

- [ ] **Step 2: TrackingDownloadButton (client)**

`app/(user)/shipping-uploads/[id]/TrackingDownloadButton.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTrackingExcelUrl } from '@/lib/actions/admin-attach-tracking';

export function TrackingDownloadButton({
  storagePath,
  originalName,
}: {
  storagePath: string;
  originalName: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await getTrackingExcelUrl(storagePath, originalName);
        setBusy(false);
        if (r.ok) window.location.href = r.url;
        else alert(r.error);
      }}
    >
      <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
      송장 포함 엑셀 다운로드
    </Button>
  );
}
```

- [ ] **Step 3: 고객 상세 페이지 수정**

`app/(user)/shipping-uploads/[id]/page.tsx` 의 type 과 표를 확장:

```diff
type Upload = {
  id: string;
  original_name: string;
  status: string;
  items: Item[];
  total_quantity: number;
  shipping_fee_total: number;
  admin_memo: string | null;
+ admin_storage_path: string | null;
+ shipped_at: string | null;
+ completed_at: string | null;
  created_at: string;
};

// select 도 변경
.select('id, original_name, status, items, total_quantity, shipping_fee_total, admin_memo, admin_storage_path, shipped_at, completed_at, created_at')
```

JSX 의 표 헤더에 "송장번호" 컬럼 추가:

```diff
  <thead>
    <tr>
      <th>#</th>
      <th>받는사람</th>
      <th>상품 (코드 / 옵션)</th>
      <th className="text-right">수량</th>
      <th className="text-right">배송비</th>
+     <th>송장 / 조회</th>
    </tr>
  </thead>
```

행에 송장 셀:

```tsx
import { InvoiceLookupButton } from '@/components/InvoiceLookupButton';

// 행 안에:
<td className="px-3 py-2 text-xs">
  {it.tracking_number ? (
    <div className="flex items-center gap-2">
      <span className="font-mono">{it.tracking_number}</span>
      <InvoiceLookupButton tracking={it.tracking_number} />
    </div>
  ) : (
    <span className="text-muted-foreground">미발송</span>
  )}
</td>
```

헤더에 송장 엑셀 다운로드 버튼:

```tsx
import { TrackingDownloadButton } from './TrackingDownloadButton';

// 헤더의 status 칩 아래쯤:
{data.admin_storage_path && (
  <TrackingDownloadButton
    storagePath={data.admin_storage_path}
    originalName={`tracking-${data.original_name}`}
  />
)}
```

- [ ] **Step 4: typecheck + 수동 확인**

Run: `pnpm typecheck && pnpm dev`. 사용자 흐름:
1. 관리자 측에서 송장 채워 재업로드한 직후, 고객 `/shipping-uploads/[id]` 접속
2. 표에 행별 송장번호 + CJ 조회 버튼 표시
3. 미발송 행은 "미발송" 으로 표시
4. 헤더에 "송장 포함 엑셀 다운로드" 버튼이 보이고 클릭 시 다운로드됨

- [ ] **Step 5: 커밋**

```bash
git add components/InvoiceLookupButton.tsx \
        app/\(user\)/shipping-uploads/\[id\]/
git commit -m "feat(ui): 고객 상세에 행별 송장 + CJ 조회 + 송장 엑셀 다운로드"
```

---

### Task 7: legacy 파일 archive 주석

**Files:**
- Modify: `lib/order-upload-parser.ts`
- Modify: `lib/actions/order-upload.ts`

- [ ] **Step 1: 파일 헤더에 archive 주석 추가**

각 파일 최상단에 다음 주석 추가:

```typescript
/**
 * @deprecated 2026-05-08 부터 사용하지 않음.
 * 새 흐름은 lib/shipping-upload-parser.ts 와 lib/actions/shipping-upload.ts 를 사용한다.
 * 이 파일은 legacy 데이터 호환성 검토를 위해 보존 중이며, 어느 코드에서도 import 하지 않는다.
 */
```

- [ ] **Step 2: 어디에서도 import 되지 않음 확인**

Run: `grep -r "lib/order-upload-parser\|lib/actions/order-upload" app/ lib/ components/ tests/`
Expected: 결과 없음 (또는 자기 자신만).

만약 결과가 있다면 호출처를 확인하고, Phase 4 Task 8 의 redirect 처리가 빠진 곳이 있는지 확인. 모두 정리.

- [ ] **Step 3: 커밋**

```bash
git add lib/order-upload-parser.ts lib/actions/order-upload.ts
git commit -m "chore: legacy 파서/액션에 deprecated 주석 추가"
```

---

### Task 8: legacy 주문 화면 정리 (선택)

**Files:**
- Modify: `components/AdminNav.tsx` 또는 `app/(admin)/admin/layout.tsx`

- [ ] **Step 1: nav 에서 "Legacy 주문" 링크 제거**

Phase 2 Task 7 에서 추가했던 nav 의 "Legacy 주문" 한시적 링크를 제거. 페이지 자체(`/admin/orders-legacy`)는 유지 — 이전 데이터 열람용으로 남김. 관리자가 URL 직접 접근하면 보임.

- [ ] **Step 2: 커밋**

```bash
git add components/AdminNav.tsx
git commit -m "chore(nav): legacy 주문 링크 제거 (페이지는 보존)"
```

---

### Task 9: 파일/UI 정리 — README + 변경 이력

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README "현재 구현 상태" 갱신**

기존 `README.md` 의 다음 섹션을 새 흐름에 맞춰 갱신:

- 주문자 섹션: "엑셀 주문서 양식" → "배송대행 양식 (CJ식 1행 1택배)"
- 주문자 섹션 하단: "보유 재고 화면" 항목 추가
- 관리자 섹션: "엑셀 주문서 검토" → "배송대행 업로드 검토 + 송장 재업로드"
- 관리자 섹션: "주문관리 = 엑시트몰 상품 구매 검토 (재고 적립)" 항목 추가
- "주요 경로" 섹션에 `/shipping-uploads`, `/inventory`, `/admin/shipping-uploads` 추가
- "주요 업무 흐름" 섹션을 새 흐름 1·2 로 다시 씀
- "최종 업데이트" 날짜를 2026-05-08 로

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs(readme): 새 흐름(재고 적립 + 배송대행)에 맞춰 갱신"
```

---

### Task 10: 전체 회귀 검증 + E2E smoke

- [ ] **Step 1: 모든 검사**

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```
Expected: 전부 PASS.

- [ ] **Step 2: 종단간 시나리오**

1. **흐름 1**: 사용자 A 가 `/shop` → `/cart` → `/checkout` → 검토 요청 → 관리자 승인 → 사용자 A 의 `/inventory` 에 적립
2. **흐름 2**: 사용자 A 가 `/shipping-uploads` → 양식 다운로드 → 행 3개 작성 → 검토 요청 → 관리자 `/admin/shipping-uploads` 검토대기 확인 → 승인 → `user_inventory` 차감, 배송비 차감
3. **송장 재업로드**: 관리자 상세에서 원본 다운로드 → 행 1, 3에만 송장 채움 → 재업로드 → 사용자 A 의 `/shipping-uploads/[id]` 에서 행 1·3은 송장+CJ조회 / 행 2는 미발송
4. **추가 송장**: 관리자가 같은 엑셀에 행 2 송장도 채워 다시 재업로드 → 사용자 화면 갱신
5. **완료**: 관리자가 완료 처리 → status=completed
6. **다운로드**: 고객이 송장 포함 엑셀 다운로드 클릭 → 정상 다운로드
7. **취소·반려 확인**: 다른 검토대기 업로드 → 반려 → 차감 없음
8. **legacy redirect**: `/orders/upload`, `/admin/order-uploads`, `/admin/order-uploads/<id>` 접근 시 새 경로로 redirect

- [ ] **Step 3: Realtime 알림 점검**

관리자 대시보드를 띄운 채 다른 사용자가:
1. 흐름 1 검토 요청 → "새 검토 요청" 토스트
2. 흐름 2 업로드 → "새 배송대행 업로드" 토스트

- [ ] **Step 4: 보안/한도 회귀**

1. 1인 한도 5인 상품 — 사용자 A 가 검토대기 3개 만든 상태에서 추가 3개 → "1인 구매 한도 초과" 차단 (검토대기 3 + 신규 3 > 5)
2. 한도 미적용 상품 — 정상
3. 다른 사용자의 stock_order/shipping_upload 를 RLS 우회 SELECT 시도 → RLS 차단 확인 (Supabase Studio SQL editor 에서 다른 user 토큰으로)

이 단계까지 모두 통과하면 Phase 5 완료. 전체 배송대행 흐름 재구성 완료.

---

## Phase 5 완료 후 권장 후속 작업 (별도 plan)

- 흐름 1 1인 한도 검사를 매 결제 시점이 아닌 hook 으로 묶어 더 정교하게 (다중 동시 요청 race)
- 송장 자동 폴링/캐싱 (CJ 정책 검토 후)
- 비CJ 택배사 앱 내 조회
- legacy `/admin/orders-legacy` 화면 archive (read-only zip)
