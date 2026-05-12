'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export function OrdersRealtime() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-new-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stock_orders' },
        () => {
          toast({ title: '새 검토 요청', description: '주문관리에서 확인하세요.' });
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_uploads' },
        () => {
          toast({ title: '새 엑시트몰 배송대행 업로드', description: '검토대기 항목이 추가됐습니다.' });
          router.refresh();
        },
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock_orders' }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_uploads' }, () => {
        router.refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, toast]);

  return null;
}
