import type { ParsedProductImportRow } from '@/lib/product-import-parser';

export type ExistingImportProduct = {
  id: string;
  name: string;
  import_key: string | null;
  description?: string | null;
  image_url?: string | null;
  is_active?: boolean;
  deleted_at?: string | null;
  stock?: number;
  per_user_limit?: number | null;
};

export type ProductImportAction = 'create' | 'update' | 'restore' | 'error';

export type PlannedProductImportRow = {
  rowNumber: number;
  action: ProductImportAction;
  existingProductId: string | null;
  existingProductName: string | null;
  brand: string | null;
  productName: string | null;
  optionName: string | null;
  displayName: string;
  importKey: string;
  price: number | null;
  managementCode: string | null;
  category: string | null;
  barcode: string | null;
  memo: string | null;
  hasImage: boolean;
  errors: string[];
  warnings: string[];
};

export type ProductImportPreviewSummary = {
  total: number;
  create: number;
  update: number;
  restore: number;
  error: number;
  warningRows: number;
};

export type ProductImportPreview = {
  rows: PlannedProductImportRow[];
  summary: ProductImportPreviewSummary;
};

function bucketBy<T>(items: T[], keyOf: (item: T) => string | null | undefined) {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }
  return buckets;
}

export function planProductImportRows(
  parsedRows: ParsedProductImportRow[],
  existingProducts: ExistingImportProduct[],
): ProductImportPreview {
  const byImportKey = bucketBy(existingProducts, (product) => product.import_key);
  const byName = bucketBy(existingProducts, (product) => product.name);

  const rows: PlannedProductImportRow[] = parsedRows.map((row) => {
    const errors = [...row.errors];
    const warnings = [...row.warnings];
    let existing: ExistingImportProduct | null = null;

    if (errors.length === 0) {
      const importKeyMatches = byImportKey.get(row.importKey) ?? [];
      if (importKeyMatches.length > 1) {
        errors.push(`기존 상품 import_key가 중복되어 있습니다: ${row.displayName}`);
      } else if (importKeyMatches.length === 1) {
        existing = importKeyMatches[0]!;
      } else {
        const nameMatches = byName.get(row.displayName) ?? [];
        if (nameMatches.length > 1) {
          errors.push(`같은 상품명의 기존 상품이 여러 개 있습니다: ${row.displayName}`);
        } else if (nameMatches.length === 1) {
          existing = nameMatches[0]!;
        }
      }
    }

    const action: ProductImportAction =
      errors.length > 0
        ? 'error'
        : existing?.deleted_at
          ? 'restore'
          : existing
            ? 'update'
            : 'create';

    return {
      rowNumber: row.rowNumber,
      action,
      existingProductId: existing?.id ?? null,
      existingProductName: existing?.name ?? null,
      brand: row.brand,
      productName: row.productName,
      optionName: row.optionName,
      displayName: row.displayName,
      importKey: row.importKey,
      price: row.price,
      managementCode: row.managementCode,
      category: row.category,
      barcode: row.barcode,
      memo: row.memo,
      hasImage: row.hasImage,
      errors,
      warnings,
    };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      create: rows.filter((row) => row.action === 'create').length,
      update: rows.filter((row) => row.action === 'update').length,
      restore: rows.filter((row) => row.action === 'restore').length,
      error: rows.filter((row) => row.action === 'error').length,
      warningRows: rows.filter((row) => row.warnings.length > 0).length,
    },
  };
}
