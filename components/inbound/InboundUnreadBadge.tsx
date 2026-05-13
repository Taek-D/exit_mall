'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';

type Role = 'user' | 'admin';

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      // browser supabase-js generic inference fails to match Functions overload;
      // cast preserves runtime behavior. Mirrors lib/actions/_shared.ts callRpc helper.
      const { data, error } = await (supabase.rpc as any)('count_inbound_unread', {
        p_role: role,
      });
      if (cancelled || error || data == null) return;
      setCount(Number(data) || 0);
    }

    function scheduleRefresh() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!cancelled) refresh();
      }, 1000);
    }

    const channel = supabase
      .channel(`inbound-unread-${role}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbound_requests' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbound_request_comments' },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
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
