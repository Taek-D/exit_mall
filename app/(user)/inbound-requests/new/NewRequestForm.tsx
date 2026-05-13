'use client';
import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  submitInboundRequestAction,
  type SubmitResult,
} from '@/lib/actions/inbound-request';

const MAX_IMAGES = 3;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '등록 중…' : '등록'}
    </Button>
  );
}

export function NewRequestForm() {
  const [state, formAction] = useFormState<SubmitResult | null, FormData>(
    submitInboundRequestAction,
    null,
  );
  const router = useRouter();
  const { toast } = useToast();

  // Client-only count tracking for image limit feedback.
  const [imageCount, setImageCount] = useState(0);

  useEffect(() => {
    if (state?.ok) {
      toast({ title: '입고요청이 등록되었습니다.' });
      router.push(`/inbound-requests/${state.requestId}`);
      router.refresh();
    }
  }, [state, router, toast]);

  return (
    <form action={formAction} className="rounded-lg border bg-card p-5 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium">제목 *</label>
        <input
          id="title"
          name="title"
          maxLength={200}
          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="body" className="text-sm font-medium">본문 (선택)</label>
        <textarea
          id="body"
          name="body"
          maxLength={5000}
          rows={5}
          className="w-full rounded-md border bg-background p-3 text-sm resize-y"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="excel" className="text-sm font-medium">
          엑셀 양식 (.xlsx, 최대 5MB) *
        </label>
        <input
          id="excel"
          name="excel"
          type="file"
          accept=".xlsx"
          className="block w-full text-sm border rounded-md p-2"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="images" className="text-sm font-medium">
          이미지 (선택, 최대 {MAX_IMAGES}장, jpg/png/webp, 각 5MB)
        </label>
        <input
          id="images"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES);
            setImageCount(list.length);
            // Distribute selected images into named inputs the action expects.
            const form = e.currentTarget.form;
            if (!form) return;
            for (let i = 0; i < MAX_IMAGES; i++) {
              const existing = form.querySelector<HTMLInputElement>(
                `input[name="image${i}"]`,
              );
              if (existing) existing.remove();
            }
            list.forEach((file, i) => {
              const dt = new DataTransfer();
              dt.items.add(file);
              const slot = document.createElement('input');
              slot.type = 'file';
              slot.name = `image${i}`;
              slot.style.display = 'none';
              slot.files = dt.files;
              form.appendChild(slot);
            });
          }}
          className="block w-full text-sm border rounded-md p-2"
        />
        {imageCount > 0 && (
          <p className="text-xs text-muted-foreground">선택됨: {imageCount}장</p>
        )}
      </div>

      {state && !state.ok && (
        <p className="text-sm text-destructive" role="alert">{state.error}</p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
