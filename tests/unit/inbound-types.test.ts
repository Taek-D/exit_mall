import { describe, it, expect } from 'vitest';
import { INBOUND_STATUS_LABEL, type InboundStatus } from '@/lib/types';

describe('INBOUND_STATUS_LABEL', () => {
  it('maps all 4 statuses to Korean labels', () => {
    expect(INBOUND_STATUS_LABEL.open).toBe('접수');
    expect(INBOUND_STATUS_LABEL.in_progress).toBe('진행중');
    expect(INBOUND_STATUS_LABEL.completed).toBe('완료');
    expect(INBOUND_STATUS_LABEL.cancelled).toBe('취소');
  });

  it('has exactly 4 keys', () => {
    expect(Object.keys(INBOUND_STATUS_LABEL)).toHaveLength(4);
  });
});

describe('InboundStatus type', () => {
  it('accepts the four known values', () => {
    const samples: InboundStatus[] = ['open', 'in_progress', 'completed', 'cancelled'];
    expect(samples).toHaveLength(4);
  });
});
