'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
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
  const [attachmentSummary, setAttachmentSummary] = useState<string | null>(null);

  // 성공 시 서버 액션이 상세 페이지로 redirect 한다(progressive enhancement).
  // 실패 시에만 아래 state.error 가 렌더된다.
  return (
    <form action={formAction} className="rounded-lg border bg-card p-5 space-y-4">
      <fieldset className="space-y-4">
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
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
            const totalMb = totalBytes / (1024 * 1024);
            setAttachmentSummary(
              files.length > 0
                ? `${files.length}개 선택, 총 ${totalMb.toFixed(1)}MB`
                : null,
            );
          }}
          className="block w-full text-sm border rounded-md p-2"
        />
        <p className="text-xs text-muted-foreground">
          jpg, png, webp, pdf, xlsx, xls, docx, txt 파일을 첨부할 수 있습니다.
        </p>
        {attachmentSummary && (
          <p className="text-xs text-muted-foreground">{attachmentSummary}</p>
        )}
      </div>
      </fieldset>

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
