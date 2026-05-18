'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  submitSupportRequestAction,
  type SubmitSupportResult,
} from '@/lib/actions/support-request';

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.xlsx,.xls,.docx,.txt';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '등록 중...' : '등록'}
    </Button>
  );
}

export function NewSupportRequestForm() {
  const [state, formAction] = useFormState<SubmitSupportResult | null, FormData>(
    submitSupportRequestAction,
    null,
  );
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (state?.ok) {
      toast({ title: '문의가 등록되었습니다.' });
      router.push(`/support-requests/${state.requestId}`);
      router.refresh();
    }
  }, [state, router, toast]);

  return (
    <form action={formAction} className="rounded-lg border bg-card p-5 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="category" className="text-sm font-medium">
          문의 유형 *
        </label>
        <select
          id="category"
          name="category"
          defaultValue="exchange"
          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          required
        >
          <option value="exchange">교환</option>
          <option value="return">반품</option>
          <option value="cs">CS문의</option>
          <option value="other">기타</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          제목 *
        </label>
        <input
          id="title"
          name="title"
          maxLength={200}
          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="referenceType" className="text-sm font-medium">
            참고 구분
          </label>
          <select
            id="referenceType"
            name="referenceType"
            defaultValue="none"
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="none">없음</option>
            <option value="order">주문번호</option>
            <option value="tracking">운송장번호</option>
            <option value="other">기타</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="referenceValue" className="text-sm font-medium">
            참고 번호
          </label>
          <input
            id="referenceValue"
            name="referenceValue"
            maxLength={100}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="body" className="text-sm font-medium">
          내용 *
        </label>
        <textarea
          id="body"
          name="body"
          maxLength={5000}
          rows={7}
          className="w-full rounded-md border bg-background p-3 text-sm resize-y"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="attachments" className="text-sm font-medium">
          첨부파일 (선택, 최대 5개, 각 10MB)
        </label>
        <input
          id="attachments"
          name="attachments"
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="block w-full text-sm border rounded-md p-2"
        />
        <p className="text-xs text-muted-foreground">
          jpg, png, webp, pdf, xlsx, xls, docx, txt 파일을 첨부할 수 있습니다.
        </p>
      </div>

      {state && !state.ok && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
