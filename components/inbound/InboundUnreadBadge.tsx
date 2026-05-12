'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';

type Role = 'user' | 'admin';

type UnreadRow = {
  last_comment_at: string | null;
  last_comment_by_role: 'user' | 'admin' | null;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
};

function computeCount(rows: UnreadRow[], role: Role): number {
  return rows.filter((r) => {
    if (!r.last_comment_at) return false;
    if (role === 'user') {
      return (
        r.last_comment_by_role === 'admin' &&
        (!r.user_last_read_at || r.last_comment_at > r.user_last_read_at)
      );
    }
    return (
      r.last_comment_by_role === 'user' &&
      (!r.admin_last_read_at || r.last_comment_at > r.admin_last_read_at)
    );
  }).length;
}

export function InboundUnreadBadge({
  role,
  initial,
  className,
}: {
  role: Role;
  initial: number;
  className?: string;
}) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      // inbound_requests is not yet in generated DB types; cast to escape.
      const { data } = await (supabase.from as any)('inbound_requests').select(
        'id,last_comment_at,last_comment_by_role,user_last_read_at,admin_last_read_at',
      );
      if (cancelled || !data) return;
      setCount(computeCount(data as UnreadRow[], role));
    }

    const channel = supabase
      .channel(`inbound-unread-${role}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbound_requests' },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbound_request_comments' },
        () => refresh(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [role]);

  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground',
        className,
      )}
      aria-label={`읽지 않음 ${count}건`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
