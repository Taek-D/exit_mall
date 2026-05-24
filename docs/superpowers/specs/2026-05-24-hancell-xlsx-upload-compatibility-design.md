# Hancell XLSX Upload Compatibility Design

## Background

Exitmall accepts `.xlsx` files in several upload flows: shipping requests, purchased inbound inventory, product imports, and the deprecated legacy order upload path. These flows currently parse workbooks with `exceljs@4.4.0`.

A Hancell-created sample shipping template fails before worksheet data is read. The failure is not caused by sheet content. It happens while exceljs parses document properties:

```text
TypeError: Cannot read properties of undefined (reading 'company')
```

The sample file contains `docProps/app.xml` with an `ep:Properties` root element. ExcelJS 4.4.0 expects `Properties` and does not build the app properties model for this variant. The app then throws when it reads `appProperties.company`.

The upload features do not use document properties such as author, company, application name, created date, or modified date. They only need workbook sheets, cell values, and for product imports, embedded images.

## Goals

- Allow Hancell-saved `.xlsx` files to be uploaded across every existing `.xlsx` upload path.
- Preserve real workbook data: sheets, cells, formulas/results as currently handled, styles where exceljs needs them, and embedded product images.
- Ignore or sanitize only non-business document property XML that blocks exceljs from loading the workbook.
- Keep parser behavior and validation messages unchanged after a workbook loads.
- Centralize compatibility handling so future upload parsers do not need to duplicate fallback logic.

## Non-Goals

- Do not support `.xls` or non-OOXML formats.
- Do not use document metadata for business logic.
- Do not replace the whole workbook parser unless the targeted compatibility fallback is insufficient.
- Do not change upload UI, storage paths, or database behavior.

## Recommended Approach

Add an upload-focused workbook loader named `loadExcelWorkbookFromBuffer` to `lib/files/excel.ts`.

Each upload parser will call this loader instead of directly creating an `ExcelJS.Workbook` and calling `workbook.xlsx.load(...)`.

The loader will:

1. Convert `Buffer | ArrayBuffer | Uint8Array` into a Node `Buffer`.
2. Try `workbook.xlsx.load(buffer)` normally.
3. If loading succeeds, return the workbook.
4. If loading fails, create a sanitized copy of the `.xlsx`.
5. In the sanitized copy, replace both `docProps/app.xml` and `docProps/core.xml` with minimal standards-compatible property XML.
6. Load the sanitized workbook with exceljs and return it.
7. If sanitized loading also fails, rethrow the original exceljs load error so each parser preserves its current user-facing catch behavior.

Sanitizing `docProps/app.xml` and `docProps/core.xml` is acceptable because those files store metadata such as author, last modifier, application name, company, and dates. Current upload flows do not read these fields.

Use `jszip` for the sanitized copy and add it as a direct dependency. Although exceljs already depends on JSZip internally, app code should not rely on an undeclared transitive dependency. The copy operation must preserve every ZIP entry except the two replaced document property files.

## Affected Upload Paths

- `lib/shipping-upload-parser.ts`
- `lib/purchased-shipping.ts`
- `lib/product-import-parser.ts`
- `lib/order-upload-parser.ts`

These are the workbook-reading paths found in the current codebase. Export generation with exceljs does not need the fallback because it writes workbooks rather than reading user-uploaded Hancell files.

## Error Handling

The compatibility loader should not expose low-level XML or ZIP errors directly to users. Existing parsers already catch workbook load failures and throw Korean upload errors. Those parser-level errors should remain the public contract.

Internally, the loader should attempt exactly one sanitized retry after the initial exceljs load failure. This avoids brittle error-message matching and still keeps corrupt files from passing: if the workbook is malformed for any reason other than document properties, the sanitized retry will fail too.

When both attempts fail, the loader rethrows the original error. The existing parser catch blocks will continue returning their current "cannot read Excel file" messages.

## Testing

Add focused unit coverage for the loader and one parser-level compatibility test.

Required tests:

- A Hancell-style workbook whose `docProps/app.xml` root is `ep:Properties` fails with raw exceljs but loads through the compatibility loader.
- The provided Hancell sample shape is represented in a fixture or synthetic workbook so tests do not depend on a user Downloads/Documents path.
- Existing normal ExcelJS-generated workbooks still load successfully.
- At least the shipping parser can parse a Hancell-style workbook after sanitization.
- Product import image extraction still works with the loader, because that parser depends on workbook media.

The synthetic fixture should be created by generating a normal workbook, then rewriting only `docProps/app.xml` to the Hancell-style shape. This keeps the test small and avoids committing private uploaded data.

## Risks

- Repacking an `.xlsx` could accidentally drop entries if implemented with ad hoc ZIP handling. Use `jszip`, preserve all non-property entries, and test embedded image preservation.
- Fallback should not mask unrelated corrupt-file failures as successful loads. It should only retry by sanitizing document properties and still rely on exceljs for workbook validation.
- Product import images must be preserved when the sanitized workbook is rebuilt.

## Acceptance Criteria

- The Hancell sample failure is reproduced in a test or local verification.
- Every user-facing `.xlsx` upload parser uses the shared compatibility loader.
- Hancell-style document properties no longer block uploads.
- Existing parser unit tests pass.
- The implementation does not read or store ignored document metadata.
