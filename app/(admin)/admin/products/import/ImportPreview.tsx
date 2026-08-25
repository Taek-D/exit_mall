import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { formatKRW } from '@/lib/money';
import { StatusPill } from '@/components/StatusBadge';
import type { Json } from '@/lib/db-types';
import type { ProductImportPreview, PlannedProductImportRow } from '@/lib/product-import-planner';
import type { ProductImportResult } from '@/lib/product-import-preview';
import {
  getProductImportActionMeta,
  getProductImportStatusMeta,
} from '@/lib/product-import-preview';
import { ConfirmImportButton } from './ConfirmImportButton';

export type ImportRecord = {
  id: string;
  original_name: string;
  status: string;
  preview: Json;
  result: Json | null;
  error_message: string | null;
  created_at: string;
  imported_at: string | null;
};

export function ImportPreview({
  importRecord,
  preview,
  result,
  hasErrors,
  canApply,
}: {
  importRecord: ImportRecord;
  preview: ProductImportPreview;
  result: ProductImportResult | null;
  hasErrors: boolean;
  canApply: boolean;
}) {
  return (
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
                <ProductImportStatusPill status={importRecord.status} />
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

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <SummaryBox label="전체" value={preview.summary.total} />
          <SummaryBox label="신규" value={preview.summary.create} />
          <SummaryBox label="덮어쓰기" value={preview.summary.update} />
          <SummaryBox label="복구" value={preview.summary.restore ?? 0} />
          <SummaryBox label="오류" value={preview.summary.error} tone={hasErrors ? 'danger' : undefined} />
          <SummaryBox label="경고" value={preview.summary.warningRows} />
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
              적용 완료: 신규 {result.created}개, 덮어쓰기 {result.updated}개, 복구 {result.restored}개
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

      <ImportPreviewTable rows={preview.rows} />

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
  );
}

function ImportPreviewTable({ rows }: { rows: PlannedProductImportRow[] }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        {/* 표를 줄이지 말고 가로로 스크롤시킨다(docs/standards.md).
            상품명·메시지만 줄바꿈을 허용한다. */}
        <table className="w-full min-w-[980px] text-sm whitespace-nowrap">
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
            {rows.map((row) => (
              <tr key={row.rowNumber} className="border-t align-top">
                <td className="px-4 py-3 font-mono text-xs">{row.rowNumber}</td>
                <td className="px-3 py-3">
                  <ProductImportActionPill action={row.action} />
                </td>
                <td className="px-3 py-3 whitespace-normal">
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
                  <StatusPill tone={row.hasImage ? 'success' : 'neutral'}>
                    {row.hasImage ? '있음' : '없음'}
                  </StatusPill>
                </td>
                <td className="px-3 py-3 whitespace-normal">
                  <MessageList errors={row.errors} warnings={row.warnings} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductImportStatusPill({ status }: { status: string }) {
  const meta = getProductImportStatusMeta(status);
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
}

function ProductImportActionPill({ action }: { action: PlannedProductImportRow['action'] }) {
  const meta = getProductImportActionMeta(action);
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
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
