import { describe, expect, it } from 'vitest';
import { mapCjStatus, normalizeCjInvoice, parseCjTrackingPayload } from '@/lib/delivery/cj';

describe('normalizeCjInvoice', () => {
  it('accepts 10 or 12 digit invoices after removing spaces and hyphens', () => {
    expect(normalizeCjInvoice('1234567890')).toBe('1234567890');
    expect(normalizeCjInvoice('1234-5678-90')).toBe('1234567890');
    expect(normalizeCjInvoice('1234 5678 9012')).toBe('123456789012');
  });

  it('rejects unsupported invoice formats', () => {
    expect(normalizeCjInvoice('123456789')).toBeNull();
    expect(normalizeCjInvoice('12345678901')).toBeNull();
    expect(normalizeCjInvoice('CJ1234567890')).toBeNull();
    expect(normalizeCjInvoice(null)).toBeNull();
  });
});

describe('mapCjStatus', () => {
  it.each([
    ['11', '상품인수'],
    ['21', '상품이동중'],
    ['41', '상품이동중'],
    ['42', '배송지도착'],
    ['44', '상품이동중'],
    ['82', '배송출발'],
    ['91', '배달완료'],
  ])('maps CJ status code %s', (code, label) => {
    expect(mapCjStatus(code)).toBe(label);
  });

  it('falls back to scan name and then unknown', () => {
    expect(mapCjStatus('99', '임의상태')).toBe('임의상태');
    expect(mapCjStatus('99')).toBe('알수없음');
  });
});

describe('parseCjTrackingPayload', () => {
  const payload = {
    parcelResultMap: {
      paramInvcNo: '1234567890',
      resultList: [],
    },
    parcelDetailResultMap: {
      paramInvcNo: '1234567890',
      resultList: [
        {
          dTime: '2026-03-10 03:01:45',
          regBranNm: '청원HUB',
          crgSt: '44',
          scanNm: '간선상차',
          crgNm: '담당자A 010-1111-2222',
        },
        {
          dTime: '2026-03-21 10:53:19',
          regBranNm: '경기광주오포',
          crgSt: '82',
          scanNm: '배송출발',
          crgNm: '담당자B',
        },
        {
          dTime: '2026-03-21 12:22:13',
          regBranNm: '경기광주오포 TEL: 031-123-4567',
          crgSt: '91',
          scanNm: '배달완료',
          crgNm: '홍길동 010-3333-4444',
        },
      ],
    },
  };

  it('prefers parcelDetailResultMap.resultList and returns a normalized shape', () => {
    const result = parseCjTrackingPayload(payload);

    expect(result).toMatchObject({
      carrier: 'cj',
      invoice: '1234567890',
      status_code: '91',
      status: '배달완료',
      timestamp: '2026-03-21 12:22:13',
      location: '경기광주오포',
      event_count: 3,
    });
    expect(result.recent_events).toHaveLength(3);
    expect(result.recent_events[0]).toMatchObject({
      timestamp: '2026-03-10 03:01:45',
      location: '청원HUB',
      status_code: '44',
      status: '상품이동중',
    });
  });

  it('does not expose handler names or phone fragments from CJ raw fields', () => {
    const result = parseCjTrackingPayload(payload);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('crgNm');
    expect(serialized).not.toContain('담당자');
    expect(serialized).not.toContain('홍길동');
    expect(serialized).not.toContain('010-3333-4444');
    expect(serialized).not.toContain('031-123-4567');
  });

  it('throws when detail events are missing', () => {
    expect(() =>
      parseCjTrackingPayload({
        parcelDetailResultMap: { paramInvcNo: '1234567890', resultList: [] },
      }),
    ).toThrow(/조회 결과/);
  });
});
