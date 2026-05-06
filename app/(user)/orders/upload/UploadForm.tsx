'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { uploadOrderExcelAction } from '@/lib/actions/order-upload';
import { AlertCircle, FileSpreadsheet, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = '.xlsx';

export function UploadForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function resetInput() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_BYTES) {
      setError('파일 크기는 5MB 이하여야 합니다.');
      resetInput();
      return;
    }
    setFile(f);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError('파일을 선택해주세요.');
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    start(async () => {
      const r = await uploadOrderExcelAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast({
        title: '주문서 업로드 완료',
        description: '관리자 승인 후 주문이 처리됩니다.',
      });
      // Clear DOM value too — otherwise re-selecting the same file does not fire onChange.
      resetInput();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border bg-card p-5 space-y-4"
    >
      <label
        htmlFor="excel-file"
        className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input bg-surface-muted/40 p-8 cursor-pointer hover:bg-surface-muted transition-colors"
      >
        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden />
        {file ? (
          <span className="text-sm font-medium">{file.name}</span>
        ) : (
          <>
            <span className="text-sm font-medium">엑셀 파일을 선택하세요</span>
            <span className="text-xs text-muted-foreground">
              .xlsx · 5MB 이하
            </span>
          </>
        )}
        <input
          id="excel-file"
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={handleSelect}
          disabled={pending}
        />
      </label>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <p className="break-words">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={pending || !file}>
          <Upload className="h-4 w-4" aria-hidden />
          {pending ? '업로드 중…' : '업로드'}
        </Button>
      </div>
    </form>
  );
}
