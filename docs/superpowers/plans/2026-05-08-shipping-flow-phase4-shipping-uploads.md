# 배송대행 흐름 재구성 — Phase 4: 흐름 2 (배송대행 업로드 — 양식·파서·UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CJ식 1행 1택배 엑셀 양식을 도입하고, 고객 `/shipping-uploads` 화면에서 배송비(행수×3,300) 미리보기 + 검토 요청을 한다. 관리자 `/admin/shipping-uploads` 에서 승인 시 보유 재고와 예치금이 차감된다. 메뉴 라벨도 "배송대행 업로드"로 통일.

**Architecture:** Phase 1에서 만든 `order_uploads` 확장 컬럼 + `approve/reject/cancel_shipping_upload` RPC 를 활용. 새 파서(`parseShippingExcel`)는 기존 `parseOrderExcel`을 대체하지 않고 별도 함수로 둔다(한시적으로 두 파서 공존, 새 업로드만 새 파서 사용). 새 양식 파일을 `/public/shipping-template.xlsx` 로 둔다.

**Tech Stack:** Next.js 14, xlsx 라이브러리, Vitest, Supabase Storage(`order-uploads` 버킷 재사용).

설계 문서: [docs/superpowers/specs/2026-05-08-shipping-flow-restructure-design.md](../specs/2026-05-08-shipping-flow-restructure-design.md)
선행: Phase 1, 2, 3 완료.

---

## File Structure

**Created:**
- `public/shipping-template.xlsx` — 신규 CJ식 양식 파일 (수동 작성, Task 1 참조)
- `lib/shipping-upload-parser.ts` — 새 파서
- `lib/actions/shipping-upload.ts` — 고객용 업로드 server action (request)
- `app/(user)/shipping-uploads/page.tsx` — 신규 업로드 + 이력 화면
- `app/(user)/shipping-uploads/[id]/page.tsx` — 상세 (미리보기·취소)
- `app/(user)/shipping-uploads/UploadForm.tsx` — client (파일 입력 + submit)
- `app/(user)/shipping-uploads/[id]/CancelButton.tsx` — pending 취소 버튼
- `app/(admin)/admin/shipping-uploads/page.tsx` — 관리자 검토 목록
- `app/(admin)/admin/shipping-uploads/[id]/page.tsx` — 관리자 상세 (승인/반려)
- `app/(admin)/admin/shipping-uploads/[id]/ReviewActions.tsx` — 승인/반려 (client)
- `app/(admin)/admin/shipping-uploads/[id]/DownloadButton.tsx` — 원본 다운로드
- `tests/unit/shipping-upload-parser.test.ts` — 파서 단위 테스트
- `tests/sample_shipping.xlsx` — 파서 테스트용 샘플 (수동 생성, 또는 fixture 작성기)

**Modified:**
- `components/UserNav.tsx` 또는 `app/(user)/layout.tsx` — "주문서 업로드" → "배송대행 업로드"
- `components/AdminNav.tsx` 또는 `app/(admin)/admin/layout.tsx` — "주문서 업로드" → "배송대행 업로드"

**Deprecated (이번 Phase에서 제거하지 않음, Phase 5에서 정리):**
- `app/(user)/orders/upload/*` — 기존 화면. 새 `/shipping-uploads` 도입 후, 기존 라우트는 redirect 처리.
- `app/(admin)/admin/order-uploads/*` — 기존 화면. 새 `/admin/shipping-uploads` 도입 후 redirect.
- `lib/actions/order-upload.ts`, `lib/order-upload-parser.ts` — 보존(Phase 5에서 archive).

---

### Task 1: 새 엑셀 양식 파일 작성

**Files:**
- Create: `public/shipping-template.xlsx`

> 이 단계는 파일 바이너리 작성이라 코드만으로 표현 안 됨. xlsx 라이브러리로 생성하는 1회용 스크립트를 둔다.

- [ ] **Step 1: 양식 생성 스크립트 작성**

`scripts/build-shipping-template.cjs`:

```javascript
// 1회용. node scripts/build-shipping-template.cjs 로 실행하면 public/shipping-template.xlsx 생성.
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const wb = XLSX.utils.book_new();

// 헤더 영역(1~6행)
const aoa = [
  ['배송대행 업로드 양식', '', '', '', '', '', '', '', ''],
  ['CJ대한통운 기준 · 쿠팡/스스 통일 양식', '', '', '', '', '', '', '', ''],
  [],
  ['업로더 정보', '', '', '', '', '', '', '', ''],
  ['상호', '(예: ABC상사)', '담당자 연락처', '010-0000-0000', '', '', '', '', ''],
  ['요청사항', '(공통 메모, 선택)', '', '', '', '', '', '', ''],
  [],
  ['No', '받는사람*', '연락처*', '주소*', '관리코드*', '상품명/옵션', '수량*', '메모', '송장번호'],
  // 예시 1행
  [1, '예시 홍길동', '010-1234-5678', '서울시 강남구 ...', 'SKR-001', '스니커즈/270', 1, '문 앞에 두어주세요', ''],
  [2, '', '', '', '', '', '', '', ''],
];

const ws = XLSX.utils.aoa_to_sheet(aoa);

// 컬럼 폭 (대략)
ws['!cols'] = [
  { wch: 5 }, { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 14 },
  { wch: 24 }, { wch: 6 }, { wch: 20 }, { wch: 16 },
];

XLSX.utils.book_append_sheet(wb, ws, '배송대행');

const outPath = path.resolve(__dirname, '..', 'public', 'shipping-template.xlsx');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
XLSX.writeFile(wb, outPath);
console.log('Wrote', outPath);
```

- [ ] **Step 2: 양식 생성 실행**

Run: `node scripts/build-shipping-template.cjs`
Expected: `public/shipping-template.xlsx` 생성. 엑셀에서 열어 형태 확인.

- [ ] **Step 3: 커밋**

```bash
git add scripts/build-shipping-template.cjs public/shipping-template.xlsx
git commit -m "feat(template): 배송대행 CJ식 엑셀 양식 + 생성 스크립트"
```

---

### Task 2: 새 파서 작성 (TDD)

**Files:**
- Create: `lib/shipping-upload-parser.ts`
- Create: `tests/unit/shipping-upload-parser.test.ts`
- Create: `tests/fixtures/shipping-valid.xlsx` (테스트용 샘플)
- Create: `tests/fixtures/build-shipping-fixtures.cjs`

- [ ] **Step 1: 픽스처 빌더 작성**

`tests/fixtures/build-shipping-fixtures.cjs`:

```javascript
// node tests/fixtures/build-shipping-fixtures.cjs 로 실행 → 픽스처 .xlsx 들 생성.
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const HEADER_ROW = ['No', '받는사람', '연락처', '주소', '관리코드', '상품명/옵션', '수량', '메모', '송장번호'];

function build(name, rowsAfterHeader) {
  const wb = XLSX.utils.book_new();
  const aoa = [
    ['배송대행 양식', '', '', '', '', '', '', '', ''],
    [],
    ['상호', '예시상사', '담당자 연락처', '010-1111-1111', '', '', '', '', ''],
    ['요청사항', '안전 배송', '', '', '', '', '', '', ''],
    [],
    [],
    [],
    HEADER_ROW,
    ...rowsAfterHeader,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, '배송대행');
  const outPath = path.resolve(__dirname, name);
  XLSX.writeFile(wb, outPath);
  console.log('Wrote', outPath);
}

build('shipping-valid.xlsx', [
  [1, '홍길동', '010-1234-5678', '서울시 강남구 1', 'SKR-001', '스니커즈/270', 1, '문 앞', ''],
  [2, '김철수', '010-2222-3333', '서울시 마포구 2', 'SKR-001', '스니커즈/280', 2, '', ''],
  [3, '박영희', '010-4444-5555', '부산시 수영구 3', 'TSH-002', '티셔츠/L', 1, '경비실', ''],
]);

build('shipping-empty.xlsx', []);

build('shipping-missing-recipient.xlsx', [
  [1, '', '010-1234-5678', '서울시 1', 'SKR-001', '스니커즈', 1, '', ''],
]);

build('shipping-bad-quantity.xlsx', [
  [1, '홍길동', '010-1234-5678', '서울시 1', 'SKR-001', '스니커즈', -1, '', ''],
]);

build('shipping-with-tracking.xlsx', [
  [1, '홍길동', '010-1234-5678', '서울시 1', 'SKR-001', '스니커즈', 1, '', '632012345678'],
  [2, '김철수', '010-2222-3333', '서울시 2', 'SKR-001', '스니커즈', 1, '', ''],
]);
```

Run: `node tests/fixtures/build-shipping-fixtures.cjs`
Expected: `tests/fixtures/shipping-*.xlsx` 5개 파일 생성.

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/unit/shipping-upload-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseShippingExcel,
  computeShippingFee,
  SHIPPING_FEE_PER_ROW,
} from '@/lib/shipping-upload-parser';

function load(name: string): Buffer {
  return fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name));
}

describe('parseShippingExcel — valid', () => {
  it('정상 양식 3행을 파싱', () => {
    const r = parseShippingExcel(load('shipping-valid.xlsx'));
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({
      no: 1,
      recipient: '홍길동',
      phone: '010-1234-5678',
      address: '서울시 강남구 1',
      product_code: 'SKR-001',
      product_name: '스니커즈/270',
      quantity: 1,
      memo: '문 앞',
      tracking_number: null,
    });
    expect(r.total_quantity).toBe(4);
    expect(r.shipping_fee_total).toBe(3 * 3_300);
    expect(r.uploader_company).toBe('예시상사');
    expect(r.uploader_phone).toBe('010-1111-1111');
  });
});

describe('parseShippingExcel — errors', () => {
  it('빈 양식', () => {
    expect(() => parseShippingExcel(load('shipping-empty.xlsx'))).toThrow(/한 줄도 입력되지 않았/);
  });
  it('받는사람 누락', () => {
    expect(() => parseShippingExcel(load('shipping-missing-recipient.xlsx'))).toThrow(/받는사람/);
  });
  it('잘못된 수량', () => {
    expect(() => parseShippingExcel(load('shipping-bad-quantity.xlsx'))).toThrow(/수량/);
  });
});

describe('parseShippingExcel — tracking 컬럼 보존', () => {
  it('송장번호가 채워진 행은 그대로 보존, 없는 행은 null', () => {
    const r = parseShippingExcel(load('shipping-with-tracking.xlsx'));
    expect(r.items[0]!.tracking_number).toBe('632012345678');
    expect(r.items[1]!.tracking_number).toBeNull();
  });
});

describe('computeShippingFee', () => {
  it('행수 × 3,300', () => {
    expect(computeShippingFee(0)).toBe(0);
    expect(computeShippingFee(1)).toBe(3_300);
    expect(computeShippingFee(5)).toBe(16_500);
  });
});

describe('SHIPPING_FEE_PER_ROW 상수', () => {
  it('3300', () => {
    expect(SHIPPING_FEE_PER_ROW).toBe(3_300);
  });
});
```

- [ ] **Step 3: 테스트 실행하여 실패 확인**

Run: `pnpm vitest run tests/unit/shipping-upload-parser.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 4: 파서 구현**

`lib/shipping-upload-parser.ts`:

```typescript
import * as XLSX from 'xlsx';

export const SHIPPING_FEE_PER_ROW = 3_300;

export type ParsedShippingItem = {
  no: number;
  recipient: string;
  phone: string;
  address: string;
  product_code: string;
  product_name: string | null;
  quantity: number;
  memo: string | null;
  tracking_number: string | null;
};

export type ParsedShippingUpload = {
  uploader_company: string | null;
  uploader_phone: string | null;
  request_memo: string | null;
  items: ParsedShippingItem[];
  total_quantity: number;
  shipping_fee_total: number;
};

const HEADER_KEYS = ['no', '받는사람', '연락처', '주소', '관리코드', '상품명/옵션', '수량', '메모', '송장번호'];

export function computeShippingFee(rows: number): number {
  return Math.max(0, rows) * SHIPPING_FEE_PER_ROW;
}

function cellString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function cellInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const s = typeof value === 'number' ? value : Number(String(value).replace(/[\s,]/g, ''));
  return Number.isFinite(s) ? Math.trunc(s) : null;
}

export function parseShippingExcel(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): ParsedShippingUpload {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new Error('엑셀 파일을 읽을 수 없습니다.');
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('시트가 없습니다.');
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('시트를 읽을 수 없습니다.');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });

  // 헤더 행 위치 탐색: 첫 컬럼이 "No" 인 첫 행
  let headerRow = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r) continue;
    if (cellString(r[0])?.toLowerCase() === 'no') {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) throw new Error('양식의 헤더 행을 찾을 수 없습니다 (첫 컬럼 "No").');

  // 헤더 검증 (키 순서)
  const headerCells = (rows[headerRow] ?? []).map((c) => cellString(c)?.toLowerCase() ?? '');
  for (let i = 0; i < HEADER_KEYS.length; i += 1) {
    const expected = HEADER_KEYS[i]!;
    const actual = headerCells[i] ?? '';
    if (!actual.includes(expected.toLowerCase()) && actual !== expected) {
      // 너그럽게 — 첫 6개 컬럼만 정확 일치 강제
      if (i < 7 && actual !== expected.toLowerCase()) {
        throw new Error(`양식 헤더가 다릅니다 (${i + 1}열): "${actual}" → "${expected}" 기대.`);
      }
    }
  }

  // 헤더 위쪽 6행 안에서 업로더 정보 탐색
  let uploader_company: string | null = null;
  let uploader_phone: string | null = null;
  let request_memo: string | null = null;
  for (let i = 0; i < headerRow; i += 1) {
    const r = rows[i] ?? [];
    const label = cellString(r[0])?.toLowerCase() ?? '';
    if (label === '상호') uploader_company = cellString(r[1]);
    if (label === '담당자 연락처' || label === '담당자') uploader_phone = cellString(r[3] ?? r[1]);
    if (label === '요청사항') request_memo = cellString(r[1]);
  }

  const items: ParsedShippingItem[] = [];
  for (let r = headerRow + 1; r < rows.length; r += 1) {
    const cells = rows[r] ?? [];
    const recipient = cellString(cells[1]);
    const phone = cellString(cells[2]);
    const address = cellString(cells[3]);
    const product_code = cellString(cells[4]);
    const product_name = cellString(cells[5]);
    const quantity = cellInt(cells[6]);
    const memo = cellString(cells[7]);
    const tracking_number = cellString(cells[8]);

    // 완전 빈 행 스킵
    if (!recipient && !phone && !address && !product_code && quantity === null) continue;

    if (!recipient) throw new Error(`${r + 1}행: 받는사람이 비어있습니다.`);
    if (!phone) throw new Error(`${r + 1}행: 연락처가 비어있습니다.`);
    if (!address) throw new Error(`${r + 1}행: 주소가 비어있습니다.`);
    if (!product_code) throw new Error(`${r + 1}행: 관리코드가 비어있습니다.`);
    if (quantity === null || quantity < 1) {
      throw new Error(`${r + 1}행 (${recipient}): 수량은 1 이상의 정수여야 합니다.`);
    }

    items.push({
      no: items.length + 1,
      recipient,
      phone,
      address,
      product_code,
      product_name,
      quantity,
      memo,
      tracking_number,
    });
  }

  if (items.length === 0) {
    throw new Error('주문 항목이 한 줄도 입력되지 않았습니다.');
  }

  const total_quantity = items.reduce((s, it) => s + it.quantity, 0);
  const shipping_fee_total = computeShippingFee(items.length);

  return {
    uploader_company,
    uploader_phone,
    request_memo,
    items,
    total_quantity,
    shipping_fee_total,
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run tests/unit/shipping-upload-parser.test.ts`
Expected: PASS — 모든 케이스.

- [ ] **Step 6: 커밋**

```bash
git add lib/shipping-upload-parser.ts tests/unit/shipping-upload-parser.test.ts \
        tests/fixtures/build-shipping-fixtures.cjs tests/fixtures/shipping-*.xlsx
git commit -m "feat(parser): 새 배송대행 엑셀 파서 + 단위 테스트 + 픽스처"
```

---

### Task 3: 고객 업로드 server action (request_shipping_upload)

**Files:**
- Create: `lib/actions/shipping-upload.ts`

> Phase 1 노트에 따라 request 는 RPC 가 아닌 server action 책임으로 둔다(파일 업로드 + 파싱 + INSERT 묶음).

- [ ] **Step 1: server action 작성**

```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { parseShippingExcel, computeShippingFee } from '@/lib/shipping-upload-parser';
import { revalidatePath } from 'next/cache';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTS = ['.xlsx'];
const OOXML_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type RequestShippingUploadResult =
  | { ok: true; uploadId: string }
  | { ok: false; error: string };

export async function requestShippingUploadAction(
  fd: FormData,
): Promise<RequestShippingUploadResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '파일을 선택해주세요.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: '파일 크기는 5MB 이하여야 합니다.' };
  }
  if (!ALLOWED_EXTS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
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

  // 관리코드(=products.name) 매칭 — 매칭 안 되는 코드가 있으면 미리 거부
  const codes = Array.from(new Set(parsed.items.map((it) => it.product_code)));
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .in('name', codes);
  const known = new Set((products ?? []).map((p) => p.name));
  const unknown = codes.filter((c) => !known.has(c));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `존재하지 않는 관리코드가 있습니다: ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? ' …' : ''}`,
    };
  }

  // Storage 업로드
  const safeName = file.name.replace(/[^\w가-힣\.\-]+/g, '_');
  const storagePath = `${u.user.id}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('order-uploads')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (upErr) return { ok: false, error: `파일 업로드 실패: ${upErr.message}` };

  const fee = computeShippingFee(parsed.items.length);

  const { data: row, error: insErr } = await (supabase.from('order_uploads') as any)
    .insert({
      user_id: u.user.id,
      storage_path: storagePath,
      original_name: file.name,
      contact_person: parsed.uploader_company,
      buyer_phone: parsed.uploader_phone,
      request_memo: parsed.request_memo,
      items: parsed.items,
      total_quantity: parsed.total_quantity,
      total_amount: 0, // 흐름 2 에선 의미 없음(배송비만 받음)
      shipping_fee_total: fee,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insErr) {
    await supabase.storage.from('order-uploads').remove([storagePath]);
    return { ok: false, error: `저장 실패: ${insErr.message}` };
  }

  revalidatePath('/shipping-uploads');
  revalidatePath('/admin/shipping-uploads');
  return { ok: true, uploadId: (row as { id: string }).id };
}

export async function cancelShippingUploadAction(
  uploadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('cancel_shipping_upload', { upload_id: uploadId });
  if (error) {
    if (error.message.startsWith('NOT_CANCELLABLE')) {
      return { ok: false, error: '취소할 수 없는 상태입니다.' };
    }
    if (error.message.startsWith('FORBIDDEN')) {
      return { ok: false, error: '권한이 없습니다.' };
    }
    console.error('[shipping-upload] cancel', { uploadId, error });
    return { ok: false, error: '취소 처리에 실패했습니다.' };
  }
  revalidatePath('/shipping-uploads');
  return { ok: true };
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add lib/actions/shipping-upload.ts
git commit -m "feat(actions): 고객 배송대행 업로드 + 취소 server action"
```

---

### Task 4: 고객 /shipping-uploads 메인 + 업로드 폼

**Files:**
- Create: `app/(user)/shipping-uploads/page.tsx`
- Create: `app/(user)/shipping-uploads/UploadForm.tsx`

- [ ] **Step 1: UploadForm (client) 작성**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { requestShippingUploadAction } from '@/lib/actions/shipping-upload';

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">배송대행 양식 업로드</h3>
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
            const r = await requestShippingUploadAction(fd);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            toast({ title: '검토 요청 완료', description: '관리자가 승인하면 발송이 시작됩니다.' });
            router.push(`/shipping-uploads/${r.uploadId}`);
            router.refresh();
          })
        }
      >
        {pending ? '업로드 중…' : '검토 요청'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 메인 페이지 작성**

`app/(user)/shipping-uploads/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { UploadForm } from './UploadForm';
import {
  type ShippingUploadStatus,
  SHIPPING_UPLOAD_STATUS_LABEL,
} from '@/lib/types';
import { Download, FileSpreadsheet, Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  original_name: string;
  status: string;
  total_quantity: number;
  shipping_fee_total: number;
  admin_memo: string | null;
  created_at: string;
};

export default async function ShippingUploadsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('order_uploads')
    .select('id, original_name, status, total_quantity, shipping_fee_total, admin_memo, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">배송대행 업로드</h1>
        <p className="text-sm text-muted-foreground mt-1">
          CJ 양식 엑셀로 받는사람 명단을 업로드하면, 보유 재고에서 차감되어 발송됩니다. 행 1건당 ₩3,300 배송비가 부과됩니다.
        </p>
      </header>

      <section className="rounded-lg border bg-surface-muted/40 p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-background grid place-items-center border shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">엑셀 양식 다운로드</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            "받는사람 / 연락처 / 주소 / 관리코드 / 수량" 을 행마다 입력해주세요.
          </p>
        </div>
        <a
          href="/shipping-template.xlsx"
          download
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border bg-background text-sm hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          양식 받기
        </a>
      </section>

      <UploadForm />

      <section className="space-y-3">
        <h2 className="font-heading font-semibold text-lg">최근 업로드</h2>
        {rows.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
            <div className="h-11 w-11 rounded-full bg-muted grid place-items-center">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm font-medium">업로드 내역이 없습니다</p>
          </div>
        ) : (
          <ul className="rounded-lg border bg-card divide-y">
            {rows.map((u) => (
              <li key={u.id} className="p-4 flex items-center gap-3">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <Link href={`/shipping-uploads/${u.id}`} className="text-sm font-medium hover:underline">
                    {u.original_name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(u.created_at).toLocaleString('ko-KR')}
                    {' · '}
                    <span className="font-medium">{SHIPPING_UPLOAD_STATUS_LABEL[u.status as ShippingUploadStatus] ?? u.status}</span>
                    {' · '}
                    {u.total_quantity}개 / 배송비 {formatKRW(Number(u.shipping_fee_total))}
                  </p>
                  {u.status === 'rejected' && u.admin_memo && (
                    <p className="text-xs text-destructive mt-1">반려 사유: {u.admin_memo}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: typecheck + 수동 확인**

Run: `pnpm typecheck && pnpm dev`. `/shipping-uploads` 접속해 양식 다운로드 → 작성 → 업로드 → 토스트 + 상세로 이동 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/\(user\)/shipping-uploads/
git commit -m "feat(shipping-uploads): 고객 메인·업로드 폼"
```

---

### Task 5: 고객 상세 화면 + 취소 버튼

**Files:**
- Create: `app/(user)/shipping-uploads/[id]/page.tsx`
- Create: `app/(user)/shipping-uploads/[id]/CancelButton.tsx`

- [ ] **Step 1: 취소 버튼 (client)**

`app/(user)/shipping-uploads/[id]/CancelButton.tsx`:

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cancelShippingUploadAction } from '@/lib/actions/shipping-upload';

export function CancelButton({ uploadId }: { uploadId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await cancelShippingUploadAction(uploadId);
          if (!r.ok) {
            toast({ title: '취소 실패', description: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: '취소되었습니다' });
          router.refresh();
        })
      }
    >
      {pending ? '취소 중…' : '취소'}
    </Button>
  );
}
```

- [ ] **Step 2: 상세 페이지**

`app/(user)/shipping-uploads/[id]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { CancelButton } from './CancelButton';
import { type ShippingUploadStatus, SHIPPING_UPLOAD_STATUS_LABEL } from '@/lib/types';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Item = {
  no: number;
  recipient: string;
  phone: string;
  address: string;
  product_code: string;
  product_name: string | null;
  quantity: number;
  memo: string | null;
  tracking_number: string | null;
};

type Upload = {
  id: string;
  original_name: string;
  status: string;
  items: Item[];
  total_quantity: number;
  shipping_fee_total: number;
  admin_memo: string | null;
  created_at: string;
};

export default async function ShippingUploadDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from('order_uploads')
    .select('id, original_name, status, items, total_quantity, shipping_fee_total, admin_memo, created_at')
    .eq('id', params.id)
    .single<Upload>();
  if (!data) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/shipping-uploads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        업로드 목록
      </Link>

      <header className="pb-4 border-b flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="font-heading font-semibold text-2xl tracking-tight break-all">
              {data.original_name}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(data.created_at).toLocaleString('ko-KR')} ·{' '}
              {SHIPPING_UPLOAD_STATUS_LABEL[data.status as ShippingUploadStatus] ?? data.status}
            </p>
          </div>
        </div>
        {data.status === 'pending' && <CancelButton uploadId={data.id} />}
      </header>

      <section className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="font-medium px-4 h-10">#</th>
              <th className="font-medium px-3">받는사람</th>
              <th className="font-medium px-3">상품 (코드 / 옵션)</th>
              <th className="font-medium px-3 text-right">수량</th>
              <th className="font-medium px-3 text-right">배송비</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.no} className="border-t">
                <td className="px-4 py-2 font-mono tabular text-xs">{it.no}</td>
                <td className="px-3 py-2">
                  {it.recipient}
                  <p className="text-xs text-muted-foreground">{it.phone} · {it.address}</p>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs">{it.product_code}</span>
                  {it.product_name && <span className="text-muted-foreground"> / {it.product_name}</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{it.quantity}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatKRW(3300)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-surface-muted/40">
              <td colSpan={3} className="px-4 py-3 text-right font-medium">
                {data.items.length}건 (수량 {data.total_quantity}개) — 배송비 합계
              </td>
              <td></td>
              <td className="px-3 py-3 text-right font-mono tabular text-base font-semibold">
                {formatKRW(Number(data.shipping_fee_total))}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {data.status === 'rejected' && data.admin_memo && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
          <strong>반려 사유:</strong> {data.admin_memo}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: typecheck + 수동 확인**

Run: `pnpm typecheck && pnpm dev`.

- [ ] **Step 4: 커밋**

```bash
git add app/\(user\)/shipping-uploads/\[id\]/
git commit -m "feat(shipping-uploads): 고객 상세 + 취소 버튼"
```

---

### Task 6: 관리자 /admin/shipping-uploads 메인

**Files:**
- Create: `app/(admin)/admin/shipping-uploads/page.tsx`

- [ ] **Step 1: 페이지 작성** — 기존 `/admin/order-uploads/page.tsx` 패턴을 그대로 따라가되, 새 컬럼(`shipping_fee_total`, 새 status 라벨) 사용:

```tsx
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  type ShippingUploadStatus,
  SHIPPING_UPLOAD_STATUS_LABEL,
} from '@/lib/types';
import { ChevronRight, Inbox, FileSpreadsheet } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TABS: { key: string; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '검토대기' },
  { key: 'approved', label: '승인' },
  { key: 'shipped', label: '발송중' },
  { key: 'completed', label: '완료' },
  { key: 'rejected', label: '반려' },
  { key: 'cancelled', label: '취소' },
];

type Row = {
  id: string;
  user_id: string;
  original_name: string;
  status: string;
  total_quantity: number;
  shipping_fee_total: number;
  created_at: string;
  profiles: { name: string } | null;
};

export default async function AdminShippingUploadsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();
  const status = searchParams.status ?? 'all';

  let q = supabase
    .from('order_uploads')
    .select(
      'id, user_id, original_name, status, total_quantity, shipping_fee_total, created_at, profiles!order_uploads_user_id_fkey(name)',
    )
    .order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  const { data: counts } = await supabase.from('order_uploads').select('status');
  const c = ((counts ?? []) as { status: string }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      acc.all = (acc.all ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading font-semibold text-2xl tracking-tight">배송대행 업로드</h1>
        <p className="text-sm text-muted-foreground mt-1">
          전체 {c.all ?? 0}건 · 검토대기 {c.pending ?? 0}건
        </p>
      </header>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map((t) => {
              const active = status === t.key;
              return (
                <Link
                  key={t.key}
                  href={`/admin/shipping-uploads${t.key === 'all' ? '' : `?status=${t.key}`}`}
                  className={cn(
                    'flex items-center gap-2 px-4 h-11 text-sm border-b-2 whitespace-nowrap',
                    active
                      ? 'border-primary text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span>{t.label}</span>
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] bg-muted">
                    {c[t.key] ?? 0}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3 text-center">
            <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-sm">업로드가 없습니다</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="font-medium px-4 h-10">파일</th>
                <th className="font-medium px-3">고객</th>
                <th className="font-medium px-3 text-right">행 수 / 수량</th>
                <th className="font-medium px-3 text-right">배송비</th>
                <th className="font-medium px-3">상태</th>
                <th className="font-medium px-3">업로드</th>
                <th className="px-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t h-11 hover:bg-surface-muted/60">
                  <td className="px-4">
                    <Link
                      href={`/admin/shipping-uploads/${u.id}`}
                      className="inline-flex items-center gap-1.5 text-accent hover:underline"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                      <span className="truncate max-w-[200px]">{u.original_name}</span>
                    </Link>
                  </td>
                  <td className="px-3">{u.profiles?.name ?? '—'}</td>
                  <td className="px-3 text-right font-mono tabular">{u.total_quantity}</td>
                  <td className="px-3 text-right font-mono tabular">{formatKRW(Number(u.shipping_fee_total))}</td>
                  <td className="px-3">
                    {SHIPPING_UPLOAD_STATUS_LABEL[u.status as ShippingUploadStatus] ?? u.status}
                  </td>
                  <td className="px-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(u.created_at).toLocaleString('ko-KR')}
                  </td>
                  <td className="px-3 text-right">
                    <Link href={`/admin/shipping-uploads/${u.id}`} aria-label="상세">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(admin\)/admin/shipping-uploads/page.tsx
git commit -m "feat(admin): 배송대행 업로드 목록"
```

---

### Task 7: 관리자 상세 + 승인/반려 액션 + 원본 다운로드

**Files:**
- Create: `app/(admin)/admin/shipping-uploads/[id]/page.tsx`
- Create: `app/(admin)/admin/shipping-uploads/[id]/ReviewActions.tsx`
- Create: `app/(admin)/admin/shipping-uploads/[id]/DownloadButton.tsx`

- [ ] **Step 1: ReviewActions (client)**

`app/(admin)/admin/shipping-uploads/[id]/ReviewActions.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  approveShippingUploadAction,
  rejectShippingUploadAction,
} from '@/lib/actions/admin-shipping-uploads';

export function ReviewActions({ uploadId }: { uploadId: string }) {
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h3 className="font-medium">검토 처리</h3>
      <Textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="반려 시 사유를 입력해주세요"
        rows={3}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          disabled={pending}
          className="flex-1"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await approveShippingUploadAction(uploadId);
              if (!r.ok) return setError(r.error ?? '승인 실패');
              toast({ title: '승인 완료', description: '보유 재고와 배송비가 차감되었습니다.' });
              router.refresh();
            })
          }
        >
          승인 (재고/배송비 차감)
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          className="flex-1"
          onClick={() =>
            start(async () => {
              setError(null);
              if (!memo.trim()) return setError('반려 사유를 입력해주세요.');
              const r = await rejectShippingUploadAction(uploadId, memo.trim());
              if (!r.ok) return setError(r.error ?? '반려 실패');
              toast({ title: '반려되었습니다' });
              router.refresh();
            })
          }
        >
          반려
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: DownloadButton (client)**

`app/(admin)/admin/shipping-uploads/[id]/DownloadButton.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getOrderUploadDownloadUrl } from '@/lib/actions/admin-order-uploads';

export function DownloadButton({
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
        const r = await getOrderUploadDownloadUrl(storagePath, originalName);
        setBusy(false);
        if (r.ok) window.location.href = r.url;
        else alert(r.error);
      }}
    >
      <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
      원본 다운로드
    </Button>
  );
}
```

> 기존 `getOrderUploadDownloadUrl` server action 을 그대로 재사용. 같은 storage 버킷을 쓰므로 안전.

- [ ] **Step 3: 상세 페이지**

`app/(admin)/admin/shipping-uploads/[id]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import {
  type ShippingUploadStatus,
  SHIPPING_UPLOAD_STATUS_LABEL,
} from '@/lib/types';
import { ArrowLeft, FileSpreadsheet, User } from 'lucide-react';
import { ReviewActions } from './ReviewActions';
import { DownloadButton } from './DownloadButton';

export const dynamic = 'force-dynamic';

type Item = {
  no: number;
  recipient: string;
  phone: string;
  address: string;
  product_code: string;
  product_name: string | null;
  quantity: number;
  memo: string | null;
  tracking_number: string | null;
};

type Upload = {
  id: string;
  user_id: string;
  storage_path: string;
  original_name: string;
  status: string;
  items: Item[];
  total_quantity: number;
  shipping_fee_total: number;
  admin_memo: string | null;
  created_at: string;
  profiles: { name: string; email: string; phone: string; deposit_balance: number } | null;
};

export default async function AdminShippingUploadDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from('order_uploads')
    .select('*, profiles!order_uploads_user_id_fkey(name,email,phone,deposit_balance)')
    .eq('id', params.id)
    .single<Upload>();
  if (!data) notFound();

  const balance = Number(data.profiles?.deposit_balance ?? 0);
  const insufficient = data.status === 'pending' && balance < Number(data.shipping_fee_total);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link
        href="/admin/shipping-uploads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        업로드 목록
      </Link>

      <header className="pb-4 border-b flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="font-heading font-semibold text-2xl tracking-tight break-all">{data.original_name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {SHIPPING_UPLOAD_STATUS_LABEL[data.status as ShippingUploadStatus] ?? data.status}
              {' · '} {new Date(data.created_at).toLocaleString('ko-KR')}
            </p>
          </div>
        </div>
        <DownloadButton storagePath={data.storage_path} originalName={data.original_name} />
      </header>

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-medium">고객</h2>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">이름</dt><dd>{data.profiles?.name ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">이메일</dt><dd className="font-mono">{data.profiles?.email ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">연락처</dt><dd className="font-mono">{data.profiles?.phone ?? '—'}</dd></div>
          <div>
            <dt className="text-xs text-muted-foreground">예치금</dt>
            <dd className={`font-mono ${insufficient ? 'text-destructive font-medium' : ''}`}>{formatKRW(balance)}</dd>
          </div>
        </dl>
      </div>

      <section className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="font-medium px-4 h-10">#</th>
              <th className="font-medium px-3">받는사람</th>
              <th className="font-medium px-3">상품 (코드 / 옵션)</th>
              <th className="font-medium px-3 text-right">수량</th>
              <th className="font-medium px-3 text-right">배송비</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.no} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{it.no}</td>
                <td className="px-3 py-2">
                  {it.recipient}
                  <p className="text-xs text-muted-foreground">{it.phone} · {it.address}</p>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs">{it.product_code}</span>
                  {it.product_name && <span className="text-muted-foreground"> / {it.product_name}</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{it.quantity}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatKRW(3300)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-surface-muted/40">
              <td colSpan={3} className="px-4 py-3 text-right font-medium">
                {data.items.length}건 · 배송비 합계
              </td>
              <td></td>
              <td className="px-3 py-3 text-right font-mono tabular text-base font-semibold">
                {formatKRW(Number(data.shipping_fee_total))}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {data.status === 'rejected' && data.admin_memo && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
          <strong>반려 사유:</strong> {data.admin_memo}
        </div>
      )}

      {data.status === 'pending' && (
        <>
          {insufficient && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              가용 예치금이 배송비보다 부족합니다. 승인 시 차감 단계에서 실패할 수 있습니다.
            </div>
          )}
          <ReviewActions uploadId={data.id} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: typecheck + 수동 확인**

Run: `pnpm typecheck && pnpm dev`. 관리자 흐름 전체 검증:
1. 사용자: `/shipping-uploads` 에서 새 양식 업로드
2. 관리자: `/admin/shipping-uploads` 에서 새 행 확인 → 상세 → 원본 다운로드 동작
3. 관리자: 승인 → `user_inventory.quantity` 감소, `inventory_movements` 음수 행, `profiles.deposit_balance` 감소 확인
4. 다른 업로드: 보유 재고 부족 케이스 → "보유 재고 부족" 에러 메시지

- [ ] **Step 5: 커밋**

```bash
git add app/\(admin\)/admin/shipping-uploads/\[id\]/
git commit -m "feat(admin): 배송대행 상세 + 승인/반려 + 원본 다운로드"
```

---

### Task 8: navigation 라벨 변경 + 기존 경로 redirect

**Files:**
- Modify: `components/UserNav.tsx` (또는 `app/(user)/layout.tsx`)
- Modify: `components/AdminNav.tsx` (또는 `app/(admin)/admin/layout.tsx`)
- Create: `app/(user)/orders/upload/page.tsx` — redirect 화면 (기존 파일 덮어쓰기)
- Create: `app/(admin)/admin/order-uploads/page.tsx` — redirect (덮어쓰기)
- Create: `app/(admin)/admin/order-uploads/[id]/page.tsx` — redirect (덮어쓰기)

- [ ] **Step 1: 사용자 nav 라벨 변경**

`주문서 업로드` 항목의 `href` 와 라벨을 변경:

```diff
- <NavLink href="/orders/upload">주문서 업로드</NavLink>
+ <NavLink href="/shipping-uploads">배송대행 업로드</NavLink>
```

- [ ] **Step 2: 관리자 nav 라벨 변경**

```diff
- <NavLink href="/admin/order-uploads">주문서 업로드</NavLink>
+ <NavLink href="/admin/shipping-uploads">배송대행 업로드</NavLink>
```

- [ ] **Step 3: 기존 경로 redirect 처리**

`app/(user)/orders/upload/page.tsx` (전체 덮어쓰기):

```tsx
import { redirect } from 'next/navigation';

export default function LegacyOrderUploadRedirect() {
  redirect('/shipping-uploads');
}
```

`app/(admin)/admin/order-uploads/page.tsx` (덮어쓰기):

```tsx
import { redirect } from 'next/navigation';
export default function LegacyAdminOrderUploadsRedirect() {
  redirect('/admin/shipping-uploads');
}
```

`app/(admin)/admin/order-uploads/[id]/page.tsx` (덮어쓰기):

```tsx
import { redirect } from 'next/navigation';
export default function LegacyAdminOrderUploadDetailRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/admin/shipping-uploads/${params.id}`);
}
```

- [ ] **Step 4: typecheck + 수동 확인**

Run: `pnpm typecheck && pnpm dev`. 기존 URL 들이 모두 새 경로로 redirect 되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add components/UserNav.tsx components/AdminNav.tsx \
        app/\(user\)/orders/upload/ app/\(admin\)/admin/order-uploads/
git commit -m "feat(nav): 배송대행 업로드 라벨 통일 + 기존 경로 redirect"
```

---

### Task 9: 전체 회귀 검증

- [ ] **Step 1: typecheck / test / lint / build**

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```
Expected: 모두 PASS — 새 파서·UI 테스트 추가 후 기존 테스트도 통과해야 함.

- [ ] **Step 2: smoke 시나리오**

1. 사용자: `/shipping-uploads` → 양식 다운로드 → 작성 → 업로드 → 상세 화면에서 행별 + 합계 확인
2. 관리자: `/admin/shipping-uploads` → 검토대기 항목 → 원본 다운로드 → 승인
3. Supabase Studio: `user_inventory` 차감, `inventory_movements` 음수 행, `profiles.deposit_balance` 차감 확인
4. 사용자: `/inventory` 에서 가용/예약 변화 확인 (검토대기 → 승인 후 reserved 0)
5. 다른 업로드: 보유 재고 부족 → 승인 차단

Phase 4 완료. Phase 5 (송장 재업로드 + 행별 송장 표시 + 상태 전환)으로 진행.
