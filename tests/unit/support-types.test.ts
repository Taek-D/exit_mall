import { describe, expect, it } from 'vitest';
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_REFERENCE_TYPE_LABEL,
  SUPPORT_STATUS_LABEL,
  type SupportCategory,
  type SupportReferenceType,
  type SupportStatus,
} from '@/lib/types';

describe('support labels', () => {
  it('maps support statuses to Korean labels', () => {
    expect(SUPPORT_STATUS_LABEL.open).toBe('접수');
    expect(SUPPORT_STATUS_LABEL.in_progress).toBe('처리중');
    expect(SUPPORT_STATUS_LABEL.completed).toBe('완료');
    expect(SUPPORT_STATUS_LABEL.cancelled).toBe('취소');
    expect(Object.keys(SUPPORT_STATUS_LABEL)).toHaveLength(4);
  });

  it('maps support categories to Korean labels', () => {
    expect(SUPPORT_CATEGORY_LABEL.exchange).toBe('교환');
    expect(SUPPORT_CATEGORY_LABEL.return).toBe('반품');
    expect(SUPPORT_CATEGORY_LABEL.cs).toBe('CS문의');
    expect(SUPPORT_CATEGORY_LABEL.other).toBe('기타');
    expect(Object.keys(SUPPORT_CATEGORY_LABEL)).toHaveLength(4);
  });

  it('maps reference types to Korean labels', () => {
    expect(SUPPORT_REFERENCE_TYPE_LABEL.none).toBe('없음');
    expect(SUPPORT_REFERENCE_TYPE_LABEL.order).toBe('주문번호');
    expect(SUPPORT_REFERENCE_TYPE_LABEL.tracking).toBe('운송장번호');
    expect(SUPPORT_REFERENCE_TYPE_LABEL.other).toBe('기타');
    expect(Object.keys(SUPPORT_REFERENCE_TYPE_LABEL)).toHaveLength(4);
  });
});

describe('support union types', () => {
  it('accepts the known values', () => {
    const statuses: SupportStatus[] = ['open', 'in_progress', 'completed', 'cancelled'];
    const categories: SupportCategory[] = ['exchange', 'return', 'cs', 'other'];
    const references: SupportReferenceType[] = ['none', 'order', 'tracking', 'other'];

    expect(statuses).toHaveLength(4);
    expect(categories).toHaveLength(4);
    expect(references).toHaveLength(4);
  });
});
