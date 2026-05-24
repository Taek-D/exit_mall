# Hancell XLSX Upload Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every user-facing `.xlsx` upload path accept Hancell-saved workbooks whose document property XML breaks `exceljs@4.4.0`.

**Architecture:** Add one shared workbook loader in `lib/files/excel.ts`. The loader first uses normal ExcelJS loading, then retries once with only `docProps/app.xml` and `docProps/core.xml` replaced by standards-compatible XML. Existing upload parsers keep their validation logic and catch blocks, but delegate workbook loading to the shared loader.

**Tech Stack:** Next.js 14, TypeScript, ExcelJS 4.4.0, JSZip, Vitest.

---

## File Structure

- Modify `package.json` and `pnpm-lock.yaml`: add `jszip` as a direct runtime dependency.
- Modify `lib/files/excel.ts`: add `loadExcelWorkbookFromBuffer`, private buffer conversion, and private document-property sanitizer helpers.
- Modify `lib/shipping-upload-parser.ts`: replace direct `workbook.xlsx.load(...)` with `loadExcelWorkbookFromBuffer`.
- Modify `lib/purchased-shipping.ts`: replace direct `workbook.xlsx.load(...)` with `loadExcelWorkbookFromBuffer`.
- Modify `lib/product-import-parser.ts`: replace direct `workbook.xlsx.load(...)` with `loadExcelWorkbookFromBuffer` while preserving media extraction.
- Modify `lib/order-upload-parser.ts`: replace direct `workbook.xlsx.load(...)` with `loadExcelWorkbookFromBuffer`.
- Modify `tests/unit/excel-upload.test.ts`: add loader tests for normal workbooks, Hancell-style `ep:Properties`, and corrupt files.
- Modify `tests/unit/shipping-upload-parser.test.ts`: add parser-level test proving a Hancell-style workbook parses after sanitization.
- Modify `tests/unit/product-import-parser.test.ts`: add image preservation test using a Hancell-style workbook.

---

### Task 1: Add JSZip As A Direct Dependency

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add dependency**

Run:

```powershell
pnpm add jszip
```

Expected: `package.json` includes `jszip` under `dependencies`, and `pnpm-lock.yaml` updates. Keep the installed version selected by pnpm.

- [ ] **Step 2: Verify dependency is visible**

Run:

```powershell
pnpm list jszip --depth 0
```

Expected: output includes a top-level `jszip` entry.

- [ ] **Step 3: Commit dependency change**

Run:

```powershell
git add package.json pnpm-lock.yaml
git commit -m "chore: add jszip for xlsx sanitization"
```

Expected: commit succeeds with only dependency files staged.

---

### Task 2: Write Failing Workbook Loader Tests

**Files:**
- Modify: `tests/unit/excel-upload.test.ts`

- [ ] **Step 1: Add imports**

At the top of `tests/unit/excel-upload.test.ts`, change the imports to:

```ts
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  fileToBuffer,
  loadExcelWorkbookFromBuffer,
  safeStorageName,
  validateExcelUpload,
} from '@/lib/files/excel';
```

- [ ] **Step 2: Add workbook fixture helpers**

After the existing `file(...)` helper, add:

```ts
async function basicWorkbookBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['name', 'quantity']);
  ws.addRow(['sample', 3]);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function hancellAppPropertiesXml(sheetName = 'Sheet1'): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    '<ep:Properties',
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    ' xmlns:ep="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
    ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    '<ep:Application>Cell</ep:Application>',
    `<ep:TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${sheetName}</vt:lpstr></vt:vector></ep:TitlesOfParts>`,
    '<ep:TotalTime>6</ep:TotalTime>',
    '<ep:AppVersion>12.0300</ep:AppVersion>',
    '</ep:Properties>',
  ].join('');
}

async function withHancellAppProperties(
  buffer: Buffer,
  sheetName = 'Sheet1',
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  zip.file('docProps/app.xml', hancellAppPropertiesXml(sheetName));
  const rewritten = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(rewritten);
}
```

- [ ] **Step 3: Add loader tests**

Before `describe('validateExcelUpload', ...)`, add:

```ts
describe('loadExcelWorkbookFromBuffer', () => {
  it('loads normal ExcelJS workbooks without sanitization', async () => {
    const workbook = await loadExcelWorkbookFromBuffer(await basicWorkbookBuffer());

    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0]!.getCell('A2').value).toBe('sample');
    expect(workbook.worksheets[0]!.getCell('B2').value).toBe(3);
  });

  it('loads Hancell-style app properties that raw exceljs rejects', async () => {
    const hancellBuffer = await withHancellAppProperties(await basicWorkbookBuffer());
    const rawWorkbook = new ExcelJS.Workbook();

    await expect(rawWorkbook.xlsx.load(hancellBuffer as any)).rejects.toThrow(/company/);

    const workbook = await loadExcelWorkbookFromBuffer(hancellBuffer);

    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0]!.name).toBe('Sheet1');
    expect(workbook.worksheets[0]!.getCell('A2').value).toBe('sample');
    expect(workbook.worksheets[0]!.getCell('B2').value).toBe(3);
  });

  it('rejects corrupt buffers after the sanitized retry fails', async () => {
    await expect(loadExcelWorkbookFromBuffer(Buffer.from('not a zip'))).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```powershell
pnpm vitest run tests/unit/excel-upload.test.ts
```

Expected: FAIL because `loadExcelWorkbookFromBuffer` is not exported from `@/lib/files/excel`.

- [ ] **Step 5: Commit failing tests**

Run:

```powershell
git add tests/unit/excel-upload.test.ts
git commit -m "test: cover Hancell xlsx workbook loading"
```

Expected: commit succeeds with only the test file staged.

---

### Task 3: Implement Shared Workbook Loader

**Files:**
- Modify: `lib/files/excel.ts`

- [ ] **Step 1: Add imports**

At the top of `lib/files/excel.ts`, before constants, add:

```ts
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
```

- [ ] **Step 2: Add helper functions and loader**

After `fileToBuffer(...)`, add:

```ts
type ExcelBufferInput = Buffer | ArrayBuffer | Uint8Array;

function toNodeBuffer(buffer: ExcelBufferInput): Buffer {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof ArrayBuffer) return Buffer.from(new Uint8Array(buffer));
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function sanitizedAppPropertiesXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
    ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    '<Application>Microsoft Excel</Application>',
    '<DocSecurity>0</DocSecurity>',
    '<ScaleCrop>false</ScaleCrop>',
    '<Company></Company>',
    '<LinksUpToDate>false</LinksUpToDate>',
    '<SharedDoc>false</SharedDoc>',
    '<HyperlinksChanged>false</HyperlinksChanged>',
    '<AppVersion>16.0300</AppVersion>',
    '</Properties>',
  ].join('');
}

function sanitizedCorePropertiesXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<cp:coreProperties',
    ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"',
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"',
    ' xmlns:dcterms="http://purl.org/dc/terms/"',
    ' xmlns:dcmitype="http://purl.org/dc/dcmitype/"',
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '<dc:creator></dc:creator>',
    '<cp:lastModifiedBy></cp:lastModifiedBy>',
    '<cp:revision>1</cp:revision>',
    '<dcterms:created xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:created>',
    '<dcterms:modified xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:modified>',
    '</cp:coreProperties>',
  ].join('');
}

async function sanitizeDocumentProperties(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  zip.file('docProps/app.xml', sanitizedAppPropertiesXml());
  zip.file('docProps/core.xml', sanitizedCorePropertiesXml());
  const sanitized = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(sanitized);
}

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

export async function loadExcelWorkbookFromBuffer(
  buffer: ExcelBufferInput,
): Promise<ExcelJS.Workbook> {
  const nodeBuffer = toNodeBuffer(buffer);

  try {
    return await loadWorkbook(nodeBuffer);
  } catch (error) {
    try {
      return await loadWorkbook(await sanitizeDocumentProperties(nodeBuffer));
    } catch {
      throw error;
    }
  }
}
```

- [ ] **Step 3: Run loader tests**

Run:

```powershell
pnpm vitest run tests/unit/excel-upload.test.ts
```

Expected: PASS. The raw ExcelJS assertion still rejects with `company`, while `loadExcelWorkbookFromBuffer` loads the workbook.

- [ ] **Step 4: Run typecheck for the new imports**

Run:

```powershell
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit loader implementation**

Run:

```powershell
git add lib/files/excel.ts tests/unit/excel-upload.test.ts
git commit -m "feat: add Hancell-safe xlsx loader"
```

Expected: commit succeeds with loader implementation and now-passing loader tests.

---

### Task 4: Route All Upload Parsers Through The Shared Loader

**Files:**
- Modify: `lib/shipping-upload-parser.ts`
- Modify: `lib/purchased-shipping.ts`
- Modify: `lib/product-import-parser.ts`
- Modify: `lib/order-upload-parser.ts`

- [ ] **Step 1: Update parser imports**

Add this import to each parser file:

```ts
import { loadExcelWorkbookFromBuffer } from '@/lib/files/excel';
```

Keep existing `ExcelJS` imports where the file still uses ExcelJS types such as `ExcelJS.Workbook`, `ExcelJS.Worksheet`, or `ExcelJS.CellValue`.

- [ ] **Step 2: Update shipping parser load block**

In `lib/shipping-upload-parser.ts`, replace the opening part of the workbook load block:

```ts
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(toNodeBuffer(buffer) as any);
  } catch {
```

with:

```ts
  let wb: ExcelJS.Workbook;
  try {
    wb = await loadExcelWorkbookFromBuffer(buffer);
  } catch {
```

Leave the existing `throw new Error(...)` line inside the catch block unchanged. Remove the local `toNodeBuffer(...)` helper if `rg -n "toNodeBuffer" lib/shipping-upload-parser.ts` shows no remaining usages.

- [ ] **Step 3: Update inbound parser load block**

In `lib/purchased-shipping.ts`, replace the opening part of the workbook load block:

```ts
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(toNodeBuffer(buffer) as any);
  } catch {
```

with:

```ts
  let wb: ExcelJS.Workbook;
  try {
    wb = await loadExcelWorkbookFromBuffer(buffer);
  } catch {
```

Leave the existing `throw new Error(...)` line inside the catch block unchanged. Remove the local `toNodeBuffer(...)` helper if `rg -n "toNodeBuffer" lib/purchased-shipping.ts` shows no remaining usages.

- [ ] **Step 4: Update product import parser load block**

In `lib/product-import-parser.ts`, replace the opening part of the workbook load block:

```ts
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(toNodeBuffer(buffer) as any);
  } catch {
```

with:

```ts
  let workbook: ExcelJS.Workbook;
  try {
    workbook = await loadExcelWorkbookFromBuffer(buffer);
  } catch {
```

Leave the existing `throw new Error(...)` line inside the catch block unchanged. Keep the local `toNodeBuffer(...)` helper because `collectRowImages(...)` uses it to normalize media buffers.

- [ ] **Step 5: Update legacy order parser load block**

In `lib/order-upload-parser.ts`, replace the opening part of the workbook load block:

```ts
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(toNodeBuffer(buffer) as any);
  } catch {
```

with:

```ts
  let wb: ExcelJS.Workbook;
  try {
    wb = await loadExcelWorkbookFromBuffer(buffer);
  } catch {
```

Leave the existing `throw new Error(...)` line inside the catch block unchanged. Remove the local `toNodeBuffer(...)` helper if `rg -n "toNodeBuffer" lib/order-upload-parser.ts` shows no remaining usages.

- [ ] **Step 6: Verify no upload parser still directly loads workbooks**

Run:

```powershell
rg -n "xlsx\\.load\\(|new ExcelJS\\.Workbook\\(" lib
```

Expected: no user-upload parser calls remain. `app/(admin)/admin/orders/export/route.ts` may still create a workbook because it writes exports rather than reading user-uploaded files.

- [ ] **Step 7: Run parser-related tests**

Run:

```powershell
pnpm vitest run tests/unit/shipping-upload-parser.test.ts tests/unit/purchased-shipping.test.ts tests/unit/product-import-parser.test.ts tests/unit/order-upload-parser.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit parser integration**

Run:

```powershell
git add lib/shipping-upload-parser.ts lib/purchased-shipping.ts lib/product-import-parser.ts lib/order-upload-parser.ts
git commit -m "feat: use Hancell-safe loader for xlsx uploads"
```

Expected: commit succeeds with only parser files staged.

---

### Task 5: Add Parser-Level Hancell Compatibility Tests

**Files:**
- Modify: `tests/unit/shipping-upload-parser.test.ts`
- Modify: `tests/unit/product-import-parser.test.ts`

- [ ] **Step 1: Add JSZip import to shipping parser test**

At the top of `tests/unit/shipping-upload-parser.test.ts`, add:

```ts
import JSZip from 'jszip';
```

- [ ] **Step 2: Add Hancell helper to shipping parser test**

After `workbookBufferFromFirstRow(...)`, add:

```ts
function hancellAppPropertiesXml(sheetName = 'Sheet1'): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    '<ep:Properties',
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    ' xmlns:ep="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
    ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    '<ep:Application>Cell</ep:Application>',
    `<ep:TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${sheetName}</vt:lpstr></vt:vector></ep:TitlesOfParts>`,
    '<ep:TotalTime>6</ep:TotalTime>',
    '<ep:AppVersion>12.0300</ep:AppVersion>',
    '</ep:Properties>',
  ].join('');
}

async function withHancellAppProperties(
  buffer: Buffer,
  sheetName = 'Sheet1',
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  zip.file('docProps/app.xml', hancellAppPropertiesXml(sheetName));
  const rewritten = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(rewritten);
}
```

- [ ] **Step 3: Add shipping parser compatibility test**

Inside `describe('parseShippingExcel - valid', ...)`, add:

```ts
  it('parses Hancell-saved workbooks whose document properties break raw exceljs', async () => {
    const buffer = await withHancellAppProperties(load('shipping-valid.xlsx'));

    const parsed = await parseShippingExcel(buffer);

    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toMatchObject({
      phone: '010-1234-5678',
      quantity: 1,
    });
  });
```

- [ ] **Step 4: Add JSZip import to product import parser test**

At the top of `tests/unit/product-import-parser.test.ts`, add:

```ts
import JSZip from 'jszip';
```

- [ ] **Step 5: Add Hancell helper to product import parser test**

After `workbookBuffer(...)`, add:

```ts
function hancellAppPropertiesXml(sheetName = 'ProductImport'): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    '<ep:Properties',
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    ' xmlns:ep="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
    ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    '<ep:Application>Cell</ep:Application>',
    `<ep:TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${sheetName}</vt:lpstr></vt:vector></ep:TitlesOfParts>`,
    '<ep:TotalTime>6</ep:TotalTime>',
    '<ep:AppVersion>12.0300</ep:AppVersion>',
    '</ep:Properties>',
  ].join('');
}

async function withHancellAppProperties(
  buffer: Buffer,
  sheetName = 'ProductImport',
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  zip.file('docProps/app.xml', hancellAppPropertiesXml(sheetName));
  const rewritten = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(rewritten);
}
```

- [ ] **Step 6: Add product image preservation test**

Inside `describe('parseProductImportExcel', ...)`, add:

```ts
  it('preserves row images when loading Hancell-style document properties', async () => {
    const parsed = await parseProductImportExcel(
      await withHancellAppProperties(
        await workbookBuffer({
          rows: [['', 'Brand', 'Product', 'Option', 1000, 'PRD-1', 'Category', 'BAR-1', '']],
          images: [{ rowNumber: 2, width: 32, height: 24 }],
        }),
      ),
    );

    expect(parsed.rows[0]!.hasImage).toBe(true);
    expect(parsed.rows[0]!.image?.buffer.length).toBeGreaterThan(0);
    expect(parsed.rows[0]!.image?.width).toBe(32);
    expect(parsed.rows[0]!.image?.height).toBe(24);
  });
```

- [ ] **Step 7: Run parser compatibility tests**

Run:

```powershell
pnpm vitest run tests/unit/shipping-upload-parser.test.ts tests/unit/product-import-parser.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit parser compatibility tests**

Run:

```powershell
git add tests/unit/shipping-upload-parser.test.ts tests/unit/product-import-parser.test.ts
git commit -m "test: cover Hancell xlsx upload parsers"
```

Expected: commit succeeds with only parser test files staged.

---

### Task 6: Final Verification

**Files:**
- No code edits expected.

- [ ] **Step 1: Run targeted upload tests**

Run:

```powershell
pnpm vitest run tests/unit/excel-upload.test.ts tests/unit/shipping-upload-parser.test.ts tests/unit/purchased-shipping.test.ts tests/unit/product-import-parser.test.ts tests/unit/order-upload-parser.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full unit test suite**

Run:

```powershell
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Verify workbook load call sites**

Run:

```powershell
rg -n "xlsx\\.load\\(" lib
```

Expected: no user-upload parser calls remain. If a non-upload export helper appears, confirm it is not reading user-uploaded `.xlsx` files.

- [ ] **Step 5: Review changed files**

Run:

```powershell
git status --short
git log --oneline -5
```

Expected: working tree contains only intended changes, and recent commits include dependency, loader, parser integration, and tests.
