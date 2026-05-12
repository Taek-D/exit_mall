import { createClient } from '@/lib/supabase/server';

export type AdminUserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  deposit_balance: number;
  low_balance_threshold: number;
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

export type AdminUserDetail = {
  profile: AdminUserProfile;
  orders: AdminUserUnifiedOrder[];
  deposits: AdminUserDeposit[];
  transactions: AdminUserBalanceTx[];
  inventory: AdminUserInventoryRow[];
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

export type AdminUserShippingUploadInput = {
  id: string;
  original_name: string;
  total_quantity: number;
  shipping_fee_total: number;
  status: string;
  created_at: string;
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
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single<AdminUserProfile>(),
    supabase
      .from('stock_orders')
      .select('id, total_amount, status, items, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_uploads')
      .select('id, original_name, total_quantity, shipping_fee_total, status, created_at')
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
    supabase.from('products').select('id, name').eq('is_active', true).order('name'),
  ]);

  if (!profile) return null;

  const stockRows = (stockOrders ?? []) as unknown as AdminUserStockOrderInput[];
  const shippingRows = (shippingUploads ?? []) as unknown as AdminUserShippingUploadInput[];
  const legacyRows = (legacyOrders ?? []) as unknown as AdminUserLegacyOrderInput[];

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
    products: (products ?? []) as unknown as AdminUserProductOption[],
    totalSpent,
  };
}
