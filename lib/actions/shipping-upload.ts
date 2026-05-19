'use server';
import { createClient } from '@/lib/supabase/server';
import { parseShippingExcel, computeShippingFee } from '@/lib/shipping-upload-parser';
import { callRpc, mutationTable, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { matchInventoryRefs } from '@/lib/shipping-match';
import type { Json } from '@/lib/db-types';
import { safeStorageName, validateExcelUpload } from '@/lib/files/excel';
import {
  allocatePurchasedInventoryFifo,
  type PurchasedInventoryLot,
  type PurchasedShippingDemand,
} from '@/lib/purchased-shipping';

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

  // 엑시트몰 배송대행은 엑시트몰 상품 재고만 매칭한다.
  const productNames = Array.from(new Set(parsed.items.map((it) => it.product_code)));
  const { data: productRows } = await supabase
    .from('products')
    .select('id, name')
    .in('name', productNames);

  const match = matchInventoryRefs(
    productNames,
    (productRows ?? []) as Array<{ id: string; name: string }>,
    [],
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
    return { ...it, product_id: ref.id };
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
      upload_type: 'exitmall',
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

type PurchasedLotRow = {
  id: string;
  product_name: string;
  option_name: string | null;
  remaining_quantity: number;
  created_at: string;
};

type PurchasedAllocationRow = {
  lot_id: string;
  quantity: number;
};

async function fetchPurchasedLotsForUpload(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  productNames: string[],
): Promise<PurchasedInventoryLot[]> {
  const { data: lotData } = await (supabase.from as any)('purchased_inventory_lots')
    .select('id, product_name, option_name, remaining_quantity, created_at, inbound_requests!inner(status)')
    .eq('user_id', userId)
    .eq('inbound_requests.status', 'completed')
    .in('product_name', productNames)
    .order('created_at', { ascending: true });

  const lots = (lotData ?? []) as PurchasedLotRow[];
  if (lots.length === 0) return [];

  const { data: pendingUploads } = await supabase
    .from('order_uploads')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('upload_type', 'purchased');

  const pendingIds = ((pendingUploads ?? []) as Array<{ id: string }>).map((row) => row.id);
  const reservedByLot = new Map<string, number>();
  if (pendingIds.length > 0) {
    const { data: allocations } = await (supabase.from as any)('purchased_shipping_allocations')
      .select('lot_id, quantity')
      .eq('user_id', userId)
      .in('upload_id', pendingIds);
    for (const allocation of (allocations ?? []) as PurchasedAllocationRow[]) {
      reservedByLot.set(
        allocation.lot_id,
        (reservedByLot.get(allocation.lot_id) ?? 0) + Number(allocation.quantity),
      );
    }
  }

  return lots.map((lot) => ({
    id: lot.id,
    product_name: lot.product_name,
    option_name: lot.option_name ?? '',
    available_quantity: Math.max(
      0,
      Number(lot.remaining_quantity) - (reservedByLot.get(lot.id) ?? 0),
    ),
    created_at: lot.created_at,
  }));
}

export async function requestPurchasedShippingUploadAction(
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

  const demands: PurchasedShippingDemand[] = parsed.items.map((item) => ({
    item_no: item.no,
    product_name: item.product_code,
    option_name: item.product_name ?? '',
    quantity: item.quantity,
  }));
  const productNames = Array.from(new Set(demands.map((demand) => demand.product_name)));
  const lots = await fetchPurchasedLotsForUpload(supabase, u.user.id, productNames);
  const allocation = allocatePurchasedInventoryFifo(lots, demands);
  if (!allocation.ok) {
    const shown = allocation.shortages
      .slice(0, 3)
      .map((s) =>
        `${s.product_name}${s.option_name ? ` / ${s.option_name}` : ''} (요청 ${s.requested}, 가능 ${s.available})`,
      )
      .join(', ');
    const more = allocation.shortages.length > 3 ? ' 외' : '';
    return { ok: false, error: `입고완료 재고가 부족합니다: ${shown}${more}` };
  }

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
  const { data: uploadId, error: rpcErr } = await callRpc(
    supabase,
    'create_purchased_shipping_upload',
    {
      p_storage_path: storagePath,
      p_original_name: file.name,
      p_contact_person: parsed.uploader_company,
      p_buyer_phone: parsed.uploader_phone,
      p_request_memo: parsed.request_memo,
      p_items: parsed.items as Json,
      p_total_quantity: parsed.total_quantity,
      p_shipping_fee_total: fee,
      p_allocations: allocation.allocations as Json,
    },
  );
  if (rpcErr || !uploadId) {
    await supabase.storage.from('order-uploads').remove([storagePath]);
    console.error('[shipping-upload] create purchased', rpcErr);
    return { ok: false, error: `저장 실패: ${rpcErr?.message ?? 'unknown'}` };
  }

  revalidatePaths([
    '/shipping-uploads/purchased',
    '/admin/shipping-uploads/purchased',
    '/inventory',
  ]);
  return { ok: true, uploadId: uploadId as string };
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
  revalidatePaths([
    '/shipping-uploads',
    '/shipping-uploads/exitmall',
    '/shipping-uploads/purchased',
  ]);
  return { ok: true };
}
