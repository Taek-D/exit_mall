'use client';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { restoreProductAction } from '@/lib/actions/admin-products';
import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function RestoreProductButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const { confirm, element } = useConfirm();
  const { toast } = useToast();
  const router = useRouter();

  async function handle() {
    const res = await confirm({
      title: '상품을 복구할까요?',
      description: `"${name}" 상품을 상품관리 목록으로 되돌립니다. 복구 후에도 판매중지 상태로 유지됩니다.`,
      confirmLabel: '복구',
    });
    if (!res.ok) return;

    start(async () => {
      const r = await restoreProductAction(id);
      if ((r as { error?: string }).error) {
        toast({
          title: '실패',
          description: (r as { error: string }).error,
          variant: 'destructive',
        });
      } else {
        toast({ title: '복구 완료' });
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handle}
        disabled={pending}
        aria-label={`${name} 복구`}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        복구
      </Button>
      {element}
    </>
  );
}
