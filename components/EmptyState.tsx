import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon: LucideIcon;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  iconClassName?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  iconClassName,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-12 flex flex-col items-center gap-3 text-center',
        className,
      )}
    >
      <div className="h-12 w-12 rounded-full bg-muted grid place-items-center">
        <Icon className={cn('h-6 w-6 text-muted-foreground', iconClassName)} aria-hidden />
      </div>
      {title && <h2 className="font-medium">{title}</h2>}
      {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action}
    </div>
  );
}
