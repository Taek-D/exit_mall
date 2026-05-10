# Refactor Review

Updated: 2026-05-10

## Summary

The first refactor pass focused on stability-preserving cleanup. The app already had a healthy baseline: `pnpm typecheck`, `pnpm test`, and `pnpm lint` passed before changes. The main risks were scattered Supabase type escape hatches, repeated server action boilerplate, and large page files mixing data fetching with rendering.

## Findings

| Risk | Area | Finding | Recommended unit |
| --- | --- | --- | --- |
| Medium | `lib/actions/*` | RPC and mutation calls used callsite-level `as any`, making later reviews noisy. | Centralize the Supabase escape hatch in one helper and keep action code typed at its boundary. |
| Medium | `app/(admin)`, `app/(user)` | Order and shipping list pages duplicated query/count/date mapping logic. | Extract server-side query helpers and formatter helpers. |
| Low | UI pages | Date formatting was repeated inline with `new Date(...).toLocaleString(...)`. | Use shared date formatters for touched pages. |
| Low | Tests | Parser/RPC tests were strong, but newly extracted row summary helpers had no direct tests. | Add focused unit tests for pure mapping/summary helpers. |

## Scope

Included in this pass:

- Centralized `ActionResult`, `revalidatePaths`, `callRpc`, and mutation table helper behavior.
- Extracted order and shipping list query helpers into `lib/orders/queries.ts`.
- Added shared Korean date formatting helpers.
- Removed page/action-level `as any` usage from the touched stock order, shipping upload, order upload, admin action, and inventory paths.

Out of scope for this pass:

- DB schema or RLS changes.
- User-facing route or Server Action name changes.
- Security dependency replacement such as `xlsx` migration.
- Broad UI redesign.

## Verification

Required commands:

- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm build` when page/server boundaries change
