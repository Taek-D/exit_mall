'use server';
import { createClient } from '@/lib/supabase/server';
import { parseShippingExcel, computeShippingFee } from '@/lib/shipping-upload-parser';
import { callRpc, mutationTable, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { requireSignedIn, type SignedInContext } from '@/lib/actions/_guards';
import { matchInventoryRefs, normalizeProductMatchKey } from '@/lib/shipping-match';
import type { Json } from '@/lib/db-types';
import { safeStorageName, validateExcelUpload } from '@/lib/files/excel';
import {
  allocatePurchasedInventoryFifo,
  buildPurchasedLotsForUpload,
  detectPurchasedInventoryAmbiguities,
  type PurchasedInventoryLot,
  type PurchasedLotForUploadRow,
  type PurchasedShippingDemand,
} from '@/lib/purchased-shipping';

const MAX_BYTES = 5 * 1024 * 1024;

export type RequestShippingUploadResult =
  | { ok: true; uploadId: string }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// Exitmall shipping upload — Phase 2.4 분할 (4단)
// ─────────────────────────────────────────────────────────────────────────────

type ProductCandidate = { id: string; name: string };

/** ① 활성 카탈로그 + 사용자 보유 재고 + 커스텀 인벤토리 3-way 후보 조회. */
async function fetchProductCandidates(
  supabase: SignedInContext['supabase'],
  userId: string,
): Promise<
  | { ok: true; mergedProducts: ProductCandidate[]; customRows: Array<{ id: string; name: string }> }
  | { ok: false; error: string }
> {
  const [
    { data: productRows, error: productErr },
    { data: ownedInventoryRows, error: ownedErr },
    { data: customRows, error: customErr },
  ] = await Promise.all([
    supabase
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .is('deleted_at', null),
    supabase
      .from('user_inventory')
      .select('products(id, name)')
      .eq('user_id', userId),
    supabase
      .from('user_custom_inventory')
      .select('id, name')
      .eq('user_id', userId),
  ]);
  if (productErr || ownedErr || customErr) {
    const message = productErr?.message ?? ownedErr?.message ?? customErr?.message ?? 'unknown';
    return { ok: false, error: `상품 후보 조회에 실패했습니다: ${message}` };
  }

  // 활성+삭제되지 않은 카탈로그 외에, 사용자가 user_inventory 로 이미 보유 중인
  // 상품도 후보에 포함한다 (사후 비활성화된 상품도 보유 시 처리 가능).
  const productById = new Map<string, ProductCandidate>();
  for (const row of (productRows ?? []) as ProductCandidate[]) {
    productById.set(row.id, row);
  }
  for (const row of (ownedInventoryRows ?? []) as Array<{
    products: ProductCandidate | ProductCandidate[] | null;
  }>) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    if (product && !productById.has(product.id)) {
      productById.set(product.id, { id: product.id, name: product.name });
    }
  }
  return {
    ok: true,
    mergedProducts: Array.from(productById.values()),
    customRows: (customRows ?? []) as Array<{ id: string; name: string }>,
  };
}

/** ② 파싱된 행을 product/custom inventory 참조로 해석한다. */
function resolveInventoryReferences(
  parsedItems: Awaited<ReturnType<typeof parseShippingExcel>>['items'],
  mergedProducts: ProductCandidate[],
  customRows: Array<{ id: string; name: string }>,
):
  | { ok: true; itemsWithRef: Array<Record<string, unknown>> }
  | { ok: false; error: string } {
  const productNames = Array.from(new Set(parsedItems.map((it) => it.product_code)));
  const match = matchInventoryRefs(productNames, mergedProducts, customRows);
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
    return { ok: false, error: `존재하지 않는 상품명이 있습니다: ${shown}${more}` };
  }

  const productNameById = new Map(mergedProducts.map((row) => [row.id, row.name]));
  const customNameById = new Map(customRows.map((row) => [row.id, row.name]));
  const itemsWithRef = parsedItems.map((it) => {
    const ref = match.refs.get(it.product_code)!;
    if (ref.kind === 'product') {
      return {
        ...it,
        product_code: productNameById.get(ref.id) ?? it.product_code,
        product_id: ref.id,
      };
    }
    return {
      ...it,
      product_code: customNameById.get(ref.id) ?? it.product_code,
      custom_inventory_id: ref.id,
    };
  });
  return { ok: true, itemsWithRef };
}

/** ③ 엑셀 storage 업로드 (실패 시 에러 반환). */
async function uploadShippingExcel(
  supabase: SignedInContext['supabase'],
  userId: string,
  file: File,
  buffer: Buffer,
): Promise<{ ok: true; storagePath: string } | { ok: false; error: string }> {
  const safeName = safeStorageName(file.name, { allowKorean: true });
  const storagePath = `${userId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('order-uploads')
    .upload(storagePath, buffer, {
      contentType:
        file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (upErr) return { ok: false, error: `파일 업로드 실패: ${upErr.message}` };
  return { ok: true, storagePath };
}

export async function requestShippingUploadAction(
  fd: FormData,
): Promise<RequestShippingUploadResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user } = guard;

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

  const candidates = await fetchProductCandidates(supabase, user.id);
  if (!candidates.ok) return candidates;

  const resolved = resolveInventoryReferences(
    parsed.items,
    candidates.mergedProducts,
    candidates.customRows,
  );
  if (!resolved.ok) return resolved;

  const uploaded = await uploadShippingExcel(supabase, user.id, file, buffer);
  if (!uploaded.ok) return uploaded;
  const { storagePath } = uploaded;

  const fee = computeShippingFee(parsed.items.length);
  const { data: row, error: insErr } = await mutationTable(supabase, 'order_uploads')
    .insert({
      user_id: user.id,
      upload_type: 'exitmall',
      storage_path: storagePath,
      original_name: file.name,
      contact_person: parsed.uploader_company,
      buyer_phone: parsed.uploader_phone,
      request_memo: parsed.request_memo,
      items: resolved.itemsWithRef as Json,
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

// ─────────────────────────────────────────────────────────────────────────────
// Purchased shipping upload — Phase 2.4 분할 (3단)
// ─────────────────────────────────────────────────────────────────────────────

type PurchasedAllocationRow = {
  lot_id: string;
  quantity: number;
};

// purchased-shipping.ts의 keyOf와 동일한 NULL 바이트(\u0000) 구분자 정책을 따른다.
// 정규화(normalizeProductMatchKey) 결과에는 NULL 바이트가 등장하지 않으므로 충돌 없는 구분자다.
// 두 정의가 동일 정책을 공유함을 명시 — 한쪽을 변경하면 반드시 다른 쪽도 함께 변경할 것.
function purchasedMatchKey(productName: string, optionName: string): string {
  return `${normalizeProductMatchKey(productName)}\u0000${normalizeProductMatchKey(optionName)}`;
}

async function fetchPurchasedLotsForUpload(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<PurchasedInventoryLot[]> {
  const { data: lotData, error: lotErr } = await (supabase.from as any)('purchased_inventory_lots')
    .select('id, product_name, option_name, remaining_quantity, created_at, source_type, inbound_requests(status)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (lotErr) throw new Error(`사입재고 후보 조회에 실패했습니다: ${lotErr.message}`);

  const lotRows = (lotData ?? []) as PurchasedLotForUploadRow[];
  if (lotRows.length === 0) return [];

  const { data: pendingUploads, error: pendingErr } = await supabase
    .from('order_uploads')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('upload_type', 'purchased');
  if (pendingErr) throw new Error(`대기 중인 배송대행 업로드 조회에 실패했습니다: ${pendingErr.message}`);

  const pendingIds = ((pendingUploads ?? []) as Array<{ id: string }>).map((row) => row.id);
  const reservedByLot = new Map<string, number>();
  if (pendingIds.length > 0) {
    const { data: allocations, error: allocationsErr } = await (supabase.from as any)('purchased_shipping_allocations')
      .select('lot_id, quantity')
      .eq('user_id', userId)
      .in('upload_id', pendingIds);
    if (allocationsErr) {
      throw new Error(`대기 중인 사입재고 배정 조회에 실패했습니다: ${allocationsErr.message}`);
    }
    for (const allocation of (allocations ?? []) as PurchasedAllocationRow[]) {
      reservedByLot.set(
        allocation.lot_id,
        (reservedByLot.get(allocation.lot_id) ?? 0) + Number(allocation.quantity),
      );
    }
  }

  return buildPurchasedLotsForUpload(lotRows, reservedByLot);
}

type SuccessfulFifoAllocation = Extract<
  ReturnType<typeof allocatePurchasedInventoryFifo>,
  { ok: true }
>;

/** Demand 구성 + ambiguity/FIFO 배정 + lotByItemNo 매핑까지 한 번에 처리. */
function allocatePurchasedShippingDemands(
  parsedItems: Awaited<ReturnType<typeof parseShippingExcel>>['items'],
  lots: PurchasedInventoryLot[],
):
  | {
      ok: true;
      itemsForRpc: Array<Record<string, unknown>>;
      allocations: SuccessfulFifoAllocation['allocations'];
    }
  | { ok: false; error: string } {
  const demands: PurchasedShippingDemand[] = parsedItems.map((item) => ({
    item_no: item.no,
    product_name: item.product_code,
    option_name: item.product_name ?? '',
    quantity: item.quantity,
  }));

  const demandKeys = new Set(
    demands.map((demand) => purchasedMatchKey(demand.product_name, demand.option_name)),
  );
  const relevantLots = lots.filter((lot) =>
    demandKeys.has(purchasedMatchKey(lot.product_name, lot.option_name)),
  );
  const ambiguities = detectPurchasedInventoryAmbiguities(relevantLots);
  if (ambiguities.length > 0) {
    const shown = ambiguities
      .slice(0, 3)
      .map((ambiguity) => ambiguity.labels.join(' / '))
      .join(', ');
    const more = ambiguities.length > 3 ? ' 외' : '';
    return { ok: false, error: `공백 제거 후 같은 사입재고명이 여러 개 있습니다: ${shown}${more}` };
  }

  const allocation = allocatePurchasedInventoryFifo(relevantLots, demands);
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

  const lotById = new Map(relevantLots.map((lot) => [lot.id, lot]));
  const lotByItemNo = new Map<number, PurchasedInventoryLot>();
  for (const itemAllocation of allocation.allocations) {
    if (!lotByItemNo.has(itemAllocation.item_no)) {
      const lot = lotById.get(itemAllocation.lot_id);
      if (lot) lotByItemNo.set(itemAllocation.item_no, lot);
    }
  }
  const itemsForRpc = parsedItems.map((item) => {
    const lot = lotByItemNo.get(item.no);
    return lot
      ? { ...item, product_code: lot.product_name, product_name: lot.option_name }
      : item;
  });

  return { ok: true, itemsForRpc, allocations: allocation.allocations };
}

export async function requestPurchasedShippingUploadAction(
  fd: FormData,
): Promise<RequestShippingUploadResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user } = guard;

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

  let lots: PurchasedInventoryLot[];
  try {
    lots = await fetchPurchasedLotsForUpload(supabase, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '사입재고 후보 조회에 실패했습니다.' };
  }

  const allocated = allocatePurchasedShippingDemands(parsed.items, lots);
  if (!allocated.ok) return allocated;
  const { itemsForRpc, allocations } = allocated;

  const uploaded = await uploadShippingExcel(supabase, user.id, file, buffer);
  if (!uploaded.ok) return uploaded;
  const { storagePath } = uploaded;

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
      p_items: itemsForRpc as Json,
      p_total_quantity: parsed.total_quantity,
      p_shipping_fee_total: fee,
      p_allocations: allocations as Json,
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
