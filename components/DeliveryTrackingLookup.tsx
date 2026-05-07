'use client';

import { useState } from 'react';
import { AlertCircle, Clock3, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DeliveryTrackingResponse } from '@/lib/delivery/types';

type LookupState = 'idle' | 'loading' | 'success' | 'error';

type ErrorPayload = {
  code?: string;
  error?: string;
};

export function DeliveryTrackingLookup({
  orderId,
  className,
}: {
  orderId: string;
  className?: string;
}) {
  const [state, setState] = useState<LookupState>('idle');
  const [result, setResult] = useState<DeliveryTrackingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    setState('loading');
    setError(null);

    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/tracking`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = (await response.json()) as DeliveryTrackingResponse | ErrorPayload;

      if (!response.ok) {
        const message = 'error' in payload && payload.error ? payload.error : '배송조회에 실패했습니다.';
        throw new Error(message);
      }

      setResult(payload as DeliveryTrackingResponse);
      setState('success');
    } catch (lookupError) {
      setResult(null);
      setError(lookupError instanceof Error ? lookupError.message : '배송조회에 실패했습니다.');
      setState('error');
    }
  }

  return (
    <div className={cn('space-y-2', className)} aria-live="polite">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={lookup}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        )}
        배송 상태 조회
      </Button>

      {state === 'success' && result && <TrackingResult result={result} />}
      {state === 'error' && error && (
        <div className="inline-flex max-w-full items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function TrackingResult({ result }: { result: DeliveryTrackingResponse }) {
  return (
    <div className="rounded-md border bg-surface-muted/50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="h-6 rounded-full">
          {result.status}
        </Badge>
        {result.location && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden />
            {result.location}
          </span>
        )}
        {result.timestamp && (
          <span className="inline-flex items-center gap-1 font-mono tabular text-muted-foreground">
            <Clock3 className="h-3 w-3" aria-hidden />
            {result.timestamp}
          </span>
        )}
      </div>

      {result.recent_events.length > 0 && (
        <ol className="mt-3 space-y-1.5 border-t pt-2">
          {result.recent_events.map((event, index) => (
            <li
              key={`${event.timestamp ?? 'time'}-${event.status}-${index}`}
              className="grid gap-0.5 sm:grid-cols-[150px_1fr] sm:gap-2"
            >
              <span className="font-mono tabular text-muted-foreground">{event.timestamp ?? '-'}</span>
              <span className="min-w-0">
                <span className="font-medium">{event.status}</span>
                {event.location && <span className="text-muted-foreground"> · {event.location}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
