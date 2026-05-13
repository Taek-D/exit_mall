import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FormMessage({
  tone,
  children,
  className,
}: {
  tone: 'error' | 'success';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 text-sm rounded-md border p-3',
        tone === 'error'
          ? 'text-destructive bg-destructive/5 border-destructive/20'
          : 'text-success bg-success/5 border-success/20',
        className,
      )}
    >
      {tone === 'error' ? (
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      )}
      <p>{children}</p>
    </div>
  );
}
