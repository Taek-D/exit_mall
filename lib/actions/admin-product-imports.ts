'use server';
import { randomUUID } from 'node:crypto';
import { parseProductImportExcel } from '@/lib/product-import-parser';
import {
  planProductImportRows,
  type ExistingImportProduct,
  type ProductImportPreview,
  type PlannedProductImportRow,
} from '@/lib/product-import-planner';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, mutationTable, revalidatePaths } from '@/lib/actions/_shared';
import type { Json } from '@/lib/db-types';
import { safeStorageName, validateExcelUpload } from '@/lib/files/excel';

const MAX_BYTES = 20 * 1024 * 1024;

export type CreateProductImportPreviewResult =
  | { ok: true; importId: string }
  | { ok: false; error: string };

export type ConfirmProductImportResult =
  | { ok: true; created: number; updated: number; restored: number; warnings: string[] }
  | { ok: false; error: string };

type ProductImportRecord = {
  id: string;
  status: string;
  storage_path: string;
  original_name: string;
  preview: Json;
};

type ApplyProductImportRow = {
  product_id: string | null;
  name: string;
  import_key: string;
  price: number;
  description: string | null;
  image_url: string | null;
  brand: string | null;
  option_name: string | null;
  management_code: string | null;
  category: string | null;
  barcode: string | null;
};

function previewFromJson(value: Json): ProductImportPreview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const preview = value as unknown as ProductImportPreview;
  if (!Array.isArray(preview.rows) || !preview.summary) return null;
  return preview;
}

function productImportError(message: string): string {
  if (message.startsWith('FORBIDDEN')) return '관리자 권한이 필요합니다.';
  if (message.startsWith('AMBIGUOUS_PRODUCT_NAME')) {
    const name = message.split(':').slice(1).join(':');
    return `같은 상품명의 기존 상품이 여러 개 있어 적용할 수 없습니다: ${name}`;
  }
  if (message.startsWith('PRODUCT_NOT_FOUND')) {
    return '미리보기 이후 기존 상품이 삭제되어 적용할 수 없습니다. 다시 업로드해주세요.';
  }
  if (message.startsWith('INVALID_PRICE')) return '가격이 올바르지 않은 행이 있습니다.';
  if (message.startsWith('INVALID_IMPORT_KEY') || message.startsWith('INVALID_NAME')) {
    return '상품명 또는 옵션이 올바르지 않은 행이 있습니다.';
  }
  return '상품 일괄 등록 중 오류가 발생했습니다.';
}

function rowWarnings(rows: PlannedProductImportRow[]): string[] {
  return rows.flatMap((row) =>
    row.warnings.map((warning) => `${row.rowNumber}행: ${warning}`),
  );
}

export async function createProductImportPreviewAction(
  fd: FormData,
): Promise<CreateProductImportPreviewResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const upload = await validateExcelUpload(fd.get('file'), {
    maxBytes: MAX_BYTES,
    sizeLabel: '20MB',
    emptyMessage: '업로드할 엑셀 파일을 선택해주세요.',
  });
  if (!upload.ok) return upload;
  const { file, buffer } = upload;

  let parsed;
  try {
    parsed = await parseProductImportExcel(buffer);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '엑셀 파일을 파싱할 수 없습니다.',
    };
  }

  const { data: products, error: productError } = await guard.supabase
    .from('products')
    .select('id,name,import_key,description,image_url,is_active,deleted_at,stock,per_user_limit');
  if (productError) {
    console.error('[admin-product-imports] products lookup', productError);
    return { ok: false, error: '기존 상품 목록을 불러오지 못했습니다.' };
  }

  const preview = planProductImportRows(
    parsed.rows,
    (products ?? []) as ExistingImportProduct[],
  );

  const importId = randomUUID();
  const storagePath = `${guard.user.id}/${importId}-${safeStorageName(file.name, { fallback: 'products.xlsx' })}`;
  const { error: uploadError } = await guard.supabase.storage
    .from('product-imports')
    .upload(storagePath, buffer, {
      contentType:
        file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });

  if (uploadError) {
    console.error('[admin-product-imports] original upload', uploadError);
    return { ok: false, error: `원본 파일 저장에 실패했습니다: ${uploadError.message}` };
  }

  const { error: insertError } = await mutationTable(guard.supabase, 'product_imports').insert({
    id: importId,
    admin_id: guard.user.id,
    storage_path: storagePath,
    original_name: file.name,
    status: 'preview',
    preview: preview as unknown as Json,
  });

  if (insertError) {
    await guard.supabase.storage.from('product-imports').remove([storagePath]);
    console.error('[admin-product-imports] preview insert', insertError);
    return { ok: false, error: '미리보기 저장에 실패했습니다.' };
  }

  revalidatePaths(['/admin/products', '/admin/products/import']);
  return { ok: true, importId };
}

export async function confirmProductImportAction(
  importId: string,
): Promise<ConfirmProductImportResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data: importRow, error: importError } = await guard.supabase
    .from('product_imports')
    .select('id,status,storage_path,original_name,preview')
    .eq('id', importId)
    .single<ProductImportRecord>();

  if (importError || !importRow) {
    console.error('[admin-product-imports] import lookup', { importId, importError });
    return { ok: false, error: '미리보기 기록을 찾을 수 없습니다.' };
  }
  if (importRow.status !== 'preview') {
    return { ok: false, error: '이미 적용되었거나 실패 처리된 업로드입니다.' };
  }

  const preview = previewFromJson(importRow.preview);
  if (!preview) return { ok: false, error: '미리보기 데이터가 올바르지 않습니다.' };
  if (preview.rows.some((row) => row.errors.length > 0)) {
    return { ok: false, error: '오류가 있는 행이 있어 적용할 수 없습니다.' };
  }

  const { data: blob, error: downloadError } = await guard.supabase.storage
    .from('product-imports')
    .download(importRow.storage_path);
  if (downloadError || !blob) {
    console.error('[admin-product-imports] original download', { importId, downloadError });
    return { ok: false, error: '원본 엑셀 파일을 다시 읽을 수 없습니다.' };
  }

  let parsed;
  try {
    parsed = await parseProductImportExcel(Buffer.from(await blob.arrayBuffer()));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '원본 엑셀 파일을 다시 파싱할 수 없습니다.',
    };
  }

  const imageByRow = new Map(parsed.rows.map((row) => [row.rowNumber, row.image]));
  const warnings = rowWarnings(preview.rows);
  const uploadedImagePaths: string[] = [];
  const applyRows: ApplyProductImportRow[] = [];

  for (const row of preview.rows) {
    const image = imageByRow.get(row.rowNumber);
    let imageUrl: string | null = null;

    if (image) {
      const path = `imports/${importId}/row-${row.rowNumber}.${image.extension}`;
      const { error: imageUploadError } = await guard.supabase.storage
        .from('product-images')
        .upload(path, image.buffer, {
          contentType: image.contentType,
          upsert: false,
        });

      if (imageUploadError) {
        warnings.push(`${row.rowNumber}행: 이미지 업로드 실패 - ${imageUploadError.message}`);
      } else {
        uploadedImagePaths.push(path);
        const { data: publicUrl } = guard.supabase.storage
          .from('product-images')
          .getPublicUrl(path);
        imageUrl = publicUrl.publicUrl;
      }
    }

    applyRows.push({
      product_id: row.existingProductId,
      name: row.displayName,
      import_key: row.importKey,
      price: row.price ?? 0,
      description: row.memo,
      image_url: imageUrl,
      brand: row.brand,
      option_name: row.optionName,
      management_code: row.managementCode,
      category: row.category,
      barcode: row.barcode,
    });
  }

  const { data: resultData, error: applyError } = await callRpc(
    guard.supabase,
    'apply_product_import',
    { rows: applyRows as unknown as Json },
  );

  if (applyError) {
    if (uploadedImagePaths.length > 0) {
      await guard.supabase.storage.from('product-images').remove(uploadedImagePaths);
    }
    await mutationTable(guard.supabase, 'product_imports')
      .update({
        status: 'failed',
        error_message: applyError.message,
        result: { warnings } as unknown as Json,
      })
      .eq('id', importId);
    console.error('[admin-product-imports] apply', { importId, applyError });
    return { ok: false, error: productImportError(applyError.message) };
  }

  const result = (resultData ?? {}) as { created?: number; updated?: number; restored?: number };
  const created = Number(result.created ?? 0);
  const updated = Number(result.updated ?? 0);
  const restored = Number(result.restored ?? 0);
  const finalResult = { created, updated, restored, warnings };

  const { error: updateError } = await mutationTable(guard.supabase, 'product_imports')
    .update({
      status: 'imported',
      result: finalResult as unknown as Json,
      imported_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', importId);

  if (updateError) {
    console.error('[admin-product-imports] result update', { importId, updateError });
    warnings.push('상품은 적용되었지만 import 결과 기록 업데이트에 실패했습니다.');
  }

  revalidatePaths(['/admin/products', '/admin/products/import', '/shop']);
  return { ok: true, created, updated, restored, warnings };
}
