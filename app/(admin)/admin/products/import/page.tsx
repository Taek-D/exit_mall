import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatKRW } from '@/lib/money';
import { StatusPill } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import type { Json } from '@/lib/db-types';
import type { ProductImportPreview, PlannedProductImportRow } from '@/lib/product-import-planner';
import { ImportUploadForm } from './ImportUploadForm';
import { ConfirmImportButton } from './ConfirmImportButton';

export const dynamic = 'force-dynamic';

type ImportRecord = {
  id: string;
  original_name: string;
  status: string;
  preview: Json;
  result: Json | null;
  error_message: string | null;
  created_at: string;
  imported_at: string | null;
};

type ImportResult = {
  created: number;
  updated: number;
  warnings: string[];
};

function readPreview(value: Json): ProductImportPreview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const preview = value as unknown as ProductImportPreview;
  if (!Array.isArray(preview.rows) || !preview.summary) return null;
  return preview;
}

function readResult(value: Json | null): ImportResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as unknown as Partial<ImportResult>;
  return {
    created: Number(result.created ?? 0),
    updated: Number(result.updated ?? 0),
    warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
  };
}

function actionPill(row: PlannedProductImportRow) {
  if (row.action === 'error') return <StatusPill tone="danger">오류</StatusPill>;
  if (row.action === 'update') return <StatusPill tone="warning">덮어쓰기</StatusPill>;
  return <StatusPill tone="info">신규</StatusPill>;
}

function statusPill(status: string) {
  if (status === 'imported') return <StatusPill tone="success">적용 완료</StatusPill>;
  if (status === 'failed') return <StatusPill tone="danger">실패</StatusPill>;
  return <StatusPill tone="warning">미리보기</StatusPill>;
}

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
  let result: ImportResult | null = null;

  if (importId) {
    const { data, error } = await supabase
      .from('product_imports')
      .select('id,original_name,status,preview,result,error_message,created_at,imported_at')
      .eq('id', importId)
      .single<ImportRecord>();
    if (error || !data) notFound();
    importRecord = data;
    preview = readPreview(data.preview);
    result = readResult(data.result);
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
            상품은 적용 전 미리보기로 검증하고, 신규 상품은 비공개 상태로 등록됩니다.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/products/import">새 파일</Link>
        </Button>
      </header>

      <ImportUploadForm />

      {importRecord && preview && (
        <section className="space-y-4">
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-muted grid place-items-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-heading font-semibold break-all">
                      {importRecord.original_name}
                    </h2>
                    {statusPill(importRecord.status)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(importRecord.created_at).toLocaleString('ko-KR')}
                  </p>
                </div>
              </div>

              {importRecord.status === 'preview' && (
                <ConfirmImportButton importId={importRecord.id} disabled={!canApply} />
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryBox label="전체" value={preview.summary.total} />
              <SummaryBox label="신규" value={preview.summary.create} />
              <SummaryBox label="덮어쓰기" value={preview.summary.update} />
              <SummaryBox label="오류" value={preview.summary.error} tone={hasErrors ? 'danger' : undefined} />
              <SummaryBox label="경고 행" value={preview.summary.warningRows} />
            </div>

            {hasErrors && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
                <p>오류가 있는 행이 있어 적용할 수 없습니다. 엑셀을 수정한 뒤 다시 업로드해주세요.</p>
              </div>
            )}

            {importRecord.status === 'imported' && result && (
              <div className="flex items-start gap-2 rounded-md border border-success/20 bg-success/5 p-3 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
                <p>
                  적용 완료: 신규 {result.created}개, 덮어쓰기 {result.updated}개
                  {importRecord.imported_at
                    ? ` (${new Date(importRecord.imported_at).toLocaleString('ko-KR')})`
                    : ''}
                </p>
              </div>
            )}

            {importRecord.status === 'failed' && importRecord.error_message && (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                적용 실패: {importRecord.error_message}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-surface-muted">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="font-medium px-4 h-10 w-16">행</th>
                    <th className="font-medium px-3 w-28">처리</th>
                    <th className="font-medium px-3">상품명</th>
                    <th className="font-medium px-3 text-right w-28">가격</th>
                    <th className="font-medium px-3 w-40">관리코드</th>
                    <th className="font-medium px-3 w-40">바코드</th>
                    <th className="font-medium px-3 w-24">이미지</th>
                    <th className="font-medium px-3 w-72">메시지</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className="border-t align-top">
                      <td className="px-4 py-3 font-mono text-xs">{row.rowNumber}</td>
                      <td className="px-3 py-3">{actionPill(row)}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium">{row.displayName || '-'}</p>
                        {row.existingProductName && (
                          <p className="text-xs text-muted-foreground mt-1">
                            기존: {row.existingProductName}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular">
                        {row.price === null ? '-' : formatKRW(row.price)}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{row.managementCode ?? '-'}</td>
                      <td className="px-3 py-3 font-mono text-xs">{row.barcode ?? '-'}</td>
                      <td className="px-3 py-3">
                        {row.hasImage ? (
                          <StatusPill tone="success">있음</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">없음</StatusPill>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <MessageList errors={row.errors} warnings={row.warnings} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result && result.warnings.length > 0 && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="font-heading font-semibold">적용 경고</h2>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SummaryBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'danger';
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === 'danger'
            ? 'font-mono tabular text-lg font-semibold text-destructive'
            : 'font-mono tabular text-lg font-semibold'
        }
      >
        {value}
      </p>
    </div>
  );
}

function MessageList({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (errors.length === 0 && warnings.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="space-y-1">
      {errors.map((error) => (
        <p key={error} className="text-xs text-destructive">
          {error}
        </p>
      ))}
      {warnings.map((warning) => (
        <p key={warning} className="text-xs text-warning">
          {warning}
        </p>
      ))}
    </div>
  );
}
