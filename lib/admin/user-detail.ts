import { createClient } from '@/lib/supabase/server';
import type { UserGroup } from '@/lib/auth/user-groups';
import { mutationTable } from '@/lib/actions/_shared';
import {
  isPurchasedLotVisibleForShipping,
  sumPurchasedReservationsByLot,
} from '@/lib/purchased-shipping';

export type AdminUserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  deposit_balance: number;
  low_balance_threshold: number;
  user_group: UserGroup | null;
};

export type AdminUserDeposit = {
  id: string;
  amount: number;
  depositor_name: string;
  status: string;
  created_at: string;
};

export type AdminUserBalanceTx = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  memo: string | null;
  created_at: string;
};

export type AdminUserInventoryRow = {
  product_id: string;
  quantity: number;
  products: { name: string } | null;
};

export type AdminUserProductOption = {
  id: string;
  name: string;
};

export type AdminUserCustomInventoryRow = {
  id: string;
  name: string;
  quantity: number;
  updated_at: string;
};

export type AdminPurchasedInventoryLotRow = {
  id: string;
  product_name: string;
  option_name: string | null;
  initial_quantity: number;
  remaining_quantity: number;
  source_type: 'inbound_request' | 'admin_manual';
  created_at: string;
  updated_at: string;
};

export type AdminPurchasedInventoryReservationRow = {
  lot_id: string;
  quantity: number;
};

export type AdminPurchasedInventoryMemoRow = {
  lot_id: string;
  memo: string | null;
  created_at: string;
};

export type AdminPurchasedInventoryRow = Omit<AdminPurchasedInventoryLotRow, 'option_name'> & {
  option_name: string;
  reserved_quantity: number;
  admin_memo: string | null;
};

export type AdminUserDetail = {
  profile: AdminUserProfile;
  orders: AdminUserUnifiedOrder[];
  deposits: AdminUserDeposit[];
  transactions: AdminUserBalanceTx[];
  inventory: AdminUserInventoryRow[];
  customInventory: AdminUserCustomInventoryRow[];
  purchasedInventory: AdminPurchasedInventoryRow[];
  products: AdminUserProductOption[];
  totalSpent: number;
};

export type AdminUserStockOrderInput = {
  id: string;
  total_amount: number;
  status: string;
  items: Array<{ product_name: string; qty: number; subtotal: number }>;
  created_at: string;
};

export type AdminUserShippingUploadKind = 'exitmall' | 'purchased';

export type AdminUserShippingUploadInput = {
  id: string;
  original_name: string;
  total_quantity: number;
  shipping_fee_total: number;
  status: string;
  created_at: string;
  upload_type: AdminUserShippingUploadKind | null;
};

export type AdminUserLegacyOrderInput = {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
};

export type AdminUserUnifiedOrder = {
  id: string;
  kind: 'stock_order' | 'shipping_upload' | 'legacy';
  /** Only present when kind === 'shipping_upload'. Defaults to 'exitmall'
   * for rows missing upload_type (pre-PR uploads). */
  shippingKind?: AdminUserShippingUploadKind;
  status: string;
  amount: number;
  summary: string;
  created_at: string;
};

function summarizeStockItems(items: AdminUserStockOrderInput['items']): string {
  if (items.length === 0) return '(빈 주문)';
  if (items.length === 1) return `${items[0]!.product_name} × ${items[0]!.qty}`;
  return `${items[0]!.product_name} 외 ${items.length - 1}건`;
}

export function mergeUserOrders(input: {
  stock: AdminUserStockOrderInput[];
  shipping: AdminUserShippingUploadInput[];
  legacy: AdminUserLegacyOrderInput[];
}): AdminUserUnifiedOrder[] {
  const stock = input.stock.map<AdminUserUnifiedOrder>((o) => ({
    id: o.id,
    kind: 'stock_order',
    status: o.status,
    amount: Number(o.total_amount),
    summary: summarizeStockItems(o.items),
    created_at: o.created_at,
  }));
  const shipping = input.shipping.map<AdminUserUnifiedOrder>((u) => ({
    id: u.id,
    kind: 'shipping_upload',
    shippingKind: u.upload_type ?? 'exitmall',
    status: u.status,
    amount: Number(u.shipping_fee_total),
    summary: `${u.original_name} · ${u.total_quantity}개`,
    created_at: u.created_at,
  }));
  const legacy = input.legacy.map<AdminUserUnifiedOrder>((o) => ({
    id: o.id,
    kind: 'legacy',
    status: o.status,
    amount: Number(o.total_amount),
    summary: `주문번호 ${o.id.slice(0, 8)}`,
    created_at: o.created_at,
  }));
  return [...stock, ...shipping, ...legacy].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
}

export function isPositiveTransaction(tx: Pick<AdminUserBalanceTx, 'amount'>): boolean {
  return Number(tx.amount) >= 0;
}

export function sumNonCancelledAmounts(
  rows: Array<{ status: string; total_amount: number }>,
): number {
  return rows
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total_amount), 0);
}

export function getInventoryProductName(row: AdminUserInventoryRow): string {
  return row.products?.name ?? '(이름 없음)';
}

export function summarizePurchasedInventoryReservations(
  lots: AdminPurchasedInventoryLotRow[],
  reservations: AdminPurchasedInventoryReservationRow[],
  memoRows: AdminPurchasedInventoryMemoRow[] = [],
): AdminPurchasedInventoryRow[] {
  const reservedByLot = sumPurchasedReservationsByLot(reservations);

  const latestMemoByLot = new Map<string, AdminPurchasedInventoryMemoRow>();
  for (const row of memoRows) {
    const previous = latestMemoByLot.get(row.lot_id);
    if (!previous || previous.created_at < row.created_at) {
      latestMemoByLot.set(row.lot_id, row);
    }
  }

  return lots.map((lot) => ({
    ...lot,
    option_name: lot.option_name ?? '',
    reserved_quantity: reservedByLot.get(lot.id) ?? 0,
    admin_memo: latestMemoByLot.get(lot.id)?.memo?.trim() || null,
  }));
}

export type PurchasedInventorySummaryRow = {
  key: string;
  label: string;
  remaining: number;
  reserved: number;
};

/**
 * 사입재고 로트를 상품명+옵션명 기준으로 합친 잔여 수량 요약.
 *
 * 운영자가 로트를 눈으로 더하던 작업을 대신한다. 옵션이 다르면 다른 물건이라 따로 센다.
 * 예약 수량도 함께 합쳐야 배송대행에 이미 잡힌 분을 가용 재고로 오해하지 않는다.
 */
export function summarizePurchasedInventoryByProduct(
  rows: AdminPurchasedInventoryRow[],
): PurchasedInventorySummaryRow[] {
  const byKey = new Map<string, PurchasedInventorySummaryRow>();

  for (const row of rows) {
    if (row.remaining_quantity <= 0) continue;
    const key = `${row.product_name}\u0000${row.option_name}`;
    const entry = byKey.get(key) ?? {
      key,
      label: row.option_name ? `${row.product_name} (${row.option_name})` : row.product_name,
      remaining: 0,
      reserved: 0,
    };
    entry.remaining += row.remaining_quantity;
    entry.reserved += row.reserved_quantity;
    byKey.set(key, entry);
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

type AdminPurchasedInventoryLotQueryRow = AdminPurchasedInventoryLotRow & {
  inbound_requests?: { status?: string | null } | Array<{ status?: string | null }> | null;
};

export async function fetchAdminUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const supabase = createClient();
  const [
    { data: profile },
    { data: stockOrders },
    { data: shippingUploads },
    { data: legacyOrders },
    { data: deposits },
    { data: transactions },
    { data: inventory },
    { data: products },
    { data: customInventory },
    { data: purchasedLots },
    { data: pendingPurchasedUploads },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single<AdminUserProfile>(),
    supabase
      .from('stock_orders')
      .select('id, total_amount, status, items, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_uploads')
      .select('id, original_name, total_quantity, shipping_fee_total, status, upload_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, total_amount, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('deposit_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('balance_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_inventory')
      .select('product_id, quantity, products(name)')
      .eq('user_id', userId)
      .gt('quantity', 0),
    supabase
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('user_custom_inventory')
      .select('id, name, quantity, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    mutationTable(supabase, 'purchased_inventory_lots')
      .select(
        'id, product_name, option_name, initial_quantity, remaining_quantity, source_type, created_at, updated_at, inbound_requests(status)',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_uploads')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('upload_type', 'purchased'),
  ]);

  if (!profile) return null;

  const stockRows = (stockOrders ?? []) as unknown as AdminUserStockOrderInput[];
  const shippingRows = (shippingUploads ?? []) as unknown as AdminUserShippingUploadInput[];
  const legacyRows = (legacyOrders ?? []) as unknown as AdminUserLegacyOrderInput[];
  const visiblePurchasedLots = ((purchasedLots ?? []) as AdminPurchasedInventoryLotQueryRow[])
    .filter(isPurchasedLotVisibleForShipping)
    .map<AdminPurchasedInventoryLotRow>((row) => ({
      id: row.id,
      product_name: row.product_name,
      option_name: row.option_name,
      initial_quantity: Number(row.initial_quantity),
      remaining_quantity: Number(row.remaining_quantity),
      source_type: row.source_type,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

  const pendingPurchasedUploadIds = ((pendingPurchasedUploads ?? []) as Array<{ id: string }>).map(
    (row) => row.id,
  );

  let purchasedReservations: AdminPurchasedInventoryReservationRow[] = [];
  if (pendingPurchasedUploadIds.length > 0) {
    const { data } = await mutationTable(supabase, 'purchased_shipping_allocations')
      .select('lot_id, quantity')
      .eq('user_id', userId)
      .in('upload_id', pendingPurchasedUploadIds);
    purchasedReservations = (data ?? []) as AdminPurchasedInventoryReservationRow[];
  }

  let purchasedMemoRows: AdminPurchasedInventoryMemoRow[] = [];
  const visiblePurchasedLotIds = visiblePurchasedLots.map((row) => row.id);
  if (visiblePurchasedLotIds.length > 0) {
    const { data } = await mutationTable(supabase, 'purchased_inventory_lot_adjustments')
      .select('lot_id, after_admin_memo, created_at')
      .eq('user_id', userId)
      .in('lot_id', visiblePurchasedLotIds)
      .order('created_at', { ascending: false });
    purchasedMemoRows = ((data ?? []) as Array<{
      lot_id: string;
      after_admin_memo: string | null;
      created_at: string;
    }>).map((row) => ({
      lot_id: row.lot_id,
      memo: row.after_admin_memo,
      created_at: row.created_at,
    }));
  }

  const merged = mergeUserOrders({
    stock: stockRows,
    shipping: shippingRows,
    legacy: legacyRows,
  });

  // totalSpent = stock_orders + legacy orders 중 cancelled 제외 (배송대행 비용은 별도)
  const totalSpent = sumNonCancelledAmounts(stockRows) + sumNonCancelledAmounts(legacyRows);

  return {
    profile,
    orders: merged,
    deposits: (deposits ?? []) as unknown as AdminUserDeposit[],
    transactions: (transactions ?? []) as unknown as AdminUserBalanceTx[],
    inventory: (inventory ?? []) as unknown as AdminUserInventoryRow[],
    customInventory: (customInventory ?? []) as unknown as AdminUserCustomInventoryRow[],
    purchasedInventory: summarizePurchasedInventoryReservations(
      visiblePurchasedLots,
      purchasedReservations,
      purchasedMemoRows,
    ),
    products: buildInventoryProductOptions(
      (inventory ?? []) as unknown as AdminUserInventoryRow[],
      (products ?? []) as unknown as AdminUserProductOption[],
    ),
    totalSpent,
  };
}

/**
 * 재고 수동 조정 드롭다운 목록.
 *
 * 판매중지·삭제된 상품이라도 보유 재고가 남아 있으면 조정할 수 있어야 하므로
 * 보유분을 먼저 싣고, 그 뒤에 미보유 판매중 상품(신규 가산용)을 잇는다.
 * 보유분은 user_inventory 조회가 이미 수량 0 초과만 가져온다.
 */
export function buildInventoryProductOptions(
  inventory: AdminUserInventoryRow[],
  sellableProducts: AdminUserProductOption[],
): AdminUserProductOption[] {
  const byName = (a: AdminUserProductOption, b: AdminUserProductOption) =>
    a.name.localeCompare(b.name, 'ko');
  const ownedIds = new Set(inventory.map((row) => row.product_id));

  return [
    ...inventory
      .map((row) => ({ id: row.product_id, name: getInventoryProductName(row) }))
      .sort(byName),
    ...sellableProducts.filter((p) => !ownedIds.has(p.id)).sort(byName),
  ];
}
