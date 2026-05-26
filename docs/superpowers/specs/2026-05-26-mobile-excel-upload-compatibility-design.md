# Mobile Excel Upload Compatibility Design

## Background

Some Android and iOS users cannot select `.xlsx` files from the mobile file picker. The file appears in the Downloads view, but it is disabled. The affected flows are Excel upload flows that currently use narrow client-side `accept` filters such as `accept=".xlsx"`.

Mobile file pickers do not handle extension-only `accept` filters consistently across Android, iOS, browser apps, and file provider apps. When the picker cannot match the file to the declared accept value, it disables the file before the app can validate it.

The server already validates uploaded Excel files by extension and file signature. That validation is the reliable enforcement point.

## Goals

- Allow users on Android and iOS to select Excel files from mobile file pickers.
- Keep server-side validation as the source of truth for allowed upload files.
- Preserve the current `.xlsx`-only business rule for Excel upload flows.
- Avoid changing upload parsing, storage, database writes, or approval workflows.
- Keep the change small and consistent across all user-facing Excel upload inputs.

## Non-Goals

- Do not add `.xls` support to flows that currently accept only `.xlsx`.
- Do not weaken server validation.
- Do not add new upload flows or change template formats.
- Do not redesign the upload UI.
- Do not guarantee identical behavior inside every third-party in-app browser, because mobile OS file pickers and file provider apps can still differ.

## Options Considered

### Option 1: Broaden `accept` MIME Types

Use an accept value such as:

```html
accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
```

This improves compatibility for many devices, but still relies on the mobile picker mapping local files to the same MIME type. Some Android file providers may still disable valid files.

### Option 2: Remove `accept` Only On Mobile

Detect mobile browsers and omit `accept` for them. Desktop keeps a filtered picker.

This reduces mobile friction while preserving desktop convenience, but adds device detection and creates different behavior between clients. Device detection is also brittle for tablets, embedded browsers, and future browser changes.

### Option 3: Remove `accept` For Excel Upload Inputs

Do not restrict the file picker for `.xlsx` upload flows. Let users choose any file, then reject invalid files through existing server-side validation.

This provides the best mobile compatibility and keeps validation centralized. The trade-off is that users may see unrelated files in the picker and can choose the wrong file, but they will receive the existing validation error.

## Recommended Design

Use Option 3 for user-facing `.xlsx` upload flows.

Remove the `accept` attribute from Excel upload inputs that are used to upload business Excel files. Keep image upload accept filters unchanged, because mobile image pickers are generally reliable and the flows are not affected by the Excel file-provider issue.

The affected inputs found in the current codebase are:

- `app/(user)/inbound-requests/new/NewRequestForm.tsx`
- `app/(user)/shipping-uploads/exitmall/UploadForm.tsx`
- `app/(user)/shipping-uploads/purchased/UploadForm.tsx`
- `app/(user)/orders/upload/UploadForm.tsx`
- `app/(admin)/admin/shipping-uploads/exitmall/[id]/AttachTrackingForm.tsx`
- `app/(admin)/admin/products/import/ImportUploadForm.tsx`

Although the original report is from the inbound list upload, the same client-side pattern exists across related Excel upload screens. Updating them together prevents the same issue from recurring in another Excel upload flow.

## Data Flow

1. User taps an upload control.
2. The browser opens the OS file picker without an Excel-only client filter.
3. User selects a file.
4. Existing client-side checks, where present, can still check size.
5. The server action validates extension and file signature.
6. Valid `.xlsx` files continue to parse through the existing Excel compatibility loader.
7. Invalid files are rejected with the current Korean validation messages.

## Error Handling

Server validation remains the final contract:

- Wrong extension is rejected with the existing `.xlsx`-only message.
- Wrong file signature is rejected with the existing Excel-format message.
- Corrupt or unreadable workbooks are rejected by the existing parser errors.

No new user-facing error messages are required for this change.

## Testing

Add or update focused tests only if a component-level test pattern already exists for the upload input. Otherwise, verification can be covered by:

- Static search confirming no affected Excel upload input still uses `accept=".xlsx"`.
- Existing upload validation unit tests proving invalid files are still rejected server-side.
- Existing parser tests proving valid Excel files still parse.
- Manual mobile verification on Android Chrome/Samsung Internet and iOS Safari when a device is available.

## Acceptance Criteria

- Android and iOS users can select `.xlsx` files from the mobile file picker in the affected Excel upload flows.
- Server-side `.xlsx` validation still rejects invalid file types.
- Image upload inputs retain their image accept filters.
- No upload parsing, storage, or approval behavior changes.
- Targeted tests and typecheck pass.
