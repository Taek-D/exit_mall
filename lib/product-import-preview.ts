import type { Json } from '@/lib/db-types';
import type { ProductImportPreview, PlannedProductImportRow } from '@/lib/product-import-planner';
import type { StatusPillTone } from '@/components/StatusBadge';

export type ProductImportResult = {
  created: number;
  updated: number;
  restored: number;
  warnings: string[];
};

export function readProductImportPreview(value: Json): ProductImportPreview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const preview = value as unknown as ProductImportPreview;
  if (!Array.isArray(preview.rows) || !preview.summary) return null;
  return preview;
}

export function readProductImportResult(value: Json | null): ProductImportResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as unknown as Partial<ProductImportResult>;
  return {
    created: Number(result.created ?? 0),
    updated: Number(result.updated ?? 0),
    restored: Number(result.restored ?? 0),
    warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
  };
}

export function getProductImportActionMeta(
  action: PlannedProductImportRow['action'],
): { label: string; tone: StatusPillTone } {
  if (action === 'error') return { label: '오류', tone: 'danger' };
  if (action === 'restore') return { label: '복구', tone: 'success' };
  if (action === 'update') return { label: '덮어쓰기', tone: 'warning' };
  return { label: '신규', tone: 'info' };
}

export function getProductImportStatusMeta(status: string): { label: string; tone: StatusPillTone } {
  if (status === 'imported') return { label: '적용 완료', tone: 'success' };
  if (status === 'failed') return { label: '실패', tone: 'danger' };
  return { label: '미리보기', tone: 'warning' };
}
