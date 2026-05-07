export type DeliveryTrackingEvent = {
  timestamp: string | null;
  location: string | null;
  status_code?: string | null;
  status: string;
};

export type DeliveryTrackingResponse = {
  carrier: 'cj';
  invoice: string;
  status: string;
  timestamp: string | null;
  location: string | null;
  event_count: number;
  recent_events: DeliveryTrackingEvent[];
  status_code?: string | null;
};

export type DeliveryTrackingErrorCode =
  | 'INVALID_INVOICE'
  | 'CSRF_MISSING'
  | 'CJ_HTTP'
  | 'CJ_PARSE'
  | 'NO_RESULT';

export class DeliveryTrackingError extends Error {
  code: DeliveryTrackingErrorCode;
  status: number;
  publicMessage: string;

  constructor(code: DeliveryTrackingErrorCode, publicMessage: string, status = 502) {
    super(publicMessage);
    this.name = 'DeliveryTrackingError';
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
  }
}
