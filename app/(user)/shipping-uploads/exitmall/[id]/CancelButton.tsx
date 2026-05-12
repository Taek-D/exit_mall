'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cancelShippingUploadAction } from '@/lib/actions/shipping-upload';

export function CancelButton({ uploadId }: { uploadId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await cancelShippingUploadAction(uploadId);
          if (!r.ok) {
            toast({ title: '취소 실패', description: r.error, variant: 'destructive' });
            return;
          }
          toast({ title: '취소되었습니다' });
          router.refresh();
        })
      }
    >
      {pending ? '취소 중…' : '취소'}
    </Button>
  );
}
