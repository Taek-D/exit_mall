---
slug: codex-review-round2
status: complete
completed: 2026-05-09
---

# 완료 요약 — Codex Review Round 2

## 처리

| 이슈 | 처방 | 위치 |
|---|---|---|
| P1-A `admin_storage_path` 우회로 다른 파일 읽기 | self_insert RLS 에 `admin_storage_path is null` + storage 정책 `name like 'admin/%'` | 마이그레이션 14 |
| P1-B `product_code↔product_id` 변조 | approve RPC 가 `products.name = product_code` 일관성 검증 → `PRODUCT_MISMATCH` | 마이그레이션 14 |
| P2-A `attach_tracking` 비-tracking 필드 변조 | items loop 으로 tracking 만 갱신, 나머지 보존 | 마이그레이션 14 |
| P2-B `/inventory` 가용 계산 product_code 매칭 | items[*].product_id 직접 사용 | `app/(user)/inventory/page.tsx` |

## 변경 파일

- `supabase/migrations/20260509000002_codex_round2_hardening.sql` (신규)
- `app/(user)/inventory/page.tsx` (products lookup 제거)
- `lib/errors/shipping-upload.ts` (`PRODUCT_MISMATCH` 한국어 매핑)

## 검증

- `supabase db reset` (28개 마이그레이션) PASS
- `pnpm typecheck` PASS
- `pnpm test` 96/96 PASS
- `pnpm lint` clean
