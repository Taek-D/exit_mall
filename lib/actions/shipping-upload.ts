'use server';
import { createClient } from '@/lib/supabase/server';
import { parseShippingExcel, computeShippingFee } from '@/lib/shipping-upload-parser';
import { callRpc, mutationTable, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import type { Json } from '@/lib/db-types';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTS = ['.xlsx'];
const OOXML_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type RequestShippingUploadResult =
  | { ok: true; uploadId: string }
  | { ok: false; error: string };

export async function requestShippingUploadAction(
  fd: FormData,
): Promise<RequestShippingUploadResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '파일을 선택해주세요.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: '파일 크기는 5MB 이하여야 합니다.' };
  }
  if (!ALLOWED_EXTS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return { ok: false, error: '.xlsx 파일만 업로드할 수 있습니다.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(OOXML_MAGIC)) {
    return { ok: false, error: '엑셀(.xlsx) 파일 형식이 아닙니다.' };
  }

  let parsed;
  try {
    parsed = await parseShippingExcel(buffer);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '엑셀 파싱 실패' };
  }

  // 상품명(=products.name) 매칭 — 업로드 시점에 product_id 캡처해 결정적으로 고정.
  // product_code 키는 기존 order_uploads.items JSON 호환을 위해 유지한다.
  const productNames = Array.from(new Set(parsed.items.map((it) => it.product_code)));
  const { data: productRows } = await supabase
    .from('products')
    .select('id, name')
    .in('name', productNames);
  const productList = (productRows ?? []) as Array<{ id: string; name: string }>;
  const productByName = new Map<string, string>();
  const duplicates: string[] = [];
  for (const p of productList) {
    if (productByName.has(p.name)) {
      if (!duplicates.includes(p.name)) duplicates.push(p.name);
    } else {
      productByName.set(p.name, p.id);
    }
  }
  if (duplicates.length > 0) {
    return {
      ok: false,
      error: `같은 상품명의 상품이 여러 개입니다(상품 관리에서 중복 정리 필요): ${duplicates.slice(0, 3).join(', ')}${duplicates.length > 3 ? ' …' : ''}`,
    };
  }
  const unknown = productNames.filter((name) => !productByName.has(name));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `존재하지 않는 상품명이 있습니다: ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? ' …' : ''}`,
    };
  }
  const itemsWithProductId = parsed.items.map((it) => ({
    ...it,
    product_id: productByName.get(it.product_code)!,
  }));

  // Storage 업로드
  const safeName = file.name.replace(/[^\w가-힣\.\-]+/g, '_');
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
      items: itemsWithProductId as Json,
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

  revalidatePaths(['/shipping-uploads', '/admin/shipping-uploads']);
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
  revalidatePaths(['/shipping-uploads']);
  return { ok: true };
}
