'use client';
import { Button } from '@/components/ui/button';
import { deleteProductAction } from '@/lib/actions/admin-products';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const { confirm, element } = useConfirm();

  async function handle() {
    const res = await confirm({
      title: '상품을 삭제할까요?',
      description: `"${name}" 상품이 상점 목록에서 제거돼요. 과거 주문 내역은 그대로 보존돼요.`,
      confirmLabel: '삭제',
      tone: 'destructive',
    });
    if (!res.ok) return;
    start(async () => {
      const r = await deleteProductAction(id);
      if ((r as { error?: string }).error) {
        toast({
          title: '실패',
          description: (r as { error: string }).error,
          variant: 'destructive',
        });
      } else {
        toast({ title: '삭제 완료' });
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={handle}
        disabled={pending}
        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        aria-label={`${name} 삭제`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        삭제
      </Button>
      {element}
    </>
  );
}
