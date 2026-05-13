import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import {
  readProductImportPreview,
  readProductImportResult,
  type ProductImportResult,
} from '@/lib/product-import-preview';
import type { ProductImportPreview } from '@/lib/product-import-planner';
import { ImportUploadForm } from './ImportUploadForm';
import { ImportPreview, type ImportRecord } from './ImportPreview';

export const dynamic = 'force-dynamic';

export default async function ProductImportPage({
  searchParams,
}: {
  searchParams: { importId?: string | string[] };
}) {
  const importId = Array.isArray(searchParams.importId)
    ? searchParams.importId[0]
    : searchParams.importId;
  const supabase = createClient();

  let importRecord: ImportRecord | null = null;
  let preview: ProductImportPreview | null = null;
  let result: ProductImportResult | null = null;

  if (importId) {
    const { data, error } = await supabase
      .from('product_imports')
      .select('id,original_name,status,preview,result,error_message,created_at,imported_at')
      .eq('id', importId)
      .single<ImportRecord>();
    if (error || !data) notFound();
    importRecord = data;
    preview = readProductImportPreview(data.preview);
    result = readProductImportResult(data.result);
  }

  const hasErrors = Boolean(preview?.rows.some((row) => row.errors.length > 0));
  const canApply = Boolean(importRecord && preview && importRecord.status === 'preview' && !hasErrors);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        상품관리
      </Link>

      <header className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl tracking-tight">엑셀 가져오기</h1>
          <p className="text-sm text-muted-foreground mt-1">
            상품에 적용 전 미리보기로 검증하고, 신규 상품은 비공개 상태로 등록합니다.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/products/import">새 파일</Link>
        </Button>
      </header>

      <ImportUploadForm />

      {importRecord && preview && (
        <ImportPreview
          importRecord={importRecord}
          preview={preview}
          result={result}
          hasErrors={hasErrors}
          canApply={canApply}
        />
      )}
    </div>
  );
}
