# 배송대행 양식·메뉴 분리 등 4건 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 20260512.txt 요청 4건 — CJ 양식 적용 + 송장 지수표기 방지, 배송대행 메뉴를 엑시트몰/사입재고로 분리, 잔액부족 임계치 기본값 100,000원 상향, 관리자 사용자 상세 주문이력에 stock_orders + order_uploads + legacy 통합 표시.

**Architecture:** 4개 독립 Phase. 각 Phase는 단독으로 빌드/테스트 통과 가능. Phase A·D는 단위 테스트 우선, Phase B는 라우트 이동 + 사이드 네비 갱신 + revalidatePaths/Link 일괄 수정, Phase C는 DB 마이그레이션 한 건.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Supabase (Postgres, RLS, RPC) · exceljs · vitest · pnpm

---

## File Structure

**Phase A — CJ 양식·송장 텍스트화**
- Modify: `lib/shipping-upload-parser.ts` — HEADER_KEYS에 신규 alias, `cellTrackingNumber` 헬퍼 추가
- Modify: `tests/unit/shipping-upload-parser.test.ts` — 신규 헤더·송장 number 케이스 테스트 추가
- Create: `tests/fixtures/shipping-cj-headers.xlsx` — 신규 헤더 픽스처 (테스트 내 `workbookBuffer` 헬퍼 사용으로 대체 가능 — 본 plan은 헬퍼 사용)
- Create: `scripts/prepare-shipping-template.ts` — 양식 파일 가공 일회성 스크립트 (송장번호 컬럼 numFmt='@' 적용)
- Modify: `public/shipping-template.xlsx` — 스크립트 결과로 교체
- Modify: `app/(user)/shipping-uploads/page.tsx` — 안내 카피 (Phase B 이동 전에 같은 파일에서 1회 수정)

**Phase B — 메뉴 분리**
- Create: `components/ComingSoon.tsx` — 준비중 공통 컴포넌트
- Move: `app/(user)/shipping-uploads/page.tsx` → `app/(user)/shipping-uploads/exitmall/page.tsx`
- Move: `app/(user)/shipping-uploads/UploadForm.tsx` → `app/(user)/shipping-uploads/exitmall/UploadForm.tsx`
- Move: `app/(user)/shipping-uploads/[id]/page.tsx` → `app/(user)/shipping-uploads/exitmall/[id]/page.tsx`
- Create: `app/(user)/shipping-uploads/page.tsx` (redirect)
- Create: `app/(user)/shipping-uploads/purchased/page.tsx` (준비중)
- Move: `app/(admin)/admin/shipping-uploads/page.tsx` → `app/(admin)/admin/shipping-uploads/exitmall/page.tsx`
- Move: `app/(admin)/admin/shipping-uploads/[id]/*` → `app/(admin)/admin/shipping-uploads/exitmall/[id]/*` (page.tsx, ReviewActions.tsx, CompleteButton.tsx, AttachTrackingForm.tsx, DownloadButton.tsx 등 동거 컴포넌트 함께)
- Create: `app/(admin)/admin/shipping-uploads/page.tsx` (redirect)
- Create: `app/(admin)/admin/shipping-uploads/purchased/page.tsx` (준비중)
- Modify: `components/NavUser.tsx` — NAV 두 항목으로 분리
- Modify: `components/AdminSidebar.tsx` — NAV 두 항목으로 분리
- Modify: `lib/actions/shipping-upload.ts` — revalidatePaths 갱신
- Modify: `lib/actions/admin-shipping-uploads.ts` — revalidatePaths 갱신
- Modify: `lib/actions/admin-attach-tracking.ts` — revalidatePaths 갱신
- Modify: `app/(user)/shipping-uploads/exitmall/UploadForm.tsx` — `router.push` 경로 갱신
- Modify: `app/(user)/orders/upload/page.tsx` — legacy redirect 경로 갱신
- Modify: 이동된 파일들 내부의 `<Link href="/shipping-uploads...">` / `<Link href="/admin/shipping-uploads...">` 사용처 일괄 갱신

**Phase C — 임계치 기본값**
- Create: `supabase/migrations/20260512000001_low_balance_threshold_default_100k.sql`

**Phase D — 주문이력 통합**
- Modify: `lib/admin/user-detail.ts` — 통합 row 타입 + 매퍼/머지 함수 + `fetchAdminUserDetail` 확장
- Create: `tests/unit/admin-user-detail.test.ts` — 매퍼/머지 단위 테스트
- Modify: `app/(admin)/admin/users/[id]/page.tsx` — 주문 이력 탭 UI 갱신 (5열 테이블, kind별 badge 분기)

---

## Phase A — CJ 양식 적용 + 송장번호 텍스트화

### Task A1: 파서 헤더 alias 확장 (실패 테스트 먼저)

**Files:**
- Modify: `tests/unit/shipping-upload-parser.test.ts` — 신규 헤더 케이스 추가
- Modify: `lib/shipping-upload-parser.ts` — HEADER_KEYS / normalizeHeader 갱신

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/unit/shipping-upload-parser.test.ts`의 `describe('parseShippingExcel - valid', …)` 블록 안에 새 `it` 추가:

```ts
it('accepts new CJ-style headers (받는분성명, 받는분주소(전체, 분할), 품목명, 내품명, 내품수량, 배송메세지1)', async () => {
  const r = await parseShippingExcel(
    await workbookBuffer(
      [
        'No',
        '받는분성명',
        '받는분전화번호',
        '받는분주소(전체, 분할)',
        '품목명',
        '내품명',
        '내품수량',
        '배송메세지1',
        '송장번호',
      ],
      [[1, '홍길동', '010-1234-5678', '서울시 강남구 1', '스니커즈', '270', 2, '문 앞', '']],
    ),
  );

  expect(r.items[0]).toMatchObject({
    no: 1,
    recipient: '홍길동',
    phone: '010-1234-5678',
    address: '서울시 강남구 1',
    product_code: '스니커즈',
    product_name: '270',
    quantity: 2,
    memo: '문 앞',
    tracking_number: null,
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test tests/unit/shipping-upload-parser.test.ts`
Expected: FAIL with "양식 헤더가 다릅니다 (2열: ..." 또는 유사한 메시지

- [ ] **Step 3: HEADER_KEYS에 alias 추가 + normalizeHeader 보강**

`lib/shipping-upload-parser.ts` 수정:

```ts
const HEADER_KEYS = [
  ['no'],
  ['받는사람', '받는분성명'],
  ['연락처', '받는분전화번호'],
  ['주소', '받는분주소(전체,분할)', '받는분주소'],
  ['상품명', '품목명', '관리코드'],
  ['옵션', '내품명', '상품명/옵션'],
  ['수량', '내품수량'],
  ['메모', '배송메세지1'],
  ['송장번호'],
];

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .replace(/\*+$/g, '');
}
```

(괄호 strip 추가: `받는분주소(전체, 분할)` → `받는분주소전체,분할` 매칭. 비교 시점에서도 `expected.map(normalizeHeader)` 동작해 alias `'받는분주소(전체,분할)'`도 동일 정규화 결과를 가짐.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test tests/unit/shipping-upload-parser.test.ts`
Expected: PASS (전부 통과)

- [ ] **Step 5: 커밋**

```bash
git add lib/shipping-upload-parser.ts tests/unit/shipping-upload-parser.test.ts
git commit -m "feat(shipping): accept CJ-style header aliases in upload parser"
```

---

### Task A2: 송장번호 number→string 안전망

**Files:**
- Modify: `tests/unit/shipping-upload-parser.test.ts` — 송장번호 number 셀 테스트
- Modify: `lib/shipping-upload-parser.ts` — `cellTrackingNumber` 헬퍼 + 호출부 교체

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/unit/shipping-upload-parser.test.ts`의 valid describe 블록에:

```ts
it('preserves numeric tracking numbers as integer strings (no scientific notation)', async () => {
  // CJ 송장번호는 10~12자리 — 셀이 number로 들어와도 정수 문자열로 보존되어야 함
  const r = await parseShippingExcel(
    await workbookBuffer(
      ['No', '받는사람', '연락처', '주소', '상품명', '옵션', '수량', '메모', '송장번호'],
      [[1, '홍길동', '010-1234-5678', '서울시 1', '스니커즈', '270', 1, '', 521853092894]],
    ),
  );
  expect(r.items[0]?.tracking_number).toBe('521853092894');
});
```

- [ ] **Step 2: 현재 동작 확인**

Run: `pnpm test tests/unit/shipping-upload-parser.test.ts`
Expected: PASS 또는 FAIL. 521853092894는 `Number.MAX_SAFE_INTEGER` 이하라 JS의 기본 `String(n)`이 지수표기 없이 `"521853092894"`를 반환하므로 PASS 가능성이 높음. 그러나:
1. ExcelJS가 셀을 number가 아닌 formula 결과 객체로 감싸 반환하는 케이스
2. `Number.MAX_SAFE_INTEGER`(2^53-1)를 넘는 송장번호가 입력되는 미래 케이스
3. 명시적 `Math.trunc`로 소수점 노이즈 제거 보장
세 가지 사유로 안전망 헬퍼는 반드시 추가하고 호출 경로를 분리한다. 본 테스트는 헬퍼 도입 후에도 통과를 보장하는 회귀 테스트로 남는다.

- [ ] **Step 3: `cellTrackingNumber` 헬퍼 추가 + 호출 교체**

`lib/shipping-upload-parser.ts`에 `cellInt` 아래에 추가:

```ts
function cellTrackingNumber(value: unknown): string | null {
  const raw = rawCellValue(value as ExcelJS.CellValue);
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.trunc(raw).toString();
  }
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}
```

`parseShippingExcel` 안의 송장 셀 파싱 라인 교체:

```ts
// before
const tracking_number = cellString(cells[8]);
// after
const tracking_number = cellTrackingNumber(cells[8]);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test tests/unit/shipping-upload-parser.test.ts`
Expected: PASS (모든 케이스 통과)

- [ ] **Step 5: 커밋**

```bash
git add lib/shipping-upload-parser.ts tests/unit/shipping-upload-parser.test.ts
git commit -m "fix(shipping): preserve numeric tracking numbers as integer strings"
```

---

### Task A3: 새 양식 파일 가공·배포

**Files:**
- Create: `scripts/prepare-shipping-template.ts`
- Modify: `public/shipping-template.xlsx` (스크립트 결과)

- [ ] **Step 1: 가공 스크립트 작성**

`scripts/prepare-shipping-template.ts`:

```ts
// 첨부된 CJ 양식의 송장번호 컬럼(I열) 셀 서식을 '@'(텍스트)로 강제 설정한 뒤
// public/shipping-template.xlsx 로 저장한다.
// 일회성 스크립트 — `pnpm tsx scripts/prepare-shipping-template.ts` 로 실행.
import ExcelJS from 'exceljs';
import * as path from 'node:path';
import * as fs from 'node:fs';

const SOURCE = path.resolve(process.cwd(), '배송대행 업로드 엑셀양식.xlsx');
const TARGET = path.resolve(process.cwd(), 'public/shipping-template.xlsx');
const HEADER_ROW = 8;
const TRACKING_COL = 9;
const TEXT_FMT = '@';
const ROWS_TO_FORMAT = 1000; // 헤더 아래 충분한 행 수에 텍스트 서식 적용

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`source not found: ${SOURCE}`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('no worksheet');

  // 헤더 행 검증
  const header = String(ws.getRow(HEADER_ROW).getCell(TRACKING_COL).value ?? '').trim();
  if (header !== '송장번호') {
    throw new Error(`unexpected header at row ${HEADER_ROW} col ${TRACKING_COL}: ${header}`);
  }

  // 헤더 행 + 데이터 영역에 텍스트 서식 적용
  for (let r = HEADER_ROW; r <= HEADER_ROW + ROWS_TO_FORMAT; r += 1) {
    ws.getRow(r).getCell(TRACKING_COL).numFmt = TEXT_FMT;
  }
  // 컬럼 기본 서식도 텍스트로 (Excel에서 신규 행 입력 시에도 적용되도록)
  const col = ws.getColumn(TRACKING_COL);
  col.numFmt = TEXT_FMT;

  await wb.xlsx.writeFile(TARGET);
  console.log(`wrote ${TARGET}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 스크립트 실행**

`tsx`가 devDependencies에 없을 수 있음 — 먼저 확인:

Run: `pnpm list tsx 2>&1 | head -5`

설치되어 있지 않다면:

Run: `pnpm add -D tsx`

스크립트 실행:

Run: `pnpm tsx scripts/prepare-shipping-template.ts`
Expected: `wrote .../public/shipping-template.xlsx`

- [ ] **Step 3: 결과 검증 (numFmt 확인)**

검증용 일회성 인라인 실행:

Run:
```bash
node -e "const e=require('exceljs');const wb=new e.Workbook();wb.xlsx.readFile('public/shipping-template.xlsx').then(()=>{const ws=wb.worksheets[0];for(let r=8;r<=12;r++)console.log('r'+r+' col9 numFmt='+JSON.stringify(ws.getRow(r).getCell(9).numFmt));});"
```
Expected: `numFmt="@"` 가 r8~r12 모두 출력됨.

- [ ] **Step 4: 커밋**

```bash
git add scripts/prepare-shipping-template.ts public/shipping-template.xlsx package.json pnpm-lock.yaml
git commit -m "feat(shipping): replace template with CJ format and tracking text format"
```

(첨부 원본 `배송대행 업로드 엑셀양식.xlsx`는 untracked로 두거나 `.gitignore`에 추가 — 본 plan에서는 그대로 untracked 유지.)

---

### Task A4: 사용자 페이지 안내 카피 갱신

**Files:**
- Modify: `app/(user)/shipping-uploads/page.tsx` (Phase B 이동 전 1회 수정)

- [ ] **Step 1: 카피 변경**

`app/(user)/shipping-uploads/page.tsx:33` 한 줄 교체:

```tsx
// before
&quot;받는사람 / 연락처 / 주소 / 상품명 / 수량&quot; 을 행마다 입력해주세요.
// after
&quot;받는사람 / 연락처 / 주소 / 품목명 / 내품명(=옵션) / 수량&quot; 을 행마다 입력해주세요.
```

- [ ] **Step 2: 타입체크·린트 통과 확인**

Run: `pnpm typecheck`
Run: `pnpm lint`
Expected: 모두 통과

- [ ] **Step 3: 커밋**

```bash
git add app/(user)/shipping-uploads/page.tsx
git commit -m "docs(shipping): update upload form copy for new CJ column names"
```

---

## Phase B — 메뉴 분리 (방안 B)

### Task B1: `<ComingSoon>` 공통 컴포넌트

**Files:**
- Create: `components/ComingSoon.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`components/ComingSoon.tsx`:

```tsx
import { Construction } from 'lucide-react';

type ComingSoonProps = {
  title: string;
  description?: string;
};

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center">
      <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
        <Construction className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-heading font-semibold text-lg">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      )}
      <p className="text-xs text-muted-foreground mt-2">현재 준비 중입니다.</p>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 3: 커밋**

```bash
git add components/ComingSoon.tsx
git commit -m "feat(ui): add ComingSoon component for placeholder pages"
```

---

### Task B2: 사용자 라우트 이동 (page + [id] + UploadForm)

**Files:**
- Move: `app/(user)/shipping-uploads/page.tsx` → `app/(user)/shipping-uploads/exitmall/page.tsx`
- Move: `app/(user)/shipping-uploads/UploadForm.tsx` → `app/(user)/shipping-uploads/exitmall/UploadForm.tsx`
- Move: `app/(user)/shipping-uploads/[id]/page.tsx` → `app/(user)/shipping-uploads/exitmall/[id]/page.tsx`

- [ ] **Step 1: 디렉토리 생성 + 파일 이동 (git mv)**

```bash
mkdir -p "app/(user)/shipping-uploads/exitmall"
git mv "app/(user)/shipping-uploads/page.tsx" "app/(user)/shipping-uploads/exitmall/page.tsx"
git mv "app/(user)/shipping-uploads/UploadForm.tsx" "app/(user)/shipping-uploads/exitmall/UploadForm.tsx"
git mv "app/(user)/shipping-uploads/[id]" "app/(user)/shipping-uploads/exitmall/[id]"
```

- [ ] **Step 2: UploadForm 내부 router.push 경로 갱신**

`app/(user)/shipping-uploads/exitmall/UploadForm.tsx`에서:

```ts
// before
router.push(`/shipping-uploads/${r.uploadId}`);
// after
router.push(`/shipping-uploads/exitmall/${r.uploadId}`);
```

- [ ] **Step 3: 이동된 page.tsx에서 헤더 카피 갱신**

`app/(user)/shipping-uploads/exitmall/page.tsx`:

```tsx
// before
<h1 className="font-heading font-semibold text-2xl tracking-tight">배송대행 업로드</h1>
// after
<h1 className="font-heading font-semibold text-2xl tracking-tight">엑시트몰 배송대행</h1>
```

그리고 `<Link href={\`/shipping-uploads/${u.id}\`}>` 부분을 `\`/shipping-uploads/exitmall/${u.id}\``로 갱신.

- [ ] **Step 4: 이동된 [id]/page.tsx 내부 링크 갱신**

`app/(user)/shipping-uploads/exitmall/[id]/page.tsx`에서 `<Link href="/shipping-uploads">` 또는 유사한 백링크가 있다면 `/shipping-uploads/exitmall`로 갱신.

검색: `grep -n "/shipping-uploads" app/(user)/shipping-uploads/exitmall/[id]/page.tsx` 실행 결과를 보고 모든 발견 위치 갱신.

- [ ] **Step 5: 타입체크·테스트 통과 확인**

Run: `pnpm typecheck`
Run: `pnpm test`
Expected: 모두 통과

- [ ] **Step 6: 커밋**

```bash
git add -A "app/(user)/shipping-uploads"
git commit -m "refactor(shipping): move user routes under /shipping-uploads/exitmall"
```

---

### Task B3: 사용자 redirect + 준비중 페이지

**Files:**
- Create: `app/(user)/shipping-uploads/page.tsx` (redirect)
- Create: `app/(user)/shipping-uploads/purchased/page.tsx` (준비중)

- [ ] **Step 1: redirect 페이지 작성**

`app/(user)/shipping-uploads/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function ShippingUploadsIndex() {
  redirect('/shipping-uploads/exitmall');
}
```

- [ ] **Step 2: 준비중 페이지 작성**

`app/(user)/shipping-uploads/purchased/page.tsx`:

```tsx
import { ComingSoon } from '@/components/ComingSoon';

export default function PurchasedShippingPage() {
  return (
    <div className="space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">사입재고 배송대행</h1>
        <p className="text-sm text-muted-foreground mt-1">
          외부에서 매입한 사입재고를 발송 의뢰하는 메뉴입니다.
        </p>
      </header>
      <ComingSoon
        title="사입재고 배송대행"
        description="사입재고 등록·발송 흐름을 준비하고 있습니다. 오픈 시점에 다시 안내드립니다."
      />
    </div>
  );
}
```

- [ ] **Step 3: 빌드/타입체크 통과 확인**

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 4: 커밋**

```bash
git add "app/(user)/shipping-uploads/page.tsx" "app/(user)/shipping-uploads/purchased/page.tsx"
git commit -m "feat(shipping): add user redirect + purchased coming-soon page"
```

---

### Task B4: 관리자 라우트 이동

**Files:**
- Move: `app/(admin)/admin/shipping-uploads/page.tsx` → `app/(admin)/admin/shipping-uploads/exitmall/page.tsx`
- Move: `app/(admin)/admin/shipping-uploads/[id]/` → `app/(admin)/admin/shipping-uploads/exitmall/[id]/`

- [ ] **Step 1: git mv로 이동**

```bash
mkdir -p "app/(admin)/admin/shipping-uploads/exitmall"
git mv "app/(admin)/admin/shipping-uploads/page.tsx" "app/(admin)/admin/shipping-uploads/exitmall/page.tsx"
git mv "app/(admin)/admin/shipping-uploads/[id]" "app/(admin)/admin/shipping-uploads/exitmall/[id]"
```

- [ ] **Step 2: 이동된 page.tsx 내부 링크 일괄 갱신**

`app/(admin)/admin/shipping-uploads/exitmall/page.tsx`에서:

- `href="/admin/shipping-uploads"` → `href="/admin/shipping-uploads/exitmall"`
- `href={\`/admin/shipping-uploads${t.key === 'all' ? '' : \`?status=${t.key}\`}\`}` → 경로 prefix를 `/admin/shipping-uploads/exitmall`로 변경
- `href={\`/admin/shipping-uploads/${u.id}\`}` → `\`/admin/shipping-uploads/exitmall/${u.id}\``

헤더 카피도 변경:

```tsx
<h1 className="font-heading font-semibold text-2xl tracking-tight">엑시트몰 배송대행</h1>
```

- [ ] **Step 3: 이동된 [id]/page.tsx 백링크 갱신**

`app/(admin)/admin/shipping-uploads/exitmall/[id]/page.tsx`에서 `href="/admin/shipping-uploads"` → `href="/admin/shipping-uploads/exitmall"`.

- [ ] **Step 4: 타입체크 통과 확인**

Run: `pnpm typecheck`
Expected: 통과 (revalidatePaths 호출은 string이라 타입 오류 없음 — B7에서 갱신)

- [ ] **Step 5: 커밋**

```bash
git add -A "app/(admin)/admin/shipping-uploads"
git commit -m "refactor(shipping): move admin routes under /admin/shipping-uploads/exitmall"
```

---

### Task B5: 관리자 redirect + 준비중 페이지

**Files:**
- Create: `app/(admin)/admin/shipping-uploads/page.tsx` (redirect)
- Create: `app/(admin)/admin/shipping-uploads/purchased/page.tsx` (준비중)

- [ ] **Step 1: redirect 페이지**

`app/(admin)/admin/shipping-uploads/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function AdminShippingUploadsIndex() {
  redirect('/admin/shipping-uploads/exitmall');
}
```

- [ ] **Step 2: 준비중 페이지**

`app/(admin)/admin/shipping-uploads/purchased/page.tsx`:

```tsx
import { ComingSoon } from '@/components/ComingSoon';

export default function AdminPurchasedShippingPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading font-semibold text-2xl tracking-tight">사입재고 배송대행</h1>
        <p className="text-sm text-muted-foreground mt-1">
          외부 매입 재고 발송 의뢰 흐름. 현재 준비 중입니다.
        </p>
      </header>
      <ComingSoon
        title="사입재고 배송대행"
        description="사입재고 등록·검토 흐름이 준비되면 이 메뉴에서 관리할 수 있습니다."
      />
    </div>
  );
}
```

- [ ] **Step 3: 타입체크 통과**

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 4: 커밋**

```bash
git add "app/(admin)/admin/shipping-uploads/page.tsx" "app/(admin)/admin/shipping-uploads/purchased/page.tsx"
git commit -m "feat(shipping): add admin redirect + purchased coming-soon page"
```

---

### Task B6: 사이드 네비게이션 갱신 (사용자 + 관리자)

**Files:**
- Modify: `components/NavUser.tsx`
- Modify: `components/AdminSidebar.tsx`

- [ ] **Step 1: NavUser.tsx 갱신**

기존 `{ href: '/shipping-uploads', label: '배송대행 업로드', Icon: Upload },` 한 줄을 두 줄로 분리:

```ts
{ href: '/shipping-uploads/exitmall', label: '엑시트몰 배송대행', Icon: Upload },
{ href: '/shipping-uploads/purchased', label: '사입재고 배송대행', Icon: Upload },
```

(필요 시 두 번째 항목용으로 `Boxes` 또는 다른 아이콘 사용 — 디자인 차별화 원하면 import 추가. 본 plan은 같은 아이콘 사용으로 단순화.)

- [ ] **Step 2: AdminSidebar.tsx 갱신**

기존 `{ href: '/admin/shipping-uploads', label: '배송대행 업로드', Icon: FileSpreadsheet },` 한 줄을 두 줄로:

```ts
{ href: '/admin/shipping-uploads/exitmall', label: '엑시트몰 배송대행', Icon: FileSpreadsheet },
{ href: '/admin/shipping-uploads/purchased', label: '사입재고 배송대행', Icon: FileSpreadsheet },
```

- [ ] **Step 3: 활성 강조 동작 확인 — 코드 변경 불필요**

기존 active 로직은 `pathname === href || pathname.startsWith(href + '/')`. 두 항목의 href가 정확히 `/exitmall`/`/purchased`로 끝나므로 서로 prefix가 아님 → 둘 중 하나만 active. OK.

- [ ] **Step 4: 타입체크 통과**

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add components/NavUser.tsx components/AdminSidebar.tsx
git commit -m "feat(nav): split shipping upload menu into exitmall/purchased entries"
```

---

### Task B7: `revalidatePaths` 호출 일괄 갱신

**Files:**
- Modify: `lib/actions/shipping-upload.ts`
- Modify: `lib/actions/admin-shipping-uploads.ts`
- Modify: `lib/actions/admin-attach-tracking.ts`

- [ ] **Step 1: 사용자 측 server action 갱신**

`lib/actions/shipping-upload.ts:116`:

```ts
// before
revalidatePaths(['/shipping-uploads', '/admin/shipping-uploads']);
// after
revalidatePaths([
  '/shipping-uploads',
  '/shipping-uploads/exitmall',
  '/admin/shipping-uploads',
  '/admin/shipping-uploads/exitmall',
]);
```

`/shipping-uploads/exitmall`도 추가하고, 옛 경로도 보존(redirect 페이지가 캐시되는 경우 대비).

`cancelShippingUploadAction` 안의 `revalidatePaths(['/shipping-uploads'])`도 동일하게 확장.

- [ ] **Step 2: 관리자 server action 갱신**

`lib/actions/admin-shipping-uploads.ts`의 세 군데 (`approve`, `reject`, `complete`) 모두:

```ts
revalidatePaths([
  '/admin/shipping-uploads',
  '/admin/shipping-uploads/exitmall',
  '/shipping-uploads',
  '/shipping-uploads/exitmall',
]);
```

- [ ] **Step 3: 송장 첨부 server action 갱신**

`lib/actions/admin-attach-tracking.ts:86-91`:

```ts
revalidatePaths([
  `/admin/shipping-uploads/exitmall/${uploadId}`,
  `/admin/shipping-uploads/${uploadId}`,
  `/shipping-uploads/exitmall/${uploadId}`,
  `/shipping-uploads/${uploadId}`,
  '/admin/shipping-uploads',
  '/admin/shipping-uploads/exitmall',
  '/shipping-uploads',
  '/shipping-uploads/exitmall',
]);
```

- [ ] **Step 4: 타입체크·테스트 통과**

Run: `pnpm typecheck`
Run: `pnpm test`
Expected: 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add lib/actions/shipping-upload.ts lib/actions/admin-shipping-uploads.ts lib/actions/admin-attach-tracking.ts
git commit -m "fix(shipping): include new /exitmall paths in revalidatePaths"
```

---

### Task B8: legacy redirect 경로 갱신

**Files:**
- Modify: `app/(user)/orders/upload/page.tsx`

- [ ] **Step 1: redirect 대상 변경**

`app/(user)/orders/upload/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function LegacyOrderUploadRedirect() {
  redirect('/shipping-uploads/exitmall');
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 통과 (빌드 시 모든 라우트 검증)

빌드 중 에러 발견 시 (예: 발견하지 못한 `<Link href="/shipping-uploads/...">` 사용처 또는 `router.push` 사용처):

```bash
# 누락 검색
grep -rn "/shipping-uploads" --include="*.tsx" --include="*.ts" app components lib | grep -v "/shipping-uploads/exitmall" | grep -v "/shipping-uploads/purchased"
```
발견된 모든 위치를 적절한 경로로 갱신 후 다시 build.

- [ ] **Step 3: 커밋**

```bash
git add "app/(user)/orders/upload/page.tsx"
git commit -m "fix(orders): point legacy upload redirect to exitmall route"
```

---

### Task B9: README/Operations 문서 링크 갱신 (선택, 정합성)

**Files:**
- Modify: `README.md` 및 `docs/operations/2026-05-08-shipping-flow-deployment.md` 등에서 `/shipping-uploads` 또는 `/admin/shipping-uploads` 링크 참조가 있다면 갱신

- [ ] **Step 1: 검색**

Run:
```bash
grep -n "shipping-uploads" README.md docs/operations/*.md
```

발견된 링크가 단순 redirect 페이지를 통해 동작하므로 즉시 필수는 아니지만, 정합성을 위해 `/exitmall` 명시 권장.

- [ ] **Step 2: 갱신 (필요 시)**

링크가 `/shipping-uploads` 또는 `/admin/shipping-uploads`라면 `/shipping-uploads/exitmall`, `/admin/shipping-uploads/exitmall`로 변경.

- [ ] **Step 3: 커밋 (변경된 경우)**

```bash
git add README.md docs/operations/
git commit -m "docs: update shipping upload paths to /exitmall"
```

---

## Phase C — 잔액부족 임계치 기본값 100,000원

### Task C1: 마이그레이션 작성·적용

**Files:**
- Create: `supabase/migrations/20260512000001_low_balance_threshold_default_100k.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/20260512000001_low_balance_threshold_default_100k.sql`:

```sql
-- 잔액부족 임계치 기본값을 100,000원으로 상향.
-- 신규 가입자: profiles 컬럼 default 가 자동 적용된다 (handle_new_user 가 컬럼을 명시하지 않음).
-- 기존 사용자: 정확히 이전 default 값(10,000) 이었던 행만 100,000 으로 갱신.
--             관리자가 의도적으로 다른 값으로 지정한 행은 보존한다.

alter table public.profiles
  alter column low_balance_threshold set default 100000;

update public.profiles
   set low_balance_threshold = 100000
 where low_balance_threshold = 10000;
```

- [ ] **Step 2: 로컬 마이그레이션 적용 (가능한 경우)**

로컬 Supabase 스택이 실행 중이라면:

Run: `pnpm exec supabase db reset` 또는 `pnpm exec supabase migration up`
Expected: 마이그레이션 적용 성공

로컬 스택이 없다면 step 3로 진행 (배포 시점에 적용).

- [ ] **Step 3: 검증 SQL (옵션)**

로컬에서 적용했다면:

```sql
-- default 확인
select column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'low_balance_threshold';
-- 기대: 100000

-- 기존 행 확인
select count(*) from public.profiles where low_balance_threshold = 10000;
-- 기대: 0 (전부 100000으로 올라갔어야 함, 단 다른 값이었던 행은 보존)
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260512000001_low_balance_threshold_default_100k.sql
git commit -m "feat(db): raise low_balance_threshold default to 100000"
```

---

## Phase D — 관리자 사용자 상세 주문이력 통합

### Task D1: 통합 row 타입 + 매퍼/머지 함수 (테스트 우선)

**Files:**
- Create: `tests/unit/admin-user-detail.test.ts`
- Modify: `lib/admin/user-detail.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/admin-user-detail.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  mergeUserOrders,
  type AdminUserStockOrderInput,
  type AdminUserShippingUploadInput,
  type AdminUserLegacyOrderInput,
} from '@/lib/admin/user-detail';

describe('mergeUserOrders', () => {
  it('merges three sources sorted by created_at desc', () => {
    const stock: AdminUserStockOrderInput[] = [
      {
        id: 's1',
        total_amount: 30000,
        status: 'pending',
        items: [{ product_name: '샴푸', qty: 2, subtotal: 30000 }],
        created_at: '2026-05-10T10:00:00Z',
      },
    ];
    const shipping: AdminUserShippingUploadInput[] = [
      {
        id: 'u1',
        original_name: 'orders.xlsx',
        total_quantity: 5,
        shipping_fee_total: 16500,
        status: 'pending',
        created_at: '2026-05-11T09:00:00Z',
      },
    ];
    const legacy: AdminUserLegacyOrderInput[] = [
      {
        id: 'l1',
        total_amount: 50000,
        status: 'placed',
        created_at: '2026-05-09T08:00:00Z',
      },
    ];

    const merged = mergeUserOrders({ stock, shipping, legacy });
    expect(merged).toHaveLength(3);
    expect(merged[0]).toMatchObject({ kind: 'shipping_upload', id: 'u1', amount: 16500 });
    expect(merged[1]).toMatchObject({ kind: 'stock_order', id: 's1', amount: 30000 });
    expect(merged[2]).toMatchObject({ kind: 'legacy', id: 'l1', amount: 50000 });
  });

  it('summarizes stock order items', () => {
    const merged = mergeUserOrders({
      stock: [
        {
          id: 's1',
          total_amount: 1000,
          status: 'approved',
          items: [
            { product_name: '샴푸', qty: 2, subtotal: 600 },
            { product_name: '비누', qty: 1, subtotal: 400 },
          ],
          created_at: '2026-05-10T10:00:00Z',
        },
      ],
      shipping: [],
      legacy: [],
    });
    expect(merged[0]?.summary).toBe('샴푸 외 1건');
  });

  it('uses original_name as summary for shipping uploads', () => {
    const merged = mergeUserOrders({
      stock: [],
      shipping: [
        {
          id: 'u1',
          original_name: 'orders.xlsx',
          total_quantity: 3,
          shipping_fee_total: 9900,
          status: 'pending',
          created_at: '2026-05-11T09:00:00Z',
        },
      ],
      legacy: [],
    });
    expect(merged[0]?.summary).toBe('orders.xlsx · 3개');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test tests/unit/admin-user-detail.test.ts`
Expected: FAIL — `mergeUserOrders` not exported

- [ ] **Step 3: `lib/admin/user-detail.ts`에 타입과 머지 함수 추가**

기존 파일 상단(import 아래)에 추가:

```ts
export type AdminUserStockOrderInput = {
  id: string;
  total_amount: number;
  status: string;
  items: Array<{ product_name: string; qty: number; subtotal: number }>;
  created_at: string;
};

export type AdminUserShippingUploadInput = {
  id: string;
  original_name: string;
  total_quantity: number;
  shipping_fee_total: number;
  status: string;
  created_at: string;
};

export type AdminUserLegacyOrderInput = {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
};

export type AdminUserUnifiedOrder = {
  id: string;
  kind: 'stock_order' | 'shipping_upload' | 'legacy';
  status: string;
  amount: number;
  summary: string;
  created_at: string;
};

function summarizeStockItems(items: AdminUserStockOrderInput['items']): string {
  if (items.length === 0) return '(빈 주문)';
  if (items.length === 1) return `${items[0]!.product_name} × ${items[0]!.qty}`;
  return `${items[0]!.product_name} 외 ${items.length - 1}건`;
}

export function mergeUserOrders(input: {
  stock: AdminUserStockOrderInput[];
  shipping: AdminUserShippingUploadInput[];
  legacy: AdminUserLegacyOrderInput[];
}): AdminUserUnifiedOrder[] {
  const stock = input.stock.map<AdminUserUnifiedOrder>((o) => ({
    id: o.id,
    kind: 'stock_order',
    status: o.status,
    amount: Number(o.total_amount),
    summary: summarizeStockItems(o.items),
    created_at: o.created_at,
  }));
  const shipping = input.shipping.map<AdminUserUnifiedOrder>((u) => ({
    id: u.id,
    kind: 'shipping_upload',
    status: u.status,
    amount: Number(u.shipping_fee_total),
    summary: `${u.original_name} · ${u.total_quantity}개`,
    created_at: u.created_at,
  }));
  const legacy = input.legacy.map<AdminUserUnifiedOrder>((o) => ({
    id: o.id,
    kind: 'legacy',
    status: o.status,
    amount: Number(o.total_amount),
    summary: `주문번호 ${o.id.slice(0, 8)}`,
    created_at: o.created_at,
  }));
  return [...stock, ...shipping, ...legacy].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
}
```

기존 `AdminUserOrder`/`calculateTotalSpent`는 일단 보존(다른 곳에서 import 가능성). `calculateTotalSpent`는 기존 signature 그대로 두고 (`AdminUserOrder[]`를 받음) D2에서 stock_orders도 합치도록 시그니처 확장.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test tests/unit/admin-user-detail.test.ts`
Expected: PASS (3 케이스 통과)

- [ ] **Step 5: 커밋**

```bash
git add lib/admin/user-detail.ts tests/unit/admin-user-detail.test.ts
git commit -m "feat(admin): add unified order merge helper for user detail page"
```

---

### Task D2: `fetchAdminUserDetail` 확장 — 3개 소스 통합

**Files:**
- Modify: `lib/admin/user-detail.ts`

- [ ] **Step 1: 쿼리 추가 + return shape 변경**

`fetchAdminUserDetail` 함수를 다음으로 교체:

```ts
export type AdminUserDetail = {
  profile: AdminUserProfile;
  orders: AdminUserUnifiedOrder[];   // 통합 시간순
  deposits: AdminUserDeposit[];
  transactions: AdminUserBalanceTx[];
  inventory: AdminUserInventoryRow[];
  products: AdminUserProductOption[];
  totalSpent: number;
};

export async function fetchAdminUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const supabase = createClient();
  const [
    { data: profile },
    { data: stockOrders },
    { data: shippingUploads },
    { data: legacyOrders },
    { data: deposits },
    { data: transactions },
    { data: inventory },
    { data: products },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single<AdminUserProfile>(),
    supabase
      .from('stock_orders')
      .select('id, total_amount, status, items, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_uploads')
      .select('id, original_name, total_quantity, shipping_fee_total, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, total_amount, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('deposit_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('balance_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_inventory')
      .select('product_id, quantity, products(name)')
      .eq('user_id', userId)
      .gt('quantity', 0),
    supabase.from('products').select('id, name').eq('is_active', true).order('name'),
  ]);

  if (!profile) return null;

  const stockRows = (stockOrders ?? []) as unknown as AdminUserStockOrderInput[];
  const shippingRows = (shippingUploads ?? []) as unknown as AdminUserShippingUploadInput[];
  const legacyRows = (legacyOrders ?? []) as unknown as AdminUserLegacyOrderInput[];

  const merged = mergeUserOrders({
    stock: stockRows,
    shipping: shippingRows,
    legacy: legacyRows,
  });

  // totalSpent = stock_orders + legacy orders 중 cancelled 제외 (배송대행 비용은 별도)
  const totalSpent =
    stockRows
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + Number(o.total_amount), 0) +
    legacyRows
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + Number(o.total_amount), 0);

  return {
    profile,
    orders: merged,
    deposits: (deposits ?? []) as unknown as AdminUserDeposit[],
    transactions: (transactions ?? []) as unknown as AdminUserBalanceTx[],
    inventory: (inventory ?? []) as unknown as AdminUserInventoryRow[],
    products: (products ?? []) as unknown as AdminUserProductOption[],
    totalSpent,
  };
}
```

기존 `AdminUserOrder` 타입과 `calculateTotalSpent` 함수는 더 이상 내부에서 사용되지 않지만, 다른 곳에서 import 가능성을 위해 deprecation 주석 추가하거나 제거. 본 plan은 **제거**:

```ts
// 위의 export type AdminUserOrder 삭제
// 위의 export function calculateTotalSpent 삭제
```

`calculateTotalSpent` 또는 `AdminUserOrder`를 import하는 곳이 있는지 확인:

Run:
```bash
grep -rn "calculateTotalSpent\|AdminUserOrder" --include="*.ts" --include="*.tsx" .
```

본 파일과 테스트 외에 import가 있다면 그 사용처도 함께 갱신.

- [ ] **Step 2: 타입체크 통과 확인**

Run: `pnpm typecheck`
Expected: 통과 (`page.tsx`는 D3에서 갱신하지만, `orders` 필드 타입이 바뀌어 페이지 사용처에서 타입 에러 발생 가능. 그 경우 D3로 먼저 진행).

타입 에러가 발생한다면 페이지 사용처에서 임시로 `AdminUserUnifiedOrder` 사용 형태로 캐스팅하거나, D3로 통합 커밋 — 본 plan은 **D2와 D3를 묶어서 진행한 뒤 한 번에 커밋**.

- [ ] **Step 3: 커밋 (D3 이후 통합 커밋이 합리적이라면 지금 커밋하지 말고 D3 종료 후 한 번에)**

D3까지 진행 후 한 번에 커밋:

```bash
git add lib/admin/user-detail.ts app/(admin)/admin/users/[id]/page.tsx
git commit -m "feat(admin): merge stock orders + shipping uploads + legacy in user detail"
```

---

### Task D3: 주문 이력 탭 UI 갱신

**Files:**
- Modify: `app/(admin)/admin/users/[id]/page.tsx`

- [ ] **Step 1: import + 테이블 변경**

`app/(admin)/admin/users/[id]/page.tsx` 상단 import에 추가:

```tsx
import {
  StockOrderStatusBadge,
  ShippingUploadStatusBadge,
} from '@/components/StatusBadge'; // 기존 import 위치에 합치기
import type { StockOrderStatus, ShippingUploadStatus } from '@/lib/types';
```

기존 import에서 `OrderStatusBadge`는 유지. (StockOrderStatusBadge/ShippingUploadStatusBadge가 같은 파일에 정의되어 있는지 확인: `grep -n "StockOrderStatusBadge\|ShippingUploadStatusBadge" components/StatusBadge*`. 다른 파일이라면 해당 경로에서 import.)

기존 `TabsContent value="orders"` 블록(라인 120-137)을 다음으로 교체:

```tsx
<TabsContent value="orders" className="rounded-lg border bg-card overflow-hidden m-0">
  <HistoryTable
    headers={['종류', '식별', '금액', '상태', '시간']}
    rightAligned={[2]}
    rows={orders.map((row) => {
      const kindLabel =
        row.kind === 'stock_order'
          ? '엑시트몰 구매'
          : row.kind === 'shipping_upload'
            ? '배송대행'
            : 'Legacy';
      const statusBadge =
        row.kind === 'stock_order' ? (
          <StockOrderStatusBadge status={row.status as StockOrderStatus} />
        ) : row.kind === 'shipping_upload' ? (
          <ShippingUploadStatusBadge status={row.status as ShippingUploadStatus} />
        ) : (
          <OrderStatusBadge status={row.status as OrderStatus} />
        );
      const idHref =
        row.kind === 'shipping_upload'
          ? `/admin/shipping-uploads/exitmall/${row.id}`
          : row.kind === 'legacy'
            ? `/admin/orders-legacy/${row.id}`
            : `/admin/orders/${row.id}`;
      return [
        <span key="k" className="text-xs">
          {kindLabel}
        </span>,
        <Link key="id" href={idHref} className="text-xs text-accent hover:underline truncate inline-block max-w-[180px] align-middle">
          {row.summary}
        </Link>,
        <span key="a" className="font-mono tabular">
          {formatKRW(row.amount)}
        </span>,
        statusBadge,
        <span key="t" className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDateTimeKR(row.created_at)}
        </span>,
      ];
    })}
  />
</TabsContent>
```

빈 상태 메시지는 `HistoryTable` 컴포넌트가 자체적으로 처리 — 외부에서 조작 불가하면 그대로 둠. 별도 비어있음 카피 변경이 필요하다면 `HistoryTable`을 살펴 결정 (본 plan 범위 아님).

- [ ] **Step 2: TypeScript Reference 정리**

기존 본 페이지에서 `OrderStatus`만 import한다면 `StockOrderStatus`, `ShippingUploadStatus` 추가. `BalanceTxType`은 기존 그대로 사용.

`detail.orders`의 타입이 `AdminUserUnifiedOrder[]`로 바뀌었으므로 destructure 사용:

```tsx
const {
  profile: user,
  orders,
  deposits,
  transactions,
  inventory,
  products,
  totalSpent,
} = detail;
```

(이 destructure는 이미 존재 — `orders`의 새 형태 자동 적용됨.)

- [ ] **Step 3: 타입체크·빌드 통과**

Run: `pnpm typecheck`
Run: `pnpm test`
Expected: 모두 통과

- [ ] **Step 4: 커밋 (D2와 통합)**

```bash
git add lib/admin/user-detail.ts app/(admin)/admin/users/[id]/page.tsx
git commit -m "feat(admin): merge stock orders + shipping uploads + legacy in user detail"
```

---

## 최종 검증

### Task Z1: 전체 빌드·테스트·린트

- [ ] **Step 1: 전체 검증**

Run: `pnpm typecheck`
Run: `pnpm lint`
Run: `pnpm test`
Run: `pnpm build`

Expected: 모두 통과

- [ ] **Step 2: 수동 검증 체크리스트**

다음 항목을 로컬 dev 서버(`pnpm dev`)에서 확인:

1. `/shipping-uploads` 접속 → `/shipping-uploads/exitmall`로 redirect 되고 `엑시트몰 배송대행` 헤더 표시
2. 사이드 네비에 `엑시트몰 배송대행` / `사입재고 배송대행` 두 항목 표시
3. `사입재고 배송대행` 클릭 시 `<ComingSoon>` 카드 표시
4. 신규 양식(`public/shipping-template.xlsx`) 다운로드 → 송장번호 열에 12자리 정수 붙여넣기 → 엑셀이 지수표기로 바꾸지 않음 (셀 서식 텍스트 확인)
5. 신규 양식으로 업로드 성공 → 상세 페이지로 redirect (`/shipping-uploads/exitmall/<id>`)
6. 관리자 `/admin/shipping-uploads` → `/admin/shipping-uploads/exitmall`로 redirect
7. 관리자 `/admin/users/<id>` 주문 이력 탭에 stock_orders + 배송대행 + legacy 통합 표시 (해당 데이터가 있는 사용자로 검증)
8. 신규 가입자 등록 후 임계치가 100,000원으로 생성됨 (`/admin/users/<id>` 임계치 표시)
9. 기존 10,000 사용자가 마이그레이션 후 100,000으로 갱신됨

- [ ] **Step 3: 최종 커밋·푸시 (필요 시)**

별도 변경이 없다면 추가 커밋 없음. 누적 커밋 그래프 확인:

Run: `git log --oneline master..HEAD`
Expected: Phase A1~D3 + 마이그레이션 = 약 12~15개 커밋

---

## 참고

- 사용자가 `/admin/users/<id>`의 주문이력 탭에서 stock_orders 상세 페이지로 이동할 때 링크가 `/admin/orders/${id}`을 가리키도록 본 plan에 작성했습니다. 실제 stock_orders 상세 경로가 `/admin/orders/[id]`가 맞는지 [app/(admin)/admin/orders/[id]/page.tsx](app/%28admin%29/admin/orders/%5Bid%5D/page.tsx) 존재 여부로 확인 후 진행하세요. 다르다면 적절한 경로로 교체.
- `pnpm tsx`가 동작하지 않으면 `pnpm exec tsx` 또는 `node --loader tsx scripts/...`로 우회.
- 새 양식 파일을 PR에 포함할 때 GitHub에서 diff가 보이지 않는 binary 파일임을 PR 설명에 명시.
