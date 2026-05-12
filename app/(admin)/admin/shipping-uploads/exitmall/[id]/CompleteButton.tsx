'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { completeShippingUploadAction } from '@/lib/actions/admin-shipping-uploads';

export function CompleteButton({ uploadId }: { uploadId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await completeShippingUploadAction(uploadId);
          if (!r.ok) {
            toast({ title: '완료 처리 실패', description: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: '완료 처리되었습니다' });
          router.refresh();
        })
      }
    >
      {pending ? '처리 중…' : '완료 처리'}
    </Button>
  );
}
