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

export type AdminUserOrder = {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
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
  orders: AdminUserOrder[];
  deposits: AdminUserDeposit[];
  transactions: AdminUserBalanceTx[];
  inventory: AdminUserInventoryRow[];
  products: AdminUserProductOption[];
  totalSpent: number;
};

export function calculateTotalSpent(orders: AdminUserOrder[]): number {
  return orders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + Number(order.total_amount), 0);
}

export function isPositiveTransaction(tx: Pick<AdminUserBalanceTx, 'amount'>): boolean {
  return Number(tx.amount) >= 0;
}

export function getInventoryProductName(row: AdminUserInventoryRow): string {
  return row.products?.name ?? '(이름 없음)';
}

export async function fetchAdminUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const supabase = createClient();
  const [
    { data: profile },
    { data: orders },
    { data: deposits },
    { data: transactions },
    { data: inventory },
    { data: products },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single<AdminUserProfile>(),
    supabase
      .from('orders')
      .select('id,total_amount,status,created_at')
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

  const orderRows = (orders ?? []) as unknown as AdminUserOrder[];
  return {
    profile,
    orders: orderRows,
    deposits: (deposits ?? []) as unknown as AdminUserDeposit[],
    transactions: (transactions ?? []) as unknown as AdminUserBalanceTx[],
    inventory: (inventory ?? []) as unknown as AdminUserInventoryRow[],
    products: (products ?? []) as unknown as AdminUserProductOption[],
    totalSpent: calculateTotalSpent(orderRows),
  };
}
