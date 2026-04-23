'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-surface">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive grid place-items-center mx-auto">
          <AlertCircle className="h-5 w-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-heading font-semibold text-lg">문제가 발생했어요</h1>
          <p className="text-sm text-muted-foreground">
            잠시 후 다시 시도해주세요. 계속되면 운영자에게 문의해주세요.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono tabular text-[11px] text-muted-foreground">
              #{error.digest}
            </p>
          )}
        </div>
        <Button onClick={reset} className="w-full">
          <RotateCcw className="h-4 w-4" aria-hidden />
          다시 시도
        </Button>
      </div>
    </div>
  );
}
