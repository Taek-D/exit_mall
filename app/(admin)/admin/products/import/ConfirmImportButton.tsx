'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { confirmProductImportAction } from '@/lib/actions/admin-product-imports';

export function ConfirmImportButton({
  importId,
  disabled,
}: {
  importId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await confirmProductImportAction(importId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            toast({
              title: '상품 엑셀 적용 완료',
              description: `신규 ${result.created}개, 덮어쓰기 ${result.updated}개, 복구 ${result.restored}개`,
            });
            router.refresh();
          })
        }
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        )}
        적용
      </Button>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
