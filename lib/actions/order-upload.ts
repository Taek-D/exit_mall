/**
 * @deprecated 2026-05-08 부터 신규 흐름(lib/actions/shipping-upload.ts)으로 이전 중.
 *
 * 현재 사용처(2026-05-27 기준):
 *   - app/(user)/orders/upload/UploadForm.tsx — uploadOrderExcelAction 호출
 *
 * 위 사용처를 shipping-upload.ts의 requestShippingUploadAction 또는
 * requestPurchasedShippingUploadAction으로 마이그레이션한 후 본 파일을 삭제해야 한다.
 * 마이그레이션은 UI 흐름 변경(검증·매칭 단계 추가)을 동반하므로 별도 PR로 처리한다.
 *
 * 신규 코드에서는 절대 import 하지 말 것.
 */
'use server';
import { createClient } from '@/lib/supabase/server';
import { parseOrderExcel } from '@/lib/order-upload-parser';
import { mutationTable, revalidatePaths } from '@/lib/actions/_shared';
import type { Json } from '@/lib/db-types';
import { safeStorageName, validateExcelUpload } from '@/lib/files/excel';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export type UploadOrderResult =
  | { ok: true; uploadId: string }
  | { ok: false; error: string };

export async function uploadOrderExcelAction(fd: FormData): Promise<UploadOrderResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const upload = await validateExcelUpload(fd.get('file'), {
    maxBytes: MAX_BYTES,
    sizeLabel: '5MB',
    extensionMessage: '.xlsx 파일만 업로드할 수 있습니다. (.xls 구포맷은 지원하지 않아요.)',
  });
  if (!upload.ok) return upload;
  const { file, buffer } = upload;

  // Parse first; only persist when parsing succeeds.
  let parsed;
  try {
    parsed = await parseOrderExcel(buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '엑셀을 파싱할 수 없습니다.';
    return { ok: false, error: msg };
  }

  // Upload original file to storage at <user_id>/<timestamp>-<filename>
  const safeName = safeStorageName(file.name, { allowKorean: true });
  const storagePath = `${u.user.id}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('order-uploads')
    .upload(storagePath, buffer, {
      contentType:
        file.type ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (upErr) return { ok: false, error: `파일 업로드 실패: ${upErr.message}` };

  const { data: row, error: insErr } = await mutationTable(supabase, 'order_uploads')
    .insert({
      user_id: u.user.id,
      storage_path: storagePath,
      original_name: file.name,
      order_date: parsed.order_date,
      buyer_order_number: parsed.buyer_order_number,
      company_name: parsed.company_name,
      contact_person: parsed.contact_person,
      buyer_phone: parsed.buyer_phone,
      buyer_email: parsed.buyer_email,
      shipping_address: parsed.shipping_address,
      request_memo: parsed.request_memo,
      items: parsed.items as Json,
      total_quantity: parsed.total_quantity,
      total_amount: parsed.total_amount,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insErr) {
    // Rollback storage on DB failure
    await supabase.storage.from('order-uploads').remove([storagePath]);
    return { ok: false, error: `저장 실패: ${insErr.message}` };
  }

  revalidatePaths(['/orders/upload', '/admin/order-uploads']);
  return { ok: true, uploadId: row.id };
}
