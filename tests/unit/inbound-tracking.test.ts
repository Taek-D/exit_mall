import { describe, expect, it } from 'vitest';
import { groupInboundShipments, normalizeTracking } from '@/lib/inbound/tracking';
import type { InboundRequestItem } from '@/lib/inbound/queries';

function item(over: Partial<InboundRequestItem>): InboundRequestItem {
  return { product_name: '상품', option_name: '', quantity: 1, ...over };
}

describe('normalizeTracking', () => {
  it('하이픈·공백·소문자를 흡수해 같은 값으로 만든다', () => {
    expect(normalizeTracking('6029-1028-3290')).toBe('602910283290');
    expect(normalizeTracking(' 6029 1028 3290 ')).toBe('602910283290');
    expect(normalizeTracking('ab12cd')).toBe('AB12CD');
  });
});

describe('groupInboundShipments', () => {
  it('같은 송장번호의 품목을 박스 하나로 묶는다', () => {
    const { shipments, missingCount } = groupInboundShipments([
      item({ tracking_number: '602910283290', carrier: '한진택배' }),
      item({ tracking_number: '602910283290', carrier: '한진택배' }),
    ]);
    expect(shipments).toEqual([
      { tracking: '602910283290', carrier: '한진택배', itemCount: 2 },
    ]);
    expect(missingCount).toBe(0);
  });

  it('표기만 다른 같은 송장번호도 하나로 본다', () => {
    const { shipments } = groupInboundShipments([
      item({ tracking_number: '6029-1028-3290', carrier: '한진택배' }),
      item({ tracking_number: '602910283290', carrier: null }),
    ]);
    expect(shipments).toHaveLength(1);
    expect(shipments[0].itemCount).toBe(2);
    // 화면에는 고객이 적은 원문을 그대로 보여준다.
    expect(shipments[0].tracking).toBe('6029-1028-3290');
  });

  it('송장번호가 여러 개면 박스별로 나눈다', () => {
    const { shipments } = groupInboundShipments([
      item({ tracking_number: '111', carrier: 'CJ대한통운' }),
      item({ tracking_number: '222', carrier: '롯데택배' }),
    ]);
    expect(shipments.map((s) => s.tracking)).toEqual(['111', '222']);
  });

  it('송장번호가 비어 있는 품목은 개수만 센다', () => {
    const { shipments, missingCount } = groupInboundShipments([
      item({ tracking_number: null }),
      item({ tracking_number: '   ' }),
      item({ tracking_number: '333', carrier: null }),
    ]);
    expect(missingCount).toBe(2);
    expect(shipments).toEqual([{ tracking: '333', carrier: null, itemCount: 1 }]);
  });
});
