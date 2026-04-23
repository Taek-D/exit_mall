import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Props = {
  label: string;
  value: string | number;
  href?: string;
  Icon?: LucideIcon;
  tone?: 'default' | 'warning' | 'danger';
  hint?: string;
};

const TONE_ICON: Record<NonNullable<Props['tone']>, string> = {
  default: 'bg-muted text-foreground',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
};

export function StatCard({ label, value, href, Icon, tone = 'default', hint }: Props) {
  const content = (
    <div className="relative h-full rounded-lg border bg-card p-5 flex flex-col gap-3 transition-colors duration-150 ease-out-expo group-hover:border-foreground/30">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span className={cn('h-7 w-7 rounded-md grid place-items-center', TONE_ICON[tone])}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
      <div className="font-mono tabular text-3xl font-semibold leading-none">{value}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {href && (
        <ArrowUpRight
          className="absolute right-3 bottom-3 h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden
        />
      )}
    </div>
  );
  if (!href) return content;
  return (
    <Link href={href} className="group block h-full">
      {content}
    </Link>
  );
}
