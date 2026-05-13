'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { InboundUnreadBadge } from '@/components/inbound/InboundUnreadBadge';
import { ADMIN_NAV_ITEMS } from '@/components/admin-nav-items';

export function AdminSidebar({ inboundUnread }: { inboundUnread: number }) {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-background">
      <div className="h-16 flex items-center gap-2 px-6 border-b">
        <div className="h-7 w-7 rounded-md bg-primary grid place-items-center">
          <span className="text-primary-foreground text-xs font-heading font-semibold">E</span>
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-heading font-semibold text-sm tracking-tight">엑시트몰</span>
          <span className="text-[11px] text-muted-foreground">관리자 콘솔</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-0.5">
          {ADMIN_NAV_ITEMS.map(({ href, label, Icon, exact, muted }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 h-9 rounded-md text-sm transition-colors duration-150 ease-out-expo',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : muted
                        ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        : 'text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {href === '/admin/inbound-requests' && (
                      <InboundUnreadBadge role="admin" initial={inboundUnread} />
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t p-3 text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between px-2">
          <span>v0.1.0</span>
          <span>© 엑시트몰</span>
        </div>
      </div>
    </aside>
  );
}
