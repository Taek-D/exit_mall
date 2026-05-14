import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NavUser } from '@/components/NavUser';
import { LowBalanceBanner } from '@/components/LowBalanceBanner';
import { CartProvider } from '@/components/CartProvider';
import { Toaster } from '@/components/ui/toaster';
import { fetchUnreadCount } from '@/lib/inbound/queries';

type ProductLimitRow = {
  id: string;
  per_user_limit: number | null;
};

type PurchasedRow = {
  product_id: string | null;
  quantity: number;
  orders: { user_id: string; status: string } | null;
};

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('name,deposit_balance,low_balance_threshold,user_group')
    .eq('id', user.id)
    .single<{
      name: string;
      deposit_balance: number;
      low_balance_threshold: number;
      user_group: string | null;
    }>();
  if (!profile) redirect('/login');

  const userGroup: 'group1' | 'group2' =
    profile.user_group === 'group2' ? 'group2' : 'group1';
  const isGroup2 = userGroup === 'group2';

  const [{ data: products }, { data: purchased }, inboundUnread] = await Promise.all([
    supabase.from('products').select('id,per_user_limit').is('deleted_at', null),
    supabase
      .from('order_items')
      .select('product_id, quantity, orders!inner(user_id, status)')
      .eq('orders.user_id', user.id)
      .neq('orders.status', 'cancelled'),
    fetchUnreadCount('user'),
  ]);

  const purchasedMap = new Map<string, number>();
  for (const row of (purchased ?? []) as unknown as PurchasedRow[]) {
    if (!row.product_id) continue;
    purchasedMap.set(row.product_id, (purchasedMap.get(row.product_id) ?? 0) + Number(row.quantity ?? 0));
  }
  const cartLimits = Object.fromEntries(
    ((products ?? []) as ProductLimitRow[]).map((product) => [
      product.id,
      {
        perUserLimit: product.per_user_limit,
        alreadyBought: purchasedMap.get(product.id) ?? 0,
      },
    ]),
  );

  return (
    <CartProvider limits={cartLimits}>
      <div className="min-h-screen flex flex-col bg-surface">
        <NavUser
          balance={Number(profile.deposit_balance)}
          name={profile.name}
          inboundUnread={inboundUnread}
          userGroup={userGroup}
        />
        {!isGroup2 && (
          <LowBalanceBanner
            balance={Number(profile.deposit_balance)}
            threshold={Number(profile.low_balance_threshold)}
          />
        )}
        <main className="flex-1 mx-auto max-w-7xl w-full px-4 lg:px-6 py-6 lg:py-8">
          {children}
        </main>
      </div>
      <Toaster />
    </CartProvider>
  );
}
