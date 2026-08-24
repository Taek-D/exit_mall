import type { InboundRequestItem } from '@/lib/inbound/queries';

/** 표기 차이(하이픈·공백·대소문자)를 흡수한 비교용 값. DB 쪽 정규화와 같은 규칙. */
export function normalizeTracking(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export type InboundShipment = {
  tracking: string;
  carrier: string | null;
  itemCount: number;
};

/**
 * 품목을 송장번호(=박스) 단위로 묶는다. 관리자가 실제로 다루는 단위가
 * 상품 행이 아니라 박스이고, 송장이 하나뿐인 요청이 절반을 넘어
 * 행마다 같은 번호를 반복해 보여주는 것만으로는 읽히지 않는다.
 */
export function groupInboundShipments(items: InboundRequestItem[]): {
  shipments: InboundShipment[];
  missingCount: number;
} {
  const byTracking = new Map<string, InboundShipment>();
  let missingCount = 0;

  for (const item of items) {
    const tracking = item.tracking_number?.trim();
    if (!tracking) {
      missingCount += 1;
      continue;
    }
    const key = normalizeTracking(tracking);
    const found = byTracking.get(key);
    if (found) {
      found.itemCount += 1;
      if (!found.carrier && item.carrier) found.carrier = item.carrier;
      continue;
    }
    byTracking.set(key, {
      tracking,
      carrier: item.carrier?.trim() || null,
      itemCount: 1,
    });
  }

  return { shipments: Array.from(byTracking.values()), missingCount };
}
