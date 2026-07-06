import { createClient } from '@/lib/supabase/server';

export type AdminStockOrderItem = {
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
};

export type AdminStockOrderDetail = {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  items: AdminStockOrderItem[];
  admin_memo: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles: { name: string; email: string; phone: string; deposit_balance: number } | null;
};

export type AdminShippingUploadItem = {
  no: number;
  internal_code: string | null;
  recipient: string;
  phone: string;
  address: string;
  product_code: string;
  product_name: string | null;
  quantity: number;
  memo: string | null;
  tracking_number: string | null;
};

export type AdminShippingUploadDetail = {
  id: string;
  user_id: string;
  upload_type?: 'exitmall' | 'purchased';
  storage_path: string;
  original_name: string;
  status: string;
  items: AdminShippingUploadItem[];
  total_quantity: number;
  shipping_fee_total: number;
  admin_memo: string | null;
  admin_storage_path: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  created_at: string;
  profiles: { name: string; email: string; phone: string; deposit_balance: number } | null;
};

export function hasInsufficientBalance(status: string, balance: number, required: number): boolean {
  return status === 'pending' && Number(balance) < Number(required);
}

export async function fetchAdminStockOrderDetail(orderId: string): Promise<{
  order: AdminStockOrderDetail | null;
  legacyExists: boolean;
}> {
  const supabase = createClient();
  const { data } = await supabase
    .from('stock_orders')
    .select('*,profiles!stock_orders_user_id_fkey(name,email,phone,deposit_balance)')
    .eq('id', orderId)
    .maybeSingle();

  if (data) {
    return { order: data as unknown as AdminStockOrderDetail, legacyExists: false };
  }

  const { data: legacy } = await supabase.from('orders').select('id').eq('id', orderId).maybeSingle();
  return { order: null, legacyExists: Boolean(legacy) };
}

export async function fetchAdminShippingUploadDetail(
  uploadId: string,
  uploadType?: 'exitmall' | 'purchased',
): Promise<AdminShippingUploadDetail | null> {
  const supabase = createClient();
  let query = supabase
    .from('order_uploads')
    .select('*, profiles!order_uploads_user_id_fkey(name,email,phone,deposit_balance)')
    .eq('id', uploadId);

  if (uploadType) query = query.eq('upload_type', uploadType);

  const { data } = await query.single<AdminShippingUploadDetail>();

  return data ?? null;
}
