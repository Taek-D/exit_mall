'use server';
import { createClient } from '@/lib/supabase/server';
import { parseShippingExcel, computeShippingFee } from '@/lib/shipping-upload-parser';
import { revalidatePath } from 'next/cache';

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
    parsed = parseShippingExcel(buffer);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '엑셀 파싱 실패' };
  }

  // 관리코드(=products.name) 매칭 — 매칭 안 되는 코드가 있으면 미리 거부
  const codes = Array.from(new Set(parsed.items.map((it) => it.product_code)));
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .in('name', codes);
  const known = new Set(((products ?? []) as Array<{ id: string; name: string }>).map((p) => p.name));
  const unknown = codes.filter((c) => !known.has(c));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `존재하지 않는 관리코드가 있습니다: ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? ' …' : ''}`,
    };
  }

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

  const { data: row, error: insErr } = await (supabase.from('order_uploads') as any)
    .insert({
      user_id: u.user.id,
      storage_path: storagePath,
      original_name: file.name,
      contact_person: parsed.uploader_company,
      buyer_phone: parsed.uploader_phone,
      request_memo: parsed.request_memo,
      items: parsed.items,
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

  revalidatePath('/shipping-uploads');
  revalidatePath('/admin/shipping-uploads');
  return { ok: true, uploadId: (row as { id: string }).id };
}

export async function cancelShippingUploadAction(
  uploadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('cancel_shipping_upload', { upload_id: uploadId });
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
  revalidatePath('/shipping-uploads');
  return { ok: true };
}
