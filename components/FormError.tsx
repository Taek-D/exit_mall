import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type FormErrorProps = {
  message?: string | null;
  children?: ReactNode;
  className?: string;
  iconClassName?: string;
};

export function FormError({ message, children, className, iconClassName }: FormErrorProps) {
  const content = message ?? children;

  if (!content) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive',
        className,
      )}
    >
      <AlertCircle className={cn('mt-0.5 h-4 w-4 shrink-0', iconClassName)} aria-hidden />
      <div className="min-w-0">{typeof content === 'string' ? <p>{content}</p> : content}</div>
    </div>
  );
}
