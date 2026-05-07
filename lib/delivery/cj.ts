import { DeliveryTrackingError, type DeliveryTrackingEvent, type DeliveryTrackingResponse } from '@/lib/delivery/types';

const CJ_TRACKING_ENTRYPOINT = 'https://www.cjlogistics.com/ko/tool/parcel/tracking';
const CJ_TRACKING_DETAIL = 'https://www.cjlogistics.com/ko/tool/parcel/tracking-detail';
const FETCH_TIMEOUT_MS = 15_000;

const CJ_STATUS_LABELS: Record<string, string> = {
  '11': '상품인수',
  '21': '상품이동중',
  '41': '상품이동중',
  '42': '배송지도착',
  '44': '상품이동중',
  '82': '배송출발',
  '91': '배달완료',
};

type UnknownRecord = Record<string, unknown>;

export function normalizeCjInvoice(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[\s-]/g, '');
  return /^(\d{10}|\d{12})$/.test(normalized) ? normalized : null;
}

export function mapCjStatus(statusCode: string | null | undefined, scanName?: string | null): string {
  if (statusCode && CJ_STATUS_LABELS[statusCode]) return CJ_STATUS_LABELS[statusCode];
  return scanName?.trim() || '알수없음';
}

export function parseCjTrackingPayload(payload: unknown): DeliveryTrackingResponse {
  const root = asRecord(payload, 'CJ 응답 형식이 올바르지 않습니다.');
  const detail = asRecord(root.parcelDetailResultMap, 'CJ 상세 배송 정보가 없습니다.');
  const rawEvents = detail.resultList;

  if (!Array.isArray(rawEvents)) {
    throw new DeliveryTrackingError('CJ_PARSE', 'CJ 배송 이벤트 형식이 올바르지 않습니다.');
  }
  if (rawEvents.length === 0) {
    throw new DeliveryTrackingError('NO_RESULT', '조회 결과가 없습니다.');
  }

  const events = rawEvents.map(normalizeCjEvent);
  const latest = events[events.length - 1];
  const invoice = readString(detail.paramInvcNo) ?? '';

  return {
    carrier: 'cj',
    invoice,
    status_code: latest.status_code,
    status: latest.status,
    timestamp: latest.timestamp,
    location: latest.location,
    event_count: events.length,
    recent_events: events.slice(-3),
  };
}

export async function trackCjDelivery(rawInvoice: string): Promise<DeliveryTrackingResponse> {
  const invoice = normalizeCjInvoice(rawInvoice);
  if (!invoice) {
    throw new DeliveryTrackingError(
      'INVALID_INVOICE',
      'CJ대한통운 송장번호는 숫자 10자리 또는 12자리여야 합니다.',
      400,
    );
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await requestCjTracking(invoice);
      return result.invoice ? result : { ...result, invoice };
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === 1) break;
    }
  }

  if (lastError instanceof DeliveryTrackingError) throw lastError;
  throw new DeliveryTrackingError('CJ_HTTP', 'CJ대한통운 배송조회에 실패했습니다.');
}

async function requestCjTracking(invoice: string): Promise<DeliveryTrackingResponse> {
  const entryResponse = await fetchWithTimeout(CJ_TRACKING_ENTRYPOINT, {
    method: 'GET',
    redirect: 'follow',
    headers: requestHeaders(),
  });

  if (!entryResponse.ok) {
    throw new DeliveryTrackingError('CJ_HTTP', 'CJ대한통운 조회 페이지에 연결하지 못했습니다.');
  }

  const html = await entryResponse.text();
  const csrf = extractCsrf(html);
  if (!csrf) {
    throw new DeliveryTrackingError('CSRF_MISSING', 'CJ대한통운 조회 토큰을 확인하지 못했습니다.');
  }

  const cookie = extractCookieHeader(entryResponse.headers);
  const body = new URLSearchParams({ _csrf: csrf, paramInvcNo: invoice });

  const detailResponse = await fetchWithTimeout(CJ_TRACKING_DETAIL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      ...requestHeaders(),
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      referer: CJ_TRACKING_ENTRYPOINT,
      ...(cookie ? { cookie } : {}),
    },
    body,
  });

  if (!detailResponse.ok) {
    throw new DeliveryTrackingError('CJ_HTTP', 'CJ대한통운 배송조회 응답이 올바르지 않습니다.');
  }

  const text = await detailResponse.text();
  try {
    return parseCjTrackingPayload(JSON.parse(text));
  } catch (error) {
    if (error instanceof DeliveryTrackingError) throw error;
    throw new DeliveryTrackingError('CJ_PARSE', 'CJ대한통운 배송조회 응답을 해석하지 못했습니다.');
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

function requestHeaders(): HeadersInit {
  return {
    accept: 'application/json, text/html;q=0.9, */*;q=0.8',
    'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'user-agent': 'ExitMall/1.0 (+https://www.cjlogistics.com)',
  };
}

function shouldRetry(error: unknown): boolean {
  if (!(error instanceof DeliveryTrackingError)) return true;
  return error.code === 'CSRF_MISSING' || error.code === 'CJ_HTTP';
}

function extractCsrf(html: string): string | null {
  return (
    html.match(/name=["']_csrf["']\s+value=["']([^"']+)["']/)?.[1] ??
    html.match(/value=["']([^"']+)["']\s+name=["']_csrf["']/)?.[1] ??
    null
  );
}

function extractCookieHeader(headers: Headers): string {
  const headersWithCookies = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headersWithCookies.getSetCookie?.() ?? [];
  const rawCookies = setCookies.length > 0 ? setCookies : splitCombinedSetCookie(headers.get('set-cookie'));

  return rawCookies
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

function splitCombinedSetCookie(value: string | null): string[] {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/).map((cookie) => cookie.trim());
}

function normalizeCjEvent(raw: unknown): DeliveryTrackingEvent {
  const event = asRecord(raw, 'CJ 배송 이벤트 형식이 올바르지 않습니다.');
  const statusCode = readString(event.crgSt);
  const scanName = readString(event.scanNm);

  return {
    timestamp: readString(event.dTime),
    location: cleanLocation(readString(event.regBranNm)),
    status_code: statusCode,
    status: mapCjStatus(statusCode, scanName),
  };
}

function cleanLocation(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\s*(TEL\s*:?\s*)?\d{2,4}[.-]\d{3,4}[.-]\d{4}/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function asRecord(value: unknown, message: string): UnknownRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  throw new DeliveryTrackingError('CJ_PARSE', message);
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number') return String(value);
  return null;
}
