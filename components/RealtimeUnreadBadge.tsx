'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';

type Role = 'user' | 'admin';

type RealtimeUnreadBadgeProps = {
  role: Role;
  initial: number;
  rpcName: string;
  channelPrefix: string;
  tables: string[];
  className?: string;
};

export function RealtimeUnreadBadge({
  role,
  initial,
  rpcName,
  channelPrefix,
  tables,
  className,
}: RealtimeUnreadBadgeProps) {
  const [count, setCount] = useState(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCount(initial);
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      const { data, error } = await (supabase.rpc as any)(rpcName, {
        p_role: role,
      });
      if (cancelled || error || data == null) return;
      setCount(Number(data) || 0);
    }

    function scheduleRefresh() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!cancelled) void refresh();
      }, 1000);
    }

    const channelName = `${channelPrefix}-${role}-${Math.random().toString(36).slice(2, 10)}`;
    let channel = supabase.channel(channelName);
    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh,
      );
    }
    channel.subscribe();

    void refresh();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [channelPrefix, role, rpcName, tables]);

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
