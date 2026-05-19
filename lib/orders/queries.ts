import { createClient } from '@/lib/supabase/server';
import type { ShippingUploadStatus, StockOrderStatus } from '@/lib/types';

export type CountMap = Record<string, number>;
export type ShippingUploadType = 'exitmall' | 'purchased';

export type StockOrderItem = {
  product_id?: string;
  product_name: string;
  qty: number;
  subtotal: number;
};

export type AdminStockOrderRow = {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  items: StockOrderItem[];
  created_at: string;
  profiles: { name: string } | null;
};

export type MyStockOrderRow = {
  id: string;
  total_amount: number;
  status: string;
  items: StockOrderItem[];
  admin_memo: string | null;
  created_at: string;
};

export type LegacyOrderItem = {
  product_name: string;
  quantity: number;
  subtotal: number;
};

export type LegacyOrderRow = {
  id: string;
  total_amount: number;
  status: string;
  shipping_name: string;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  order_items: LegacyOrderItem[];
};

export type ShippingUploadRow = {
  id: string;
  user_id?: string;
  upload_type?: ShippingUploadType;
  original_name: string;
  status: string;
  total_quantity: number;
  shipping_fee_total: number;
  admin_memo?: string | null;
  created_at: string;
  profiles?: { name: string } | null;
};

function countStatuses(rows: Array<{ status: string }> | null): CountMap {
  return (rows ?? []).reduce<CountMap>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    acc.all = (acc.all ?? 0) + 1;
    return acc;
  }, {});
}

export function summarizeStockItems(items: StockOrderItem[]): string {
  if (items.length === 0) return '(빈 주문)';
  if (items.length === 1) return `${items[0]!.product_name} × ${items[0]!.qty}`;
  return `${items[0]!.product_name} 외 ${items.length - 1}건`;
}

export async function fetchAdminStockOrders(status: StockOrderStatus | 'all') {
  const supabase = createClient();
  let query = supabase
    .from('stock_orders')
    .select('id,user_id,total_amount,status,items,created_at,profiles!stock_orders_user_id_fkey(name)')
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const [{ data }, { data: countRows }] = await Promise.all([
    query,
    supabase.from('stock_orders').select('status'),
  ]);

  return {
    rows: (data ?? []) as unknown as AdminStockOrderRow[],
    counts: countStatuses(countRows),
  };
}

export async function fetchMyOrders() {
  const supabase = createClient();
  const [stockRes, legacyRes] = await Promise.all([
    supabase
      .from('stock_orders')
      .select('id,total_amount,status,items,admin_memo,created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select(
        'id,total_amount,status,shipping_name,tracking_number,carrier,created_at,order_items(product_name,quantity,unit_price,subtotal)',
      )
      .order('created_at', { ascending: false }),
  ]);

  return {
    stockOrders: (stockRes.data ?? []) as unknown as MyStockOrderRow[],
    legacyOrders: (legacyRes.data ?? []) as unknown as LegacyOrderRow[],
  };
}

export async function fetchAdminShippingUploads(
  status: ShippingUploadStatus | 'all',
  uploadType: ShippingUploadType = 'exitmall',
) {
  const supabase = createClient();
  let query = supabase
    .from('order_uploads')
    .select(
      'id, user_id, upload_type, original_name, status, total_quantity, shipping_fee_total, created_at, profiles!order_uploads_user_id_fkey(name)',
    )
    .eq('upload_type', uploadType)
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const [{ data }, { data: countRows }] = await Promise.all([
    query,
    supabase.from('order_uploads').select('status').eq('upload_type', uploadType),
  ]);

  return {
    rows: (data ?? []) as unknown as ShippingUploadRow[],
    counts: countStatuses(countRows),
  };
}

export async function fetchRecentShippingUploads(
  limit = 30,
  uploadType: ShippingUploadType = 'exitmall',
) {
  const supabase = createClient();
  const { data } = await supabase
    .from('order_uploads')
    .select('id, upload_type, original_name, status, total_quantity, shipping_fee_total, admin_memo, created_at')
    .eq('upload_type', uploadType)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as ShippingUploadRow[];
}
