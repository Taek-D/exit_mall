'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';
import { parseShippingExcel } from '@/lib/shipping-upload-parser';
import { mapShippingUploadError } from '@/lib/actions/admin-shipping-uploads';

const MAX_BYTES = 5 * 1024 * 1024;
const OOXML_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type AttachTrackingResult = { ok: true } | { ok: false; error: string };

export async function attachTrackingAction(
  uploadId: string,
  fd: FormData,
): Promise<AttachTrackingResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '송장 채운 엑셀 파일을 선택해주세요.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: '파일 크기는 5MB 이하여야 합니다.' };
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
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

  const { data: existing } = await guard.supabase
    .from('order_uploads')
    .select('items, status, user_id')
    .eq('id', uploadId)
    .single<{ items: unknown[]; status: string; user_id: string }>();
  if (!existing) return { ok: false, error: '업로드를 찾을 수 없습니다.' };
  if (!['approved', 'shipped'].includes(existing.status)) {
    return { ok: false, error: `현재 상태(${existing.status})에서는 송장 등록이 불가합니다.` };
  }
  if (existing.items.length !== parsed.items.length) {
    return {
      ok: false,
      error: `원본 ${existing.items.length}행과 새 파일 ${parsed.items.length}행이 다릅니다.`,
    };
  }

  const safeName = file.name.replace(/[^\w가-힣\.\-]+/g, '_');
  const storagePath = `admin/${uploadId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await guard.supabase.storage
    .from('order-uploads')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (upErr) return { ok: false, error: `파일 업로드 실패: ${upErr.message}` };

  const { error: rpcErr } = await (guard.supabase.rpc as any)('attach_tracking', {
    upload_id: uploadId,
    storage_path: storagePath,
    parsed_items: parsed.items,
  });
  if (rpcErr) {
    await guard.supabase.storage.from('order-uploads').remove([storagePath]);
    console.error('[attach-tracking] rpc', rpcErr);
    return { ok: false, error: mapShippingUploadError(rpcErr.message) };
  }

  revalidatePath(`/admin/shipping-uploads/${uploadId}`);
  revalidatePath(`/shipping-uploads/${uploadId}`);
  revalidatePath('/admin/shipping-uploads');
  revalidatePath('/shipping-uploads');
  return { ok: true };
}

export async function getTrackingExcelUrl(
  storagePath: string,
  originalName?: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // 관리자/소유자 모두 호출 가능. RLS 가 storage 정책으로 정합성 보장(Phase 1.4 의 정책).
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('order-uploads')
    .createSignedUrl(storagePath, 60 * 5, { download: originalName || true });
  if (error || !data) {
    console.error('[attach-tracking] signedUrl', { storagePath, error });
    return { ok: false, error: '다운로드 URL을 만들지 못했습니다.' };
  }
  return { ok: true, url: data.signedUrl };
}
