import Link from 'next/link';
import { cn } from '@/lib/utils';

export type StatusTab<Key extends string> = {
  key: Key;
  label: string;
};

export function StatusTabs<Key extends string>({
  tabs,
  active,
  counts,
  hrefFor,
}: {
  tabs: StatusTab<Key>[];
  active: Key;
  counts: Record<string, number | undefined>;
  hrefFor: (key: Key) => string;
}) {
  return (
    <div className="border-b overflow-x-auto">
      <div className="flex min-w-max">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <Link
              key={tab.key}
              href={hrefFor(tab.key)}
              className={cn(
                'relative flex items-center gap-2 px-4 h-11 text-sm border-b-2 transition-colors whitespace-nowrap',
                isActive
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  'inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-mono tabular',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {counts[tab.key] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
