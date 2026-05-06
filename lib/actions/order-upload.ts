'use server';
import { createClient } from '@/lib/supabase/server';
import { parseOrderExcel } from '@/lib/order-upload-parser';
import { revalidatePath } from 'next/cache';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
// .xls (legacy OLE2) is intentionally rejected — it has a much larger parser surface and
// known XLM macro / formula injection vectors. Only the modern OOXML zip format is allowed.
const ALLOWED_EXTS = ['.xlsx'];
// PK\x03\x04 is the magic number for ZIP/OOXML files. Anything else (CFB/OLE2 .xls,
// renamed binaries, archives without proper structure) is rejected up front.
const OOXML_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type UploadOrderResult =
  | { ok: true; uploadId: string }
  | { ok: false; error: string };

export async function uploadOrderExcelAction(fd: FormData): Promise<UploadOrderResult> {
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
  const lowered = file.name.toLowerCase();
  if (!ALLOWED_EXTS.some((ext) => lowered.endsWith(ext))) {
    return { ok: false, error: '.xlsx 파일만 업로드할 수 있습니다. (.xls 구포맷은 지원하지 않아요.)' };
  }

  // Read once and check the magic number before handing the buffer to the parser.
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(OOXML_MAGIC)) {
    return { ok: false, error: '엑셀(.xlsx) 파일 형식이 아닙니다.' };
  }

  // Parse first; only persist when parsing succeeds.
  let parsed;
  try {
    parsed = parseOrderExcel(buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '엑셀을 파싱할 수 없습니다.';
    return { ok: false, error: msg };
  }

  // Upload original file to storage at <user_id>/<timestamp>-<filename>
  const safeName = file.name.replace(/[^\w가-힣\.\-]+/g, '_');
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

  const { data: row, error: insErr } = await (supabase.from('order_uploads') as any)
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
      items: parsed.items,
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

  revalidatePath('/orders/upload');
  revalidatePath('/admin/order-uploads');
  return { ok: true, uploadId: (row as { id: string }).id };
}
