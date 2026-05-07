/**
 * Generates the public parcel tracking URL for a given carrier + tracking number.
 * Returns null when the carrier is unknown or the inputs are missing.
 */

export type CarrierKey =
  | 'cj'
  | 'hanjin'
  | 'lotte'
  | 'logen'
  | 'epost'
  | 'kdexp';

const CARRIER_ALIASES: Record<string, CarrierKey> = {
  cj: 'cj',
  'cj대한통운': 'cj',
  대한통운: 'cj',
  cjlogistics: 'cj',
  hanjin: 'hanjin',
  한진: 'hanjin',
  한진택배: 'hanjin',
  lotte: 'lotte',
  롯데: 'lotte',
  롯데택배: 'lotte',
  롯데글로벌로지스: 'lotte',
  logen: 'logen',
  로젠: 'logen',
  로젠택배: 'logen',
  epost: 'epost',
  우체국: 'epost',
  우체국택배: 'epost',
  kdexp: 'kdexp',
  경동: 'kdexp',
  경동택배: 'kdexp',
};

export function normalizeCarrier(name: string | null | undefined): CarrierKey | null {
  if (!name) return null;
  const key = name.replace(/\s+/g, '').toLowerCase();
  return CARRIER_ALIASES[key] ?? null;
}

export function isCjCarrier(carrier: string | null | undefined): boolean {
  return normalizeCarrier(carrier) === 'cj';
}

export function getTrackingUrl(carrier: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  if (!carrier || !trackingNumber) return null;
  const t = trackingNumber.replace(/[^0-9A-Za-z]/g, '');
  if (!t) return null;
  const k = normalizeCarrier(carrier);
  switch (k) {
    case 'cj':
      return `https://trace.cjlogistics.com/web/detail.jsp?slipno=${t}`;
    case 'hanjin':
      return `https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblnumText2=${t}`;
    case 'lotte':
      return `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${t}`;
    case 'logen':
      return `https://www.ilogen.com/web/personal/trace/${t}`;
    case 'epost':
      return `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${t}`;
    case 'kdexp':
      return `https://kdexp.com/service/delivery/etc/delivery_etc.jsp?barcode=${t}`;
    default:
      return null;
  }
}

export const KNOWN_CARRIERS: { value: string; label: string }[] = [
  { value: 'CJ대한통운', label: 'CJ대한통운' },
  { value: '한진택배', label: '한진택배' },
  { value: '롯데택배', label: '롯데택배' },
  { value: '로젠택배', label: '로젠택배' },
  { value: '우체국택배', label: '우체국택배' },
  { value: '경동택배', label: '경동택배' },
];
