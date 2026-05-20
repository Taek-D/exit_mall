import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapShippingUploadError } from '@/lib/errors/shipping-upload';

describe('mapShippingUploadError', () => {
  it('FORBIDDEN', () => {
    expect(mapShippingUploadError('FORBIDDEN')).toBe('관리자만 처리할 수 있습니다.');
  });
  it('NOT_FOUND', () => {
    expect(mapShippingUploadError('NOT_FOUND')).toBe('업로드를 찾을 수 없습니다.');
  });
  it('ALREADY_PROCESSED', () => {
    expect(mapShippingUploadError('ALREADY_PROCESSED')).toBe('이미 처리된 업로드입니다.');
  });
  it('USER_NOT_ACTIVE', () => {
    expect(mapShippingUploadError('USER_NOT_ACTIVE')).toContain('활성');
  });
  it('EMPTY_ITEMS', () => {
    expect(mapShippingUploadError('EMPTY_ITEMS')).toContain('주문 항목이 없');
  });
  it('INSUFFICIENT_INVENTORY', () => {
    const r = mapShippingUploadError('INSUFFICIENT_INVENTORY:abc:10:3');
    expect(r).toContain('보유 재고');
    expect(r).toContain('10');
    expect(r).toContain('3');
  });
  it('INSUFFICIENT_PURCHASED_INVENTORY', () => {
    const r = mapShippingUploadError('INSUFFICIENT_PURCHASED_INVENTORY:abc:10:3');
    expect(r).toContain('사입재고');
    expect(r).toContain('10');
    expect(r).toContain('3');
  });
  it('EMPTY_ALLOCATIONS', () => {
    expect(mapShippingUploadError('EMPTY_ALLOCATIONS')).toContain('사입재고 배정');
  });
  it('INSUFFICIENT_BALANCE', () => {
    expect(mapShippingUploadError('INSUFFICIENT_BALANCE')).toContain('예치금');
  });
  it('PRODUCT_NOT_FOUND', () => {
    expect(mapShippingUploadError('PRODUCT_NOT_FOUND:스니커즈')).toContain('존재하지 않는 상품명');
  });
  it('ROW_COUNT_MISMATCH', () => {
    const r = mapShippingUploadError('ROW_COUNT_MISMATCH:5:3');
    expect(r).toContain('행 수가 다릅');
  });
  it('INVALID_STATE', () => {
    expect(mapShippingUploadError('INVALID_STATE:pending')).toContain('현재 상태');
  });
  it('INVALID_QUANTITY', () => {
    expect(mapShippingUploadError('INVALID_QUANTITY')).toContain('수량');
  });
  it('NOT_CANCELLABLE', () => {
    expect(mapShippingUploadError('NOT_CANCELLABLE')).toContain('취소할 수 없');
  });
  it('unknown fallback', () => {
    expect(mapShippingUploadError('XXX')).toBe('처리 중 오류가 발생했습니다.');
  });
});

describe('20260520000001 shipping fee policy migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260520000001_shipping_fee_cart_stock_name_match.sql'),
    'utf8',
  );

  it('does not deduct deposit balance in approve_shipping_upload', () => {
    const approveStart = sql.indexOf('create or replace function public.approve_shipping_upload');
    const requestStart = sql.indexOf('create or replace function public.request_stock_order');
    expect(approveStart).toBeGreaterThanOrEqual(0);
    expect(requestStart).toBeGreaterThan(approveStart);
    const approveSql = sql.slice(approveStart, requestStart);

    expect(approveSql).not.toContain('deposit_balance = deposit_balance - v_upload.shipping_fee_total');
    expect(approveSql).not.toContain('INSUFFICIENT_BALANCE');
    expect(approveSql).not.toMatch(
      /update\s+public\.profiles[\s\S]*deposit_balance\s*=\s*deposit_balance\s*-\s*v_upload\.shipping_fee_total/i,
    );
    expect(approveSql).not.toMatch(
      /insert\s+into\s+public\.balance_transactions[\s\S]*shipping_upload/i,
    );
    expect(approveSql).not.toContain("'배송대행 승인 (배송비)'");
  });

  it('does not reserve pending shipping fees for stock orders', () => {
    const requestStart = sql.indexOf('create or replace function public.request_stock_order');
    expect(requestStart).toBeGreaterThanOrEqual(0);
    const requestSql = sql.slice(requestStart);

    expect(requestSql).not.toContain('from public.order_uploads');
    expect(requestSql).not.toContain('shipping_fee_total');
  });

  it('compares approval product names after removing whitespace', () => {
    expect(sql).toContain('public.product_match_key');
    expect(sql).toContain('grant execute on function public.product_match_key(text) to authenticated;');
    expect(sql).toContain("public.product_match_key(v_resolved_name) <> public.product_match_key(v_row->>'product_code')");
  });
});
