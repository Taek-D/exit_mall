'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createProductImportPreviewAction } from '@/lib/actions/admin-product-imports';

export function ImportUploadForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(fd: FormData) {
    setError(null);
    start(async () => {
      const result = await createProductImportPreviewAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/products/import?importId=${result.importId}`);
    });
  }

  return (
    <form
      action={onSubmit as unknown as (fd: FormData) => void}
      className="rounded-lg border bg-card p-5 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-muted grid place-items-center shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <h2 className="font-heading font-semibold">상품 엑셀 업로드</h2>
          <p className="text-sm text-muted-foreground mt-1">
            업로드 후 바로 등록하지 않고, 먼저 신규/덮어쓰기/오류 미리보기를 만듭니다.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          disabled={pending}
        />
        <Button type="submit" disabled={pending} className="sm:w-36">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <UploadCloud className="h-4 w-4" aria-hidden />
          )}
          미리보기
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}
    </form>
  );
}
