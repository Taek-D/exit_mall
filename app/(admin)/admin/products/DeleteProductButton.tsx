'use client';
import { Button } from '@/components/ui/button';
import { deleteProductAction } from '@/lib/actions/admin-products';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  function handle() {
    if (!confirm(`"${name}" 상품을 삭제하시겠습니까? 과거 주문 내역은 보존됩니다.`)) return;
    start(async () => {
      const r = await deleteProductAction(id);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else { toast({ title: '삭제 완료' }); router.refresh(); }
    });
  }
  return <Button size="sm" variant="destructive" onClick={handle} disabled={pending}>삭제</Button>;
}
