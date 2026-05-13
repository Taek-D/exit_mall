'use server';
import { createClient } from '@/lib/supabase/server';
import { parseShippingExcel, computeShippingFee } from '@/lib/shipping-upload-parser';
import { callRpc, mutationTable, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { matchInventoryRefs } from '@/lib/shipping-match';
import type { Json } from '@/lib/db-types';
import { safeStorageName, validateExcelUpload } from '@/lib/files/excel';

const MAX_BYTES = 5 * 1024 * 1024;

export type RequestShippingUploadResult =
  | { ok: true; uploadId: string }
  | { ok: false; error: string };

export async function requestShippingUploadAction(
  fd: FormData,
): Promise<RequestShippingUploadResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const upload = await validateExcelUpload(fd.get('file'), {
    maxBytes: MAX_BYTES,
    sizeLabel: '5MB',
  });
  if (!upload.ok) return upload;
  const { file, buffer } = upload;

  let parsed;
  try {
    parsed = await parseShippingExcel(buffer);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '엑셀 파싱 실패' };
  }

  // 2단계 매칭: products.name 우선 → user_custom_inventory.name fallback.
  // products 우선 정책 — 같은 이름이 양쪽에 있으면 항상 products 가 이긴다.
  const productNames = Array.from(new Set(parsed.items.map((it) => it.product_code)));
  const [{ data: productRows }, { data: customRows }] = await Promise.all([
    supabase.from('products').select('id, name').in('name', productNames),
    supabase
      .from('user_custom_inventory')
      .select('id, name')
      .eq('user_id', u.user.id)
      .in('name', productNames),
  ]);

  const match = matchInventoryRefs(
    productNames,
    (productRows ?? []) as Array<{ id: string; name: string }>,
    (customRows ?? []) as Array<{ id: string; name: string }>,
  );
  if (!match.ok) {
    if (match.duplicates.length > 0) {
      const shown = match.duplicates.slice(0, 3).join(', ');
      const more = match.duplicates.length > 3 ? ' …' : '';
      return {
        ok: false,
        error: `같은 상품명의 상품이 여러 개입니다(상품 관리에서 중복 정리 필요): ${shown}${more}`,
      };
    }
    const shown = match.unknown.slice(0, 3).join(', ');
    const more = match.unknown.length > 3 ? ' …' : '';
    return {
      ok: false,
      error: `존재하지 않는 상품명이 있습니다: ${shown}${more}`,
    };
  }

  const itemsWithRef = parsed.items.map((it) => {
    const ref = match.refs.get(it.product_code)!;
    if (ref.kind === 'product') {
      return { ...it, product_id: ref.id };
    }
    return { ...it, custom_inventory_id: ref.id };
  });

  // Storage 업로드
  const safeName = safeStorageName(file.name, { allowKorean: true });
  const storagePath = `${u.user.id}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('order-uploads')
    .upload(storagePath, buffer, {
      contentType:
        file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (upErr) return { ok: false, error: `파일 업로드 실패: ${upErr.message}` };

  const fee = computeShippingFee(parsed.items.length);

  const { data: row, error: insErr } = await mutationTable(supabase, 'order_uploads')
    .insert({
      user_id: u.user.id,
      storage_path: storagePath,
      original_name: file.name,
      contact_person: parsed.uploader_company,
      buyer_phone: parsed.uploader_phone,
      request_memo: parsed.request_memo,
      items: itemsWithRef as Json,
      total_quantity: parsed.total_quantity,
      total_amount: 0,
      shipping_fee_total: fee,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insErr) {
    await supabase.storage.from('order-uploads').remove([storagePath]);
    return { ok: false, error: `저장 실패: ${insErr.message}` };
  }

  revalidatePaths([
    '/shipping-uploads',
    '/shipping-uploads/exitmall',
    '/admin/shipping-uploads',
    '/admin/shipping-uploads/exitmall',
  ]);
  return { ok: true, uploadId: row.id };
}

export async function cancelShippingUploadAction(
  uploadId: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'cancel_shipping_upload', { upload_id: uploadId });
  if (error) {
    if (error.message.startsWith('NOT_CANCELLABLE')) {
      return { ok: false, error: '취소할 수 없는 상태입니다.' };
    }
    if (error.message.startsWith('FORBIDDEN')) {
      return { ok: false, error: '권한이 없습니다.' };
    }
    console.error('[shipping-upload] cancel', { uploadId, error });
    return { ok: false, error: '취소 처리에 실패했습니다.' };
  }
  revalidatePaths(['/shipping-uploads', '/shipping-uploads/exitmall']);
  return { ok: true };
}
