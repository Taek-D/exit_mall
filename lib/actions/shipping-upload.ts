'use server';
import { createClient } from '@/lib/supabase/server';
import { parseShippingExcel, computeShippingFee } from '@/lib/shipping-upload-parser';
import { callRpc, mutationTable, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { requireSignedIn, type SignedInContext } from '@/lib/actions/_guards';
import {
  matchInventoryRefs,
  normalizeProductMatchKey,
  collectPendingOrderProductIds,
  mergeProductCandidates,
  buildInventoryMatchError,
} from '@/lib/shipping-match';
import type { Json } from '@/lib/db-types';
import { safeStorageName, validateExcelUpload } from '@/lib/files/excel';
import {
  allocatePurchasedInventoryFifo,
  buildPurchasedLotsForUpload,
  detectPurchasedInventoryAmbiguities,
  sumPurchasedReservationsByLot,
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

/**
 * ① 배송대행 후보 조회. 후보는 정확히 세 소스의 합집합이다:
 *   1) 보유 재고 — user_inventory에서 수량 > 0인 행, 현재 상품명으로 해석(수량 0으로 소진된 상품은 후보 아님).
 *   2) 진행 중인 구매요청 — status='pending' stock_orders의 items[].product_id, 현재 상품명으로 해석.
 *   3) 수기 재고 — user_custom_inventory.
 * 활성 카탈로그 전체는 후보가 아니라, 매칭 실패 메시지 분기를 위한 진단(catalogNames)으로만 쓴다.
 */
async function fetchProductCandidates(
  supabase: SignedInContext['supabase'],
  userId: string,
): Promise<
  | {
      ok: true;
      mergedProducts: ProductCandidate[];
      customRows: Array<{ id: string; name: string }>;
      catalogNames: string[];
    }
  | { ok: false; error: string }
> {
  const [
    { data: catalogRows, error: catalogErr },
    { data: ownedInventoryRows, error: ownedErr },
    { data: customRows, error: customErr },
    { data: pendingOrderRows, error: pendingErr },
  ] = await Promise.all([
    // 진단 전용: 활성+삭제되지 않은 카탈로그 이름. 후보 자격을 부여하지 않는다.
    supabase
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .is('deleted_at', null),
    // 소스1: 보유 재고 — 수량 > 0인 행만(수량 0으로 소진된 상품은 후보 아님, 재고가 있어야 배송대행 성립).
    supabase
      .from('user_inventory')
      .select('products(id, name)')
      .eq('user_id', userId)
      .gt('quantity', 0),
    // 소스3: 수기 재고.
    supabase
      .from('user_custom_inventory')
      .select('id, name')
      .eq('user_id', userId),
    // 소스2: 진행 중인 구매요청.
    supabase
      .from('stock_orders')
      .select('status, items')
      .eq('user_id', userId)
      .eq('status', 'pending'),
  ]);
  if (catalogErr || ownedErr || customErr || pendingErr) {
    const message =
      catalogErr?.message ?? ownedErr?.message ?? customErr?.message ?? pendingErr?.message ?? 'unknown';
    return { ok: false, error: `상품 후보 조회에 실패했습니다: ${message}` };
  }

  // 소스1: 보유 재고 상품(현재 상품명).
  const ownedInventoryProducts: ProductCandidate[] = [];
  const ownedIds = new Set<string>();
  for (const row of (ownedInventoryRows ?? []) as Array<{
    products: ProductCandidate | ProductCandidate[] | null;
  }>) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    if (product && !ownedIds.has(product.id)) {
      ownedIds.add(product.id);
      ownedInventoryProducts.push({ id: product.id, name: product.name });
    }
  }

  // 소스2: 진행 중인 구매요청의 상품 id → 현재 상품명으로 해석.
  //   is_active/deleted_at 필터 없이 조회한다(요청 이후 비활성/소프트삭제된 상품도 후보 유지).
  //   products 행이 아예 없어 이름을 얻을 수 없는 경우에만 제외한다. 진단 카탈로그 쿼리를 재사용하지 않는다.
  const pendingProductIds = collectPendingOrderProductIds(
    (pendingOrderRows ?? []) as Array<{ status: string; items: unknown }>,
  );
  const missingPendingIds = pendingProductIds.filter((id) => !ownedIds.has(id));
  const pendingOrderProducts: ProductCandidate[] = [];
  if (missingPendingIds.length > 0) {
    const { data: pendingProducts, error: pendingProductsErr } = await supabase
      .from('products')
      .select('id, name')
      .in('id', missingPendingIds);
    if (pendingProductsErr) {
      return { ok: false, error: `상품 후보 조회에 실패했습니다: ${pendingProductsErr.message}` };
    }
    for (const row of (pendingProducts ?? []) as ProductCandidate[]) {
      pendingOrderProducts.push({ id: row.id, name: row.name });
    }
  }

  return {
    ok: true,
    mergedProducts: mergeProductCandidates({ ownedInventoryProducts, pendingOrderProducts }),
    customRows: (customRows ?? []) as Array<{ id: string; name: string }>,
    catalogNames: ((catalogRows ?? []) as ProductCandidate[]).map((row) => row.name),
  };
}

/** ② 파싱된 행을 product/custom inventory 참조로 해석한다. */
function resolveInventoryReferences(
  parsedItems: Awaited<ReturnType<typeof parseShippingExcel>>['items'],
  mergedProducts: ProductCandidate[],
  customRows: Array<{ id: string; name: string }>,
  catalogNames: string[],
):
  | { ok: true; itemsWithRef: Array<Record<string, unknown>> }
  | { ok: false; error: string } {
  const productNames = Array.from(new Set(parsedItems.map((it) => it.product_code)));
  const match = matchInventoryRefs(productNames, mergedProducts, customRows);
  if (!match.ok) {
    return { ok: false, error: buildInventoryMatchError(match, catalogNames) };
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
    candidates.catalogNames,
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
  const { data: lotData, error: lotErr } = await mutationTable(supabase, 'purchased_inventory_lots')
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
  let reservedByLot = new Map<string, number>();
  if (pendingIds.length > 0) {
    const { data: allocations, error: allocationsErr } = await mutationTable(
      supabase,
      'purchased_shipping_allocations',
    )
      .select('lot_id, quantity')
      .eq('user_id', userId)
      .in('upload_id', pendingIds);
    if (allocationsErr) {
      throw new Error(`대기 중인 사입재고 배정 조회에 실패했습니다: ${allocationsErr.message}`);
    }
    reservedByLot = sumPurchasedReservationsByLot((allocations ?? []) as PurchasedAllocationRow[]);
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
