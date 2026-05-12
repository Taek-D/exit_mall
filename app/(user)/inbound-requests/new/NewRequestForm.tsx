'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { submitInboundRequestAction } from '@/lib/actions/inbound-request';

const MAX_IMAGES = 3;

export function NewRequestForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [excel, setExcel] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!title.trim()) {
          setError('제목을 입력해주세요');
          return;
        }
        if (!excel) {
          setError('엑셀 파일을 첨부해주세요');
          return;
        }
        if (images.length > MAX_IMAGES) {
          setError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다`);
          return;
        }
        start(async () => {
          const fd = new FormData();
          fd.append('title', title.trim());
          fd.append('body', body);
          fd.append('excel', excel);
          images.forEach((img, i) => fd.append(`image${i}`, img));
          const r = await submitInboundRequestAction(fd);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          toast({ title: '입고요청이 등록되었습니다.' });
          router.push(`/inbound-requests/${r.requestId}`);
          router.refresh();
        });
      }}
      className="rounded-lg border bg-card p-5 space-y-4"
    >
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium">제목 *</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="body" className="text-sm font-medium">본문 (선택)</label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
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
          type="file"
          accept=".xlsx"
          onChange={(e) => setExcel(e.target.files?.[0] ?? null)}
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
            setImages(list);
          }}
          className="block w-full text-sm border rounded-md p-2"
        />
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? '등록 중…' : '등록'}
        </Button>
      </div>
    </form>
  );
}
