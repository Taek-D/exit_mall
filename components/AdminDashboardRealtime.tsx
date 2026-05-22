'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { useToast } from '@/hooks/use-toast';

const DASHBOARD_TABLES = [
  'stock_orders',
  'order_uploads',
  'profiles',
  'deposit_requests',
  'inbound_requests',
  'support_requests',
] as const;

export function AdminDashboardRealtime() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase.channel('admin-dashboard-events');

    DASHBOARD_TABLES.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            if (table === 'stock_orders') {
              toast({
                title: '구매 요청',
                description: '구매 승인 대기 목록에 새 요청이 추가되었습니다.',
              });
            }
            if (table === 'order_uploads') {
              toast({
                title: '배송대행 업로드',
                description: '검토할 배송대행 업로드가 추가되었습니다.',
              });
            }
          }
          router.refresh();
        },
      );
    });

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, toast]);

  return null;
}
