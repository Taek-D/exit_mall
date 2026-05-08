---
slug: codex-review-fixes
status: complete
completed: 2026-05-09
---

# 완료 요약 — Codex Review 보정

## 처리

| 이슈 | 처방 | 위치 |
|---|---|---|
| P1-A `stock_orders_self_insert` 클라이언트 INSERT 우회 | self_insert RLS 정책 제거. RPC 만 INSERT. | 마이그레이션 13 |
| P1-B `shipping_fee_total` 클라이언트 통제 | CHECK NOT VALID + RPC FEE_TAMPERED 가드 | 마이그레이션 13 |
| P2 `per_user_limit` legacy 누적 누락 | `request_stock_order` 합산식에 legacy `orders+order_items` 추가 | 마이그레이션 13 |

## 변경 파일

- `supabase/migrations/20260509000001_codex_p1_p2_hardening.sql` (신규)
- `lib/errors/shipping-upload.ts` (`FEE_TAMPERED` 한국어 매핑)

## 검증

- `supabase db reset` (27개 마이그레이션) PASS
- `pnpm typecheck` PASS
- `pnpm test` 10 files / 96 tests PASS
- `pnpm lint` clean

## 커밋

`fix(security): Codex review P1×2 + P2 보정 — 클라이언트 INSERT 우회 차단·배송비 변조 가드·legacy 누적 합산`
