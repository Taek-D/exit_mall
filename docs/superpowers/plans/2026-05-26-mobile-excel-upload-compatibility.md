# Mobile Excel Upload Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android and iOS file pickers allow users to select Excel upload files by removing narrow client-side Excel `accept` filters while keeping server-side `.xlsx` validation.

**Architecture:** Update only the file input layer for business Excel upload forms. Server actions and parser code already validate extension, file signature, and workbook readability, so they remain the source of truth. Image upload inputs keep their existing image `accept` filters.

**Tech Stack:** Next.js 14, React client components, TypeScript, Vitest.

---

## File Structure

- Modify `app/(user)/inbound-requests/new/NewRequestForm.tsx`: remove `accept=".xlsx"` from the required inbound Excel input.
- Modify `app/(user)/shipping-uploads/exitmall/UploadForm.tsx`: remove `accept=".xlsx"` from the exitmall shipping Excel input.
- Modify `app/(user)/shipping-uploads/purchased/UploadForm.tsx`: remove `accept=".xlsx"` from the purchased shipping Excel input.
- Modify `app/(user)/orders/upload/UploadForm.tsx`: remove the `ACCEPT` constant and the hidden file input's `accept={ACCEPT}` prop.
- Modify `app/(admin)/admin/shipping-uploads/exitmall/[id]/AttachTrackingForm.tsx`: remove `accept=".xlsx"` from the tracking re-upload Excel input.
- Modify `app/(admin)/admin/products/import/ImportUploadForm.tsx`: remove the product import file input's Excel `accept` prop.
- Do not modify server actions in `lib/actions/*`; their validation must remain unchanged.
- Do not modify image inputs such as inbound request images or product image upload.

---

### Task 1: Remove Excel Picker Filters

**Files:**
- Modify: `app/(user)/inbound-requests/new/NewRequestForm.tsx`
- Modify: `app/(user)/shipping-uploads/exitmall/UploadForm.tsx`
- Modify: `app/(user)/shipping-uploads/purchased/UploadForm.tsx`
- Modify: `app/(user)/orders/upload/UploadForm.tsx`
- Modify: `app/(admin)/admin/shipping-uploads/exitmall/[id]/AttachTrackingForm.tsx`
- Modify: `app/(admin)/admin/products/import/ImportUploadForm.tsx`

- [ ] **Step 1: Update inbound request Excel input**

In `app/(user)/inbound-requests/new/NewRequestForm.tsx`, change:

```tsx
        <input
          id="excel"
          name="excel"
          type="file"
          accept=".xlsx"
          className="block w-full text-sm border rounded-md p-2"
          required
        />
```

to:

```tsx
        <input
          id="excel"
          name="excel"
          type="file"
          className="block w-full text-sm border rounded-md p-2"
          required
        />
```

- [ ] **Step 2: Update exitmall shipping upload input**

In `app/(user)/shipping-uploads/exitmall/UploadForm.tsx`, change:

```tsx
      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm border rounded-md p-2"
      />
```

to:

```tsx
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm border rounded-md p-2"
      />
```

- [ ] **Step 3: Update purchased shipping upload input**

In `app/(user)/shipping-uploads/purchased/UploadForm.tsx`, change:

```tsx
      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm border rounded-md p-2"
      />
```

to:

```tsx
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm border rounded-md p-2"
      />
```

- [ ] **Step 4: Update legacy order upload input**

In `app/(user)/orders/upload/UploadForm.tsx`, remove this constant:

```tsx
const ACCEPT = '.xlsx';
```

Then change the hidden input from:

```tsx
        <input
          id="excel-file"
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={handleSelect}
          disabled={pending}
        />
```

to:

```tsx
        <input
          id="excel-file"
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={handleSelect}
          disabled={pending}
        />
```

- [ ] **Step 5: Update admin tracking re-upload input**

In `app/(admin)/admin/shipping-uploads/exitmall/[id]/AttachTrackingForm.tsx`, change:

```tsx
      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm border rounded-md p-2"
      />
```

to:

```tsx
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm border rounded-md p-2"
      />
```

- [ ] **Step 6: Update product import input**

In `app/(admin)/admin/products/import/ImportUploadForm.tsx`, change:

```tsx
        <Input
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          disabled={pending}
        />
```

to:

```tsx
        <Input
          type="file"
          name="file"
          required
          disabled={pending}
        />
```

- [ ] **Step 7: Verify only non-Excel or intentionally documented accept filters remain**

Run:

```powershell
rg -n -F "accept=" app components
```

Expected: image/support attachment filters can remain, and no affected business Excel upload input from this plan still has an Excel-only `accept` prop.

- [ ] **Step 8: Commit file input changes**

Run:

```powershell
git add app/(user)/inbound-requests/new/NewRequestForm.tsx app/(user)/shipping-uploads/exitmall/UploadForm.tsx app/(user)/shipping-uploads/purchased/UploadForm.tsx app/(user)/orders/upload/UploadForm.tsx app/(admin)/admin/shipping-uploads/exitmall/[id]/AttachTrackingForm.tsx app/(admin)/admin/products/import/ImportUploadForm.tsx
git commit -m "fix: allow mobile excel file selection"
```

Expected: commit succeeds with only the six upload form files staged.

---

### Task 2: Verify Server Validation Still Protects Uploads

**Files:**
- Test: `tests/unit/excel-upload.test.ts`
- Test: `tests/unit/inbound-action-errors.test.ts`
- Test: `tests/unit/shipping-upload-parser.test.ts`
- Test: `tests/unit/purchased-shipping.test.ts`
- Test: `tests/unit/product-import-parser.test.ts`
- Test: `tests/unit/order-upload-parser.test.ts`

- [ ] **Step 1: Run Excel validation tests**

Run:

```powershell
pnpm vitest run tests/unit/excel-upload.test.ts
```

Expected: PASS. This confirms extension and file-signature validation still rejects invalid Excel uploads.

- [ ] **Step 2: Run related parser tests**

Run:

```powershell
pnpm vitest run tests/unit/shipping-upload-parser.test.ts tests/unit/purchased-shipping.test.ts tests/unit/product-import-parser.test.ts tests/unit/order-upload-parser.test.ts
```

Expected: PASS. Valid `.xlsx` files still parse, and workbook compatibility behavior is unchanged.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: PASS. Removing props and constants introduced no TypeScript errors.

- [ ] **Step 4: Review final diff**

Run:

```powershell
git status --short
git log --oneline -5
```

Expected: working tree is clean after the implementation commit, and recent history includes the design commit, plan commit if one was made, and implementation commit.

## Self-Review

- Spec coverage: the plan removes narrow client-side Excel filters from every affected upload input listed in the design, keeps image filters unchanged, and relies on existing server validation.
- Placeholder scan: no placeholder or deferred implementation steps remain.
- Type consistency: all referenced files and props match the current React/Next.js codebase patterns.
