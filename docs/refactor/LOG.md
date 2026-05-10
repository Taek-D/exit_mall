# Refactor Log

## 2026-05-10

### Unit 1: Supabase Boundary Cleanup

- Moved scattered RPC/table mutation escape hatches into `lib/actions/_shared.ts`.
- Kept read queries typed where Supabase generated types work reliably.
- Reduced direct `as any` usage in touched app/action files to two centralized helpers.

### Unit 2: Server Action Shared Helpers

- Added `ActionResult`, `revalidatePaths`, `callRpc`, and `mutationTable`.
- Updated stock order, shipping upload, order upload, deposit, product, approval, user, inventory, and legacy order admin actions to use the shared helpers.
- Preserved existing action names and return shapes.

### Unit 3: Query and Formatter Extraction

- Added `lib/orders/queries.ts` for admin stock orders, user orders, admin shipping uploads, and recent user shipping uploads.
- Added `lib/dates.ts` for repeated Korean date formatting.
- Updated touched pages to consume the extracted query/format helpers.

### Unit 4: Test Coverage

- Added focused unit tests for stock order item summary mapping.

### Verification

- `pnpm typecheck`: pass after helper centralization.
- Remaining full verification to run after final lint/build pass.

## 2026-05-10 Follow-up Cycle

### Unit 1: Server Action Response Cleanup

- Applied shared `ActionResult`, `actionError`, Zod error formatting, and `revalidatePaths` helpers consistently across touched server actions.
- Preserved public Server Action names and existing caller compatibility.
- Kept Supabase RPC/table mutation escape hatches centralized in `callRpc` and `mutationTable`.

### Unit 2: Admin User Detail Split

- Extracted admin user detail fetching and pure calculations into `lib/admin/user-detail.ts`.
- Moved reusable admin detail panels into `components/admin/DetailPanels.tsx`.
- Added unit coverage for total spent, inventory display name mapping, and ledger sign handling.

### Unit 3: Order and Shipping Detail Split

- Extracted stock order and shipping upload detail fetching into `lib/admin/order-details.ts`.
- Reused the shared customer summary panel and Korean date formatting helpers in detail pages.
- Kept routes, DB/RPC names, and UI behavior intact while reducing page-level data shaping.

### Unit 4: Dependency and Security Refactor

- Replaced `xlsx` with `exceljs` for order upload parsing, shipping upload parsing, fixture/template generation, and order export.
- Updated `next` and `eslint-config-next` to `14.2.35`, the latest Next 14 line available in this cycle.
- Updated Vitest/Vite/PostCSS dev tooling where possible and ran `pnpm dedupe`.
- Attempted Supabase CLI v2 update, but reverted to the existing v1 line because the Windows binary install failed under ignored build scripts.

### Verification

- `pnpm typecheck`: pass.
- `pnpm test`: pass, 102 tests.
- `pnpm lint`: pass.
- `pnpm build`: pass.
- `pnpm audit --audit-level moderate`: still fails with 13 vulnerabilities.
  - Removed: `xlsx` advisories and Vite/esbuild advisories.
  - Remaining: Next advisories requiring Next 15.x, `glob` via Next ESLint tooling, `postcss` via Next 14 dependency, and `tar` via Supabase CLI v1.

### Operational Smoke Verification

- Ran the built app with `next start` on port 3100.
- Confirmed public auth pages render with HTTP 200 and no browser console/page errors.
- Confirmed protected user/admin routes and admin export route return redirect responses when unauthenticated.
- Confirmed tracking API returns a JSON 401 response when unauthenticated.
- Confirmed Excel parser regression tests pass for order uploads, shipping uploads, and tracking reuploads.
