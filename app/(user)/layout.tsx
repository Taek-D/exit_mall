import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NavUser } from '@/components/NavUser';
import { LowBalanceBanner } from '@/components/LowBalanceBanner';
import { CartProvider } from '@/components/CartProvider';
import { Toaster } from '@/components/ui/toaster';

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles')
    .select('name,deposit_balance,low_balance_threshold').eq('id', user.id)
    .single<{ name: string; deposit_balance: number; low_balance_threshold: number }>();
  if (!profile) redirect('/login');

  return (
    <CartProvider>
      <NavUser balance={Number(profile.deposit_balance)} name={profile.name} />
      <LowBalanceBanner balance={Number(profile.deposit_balance)} threshold={Number(profile.low_balance_threshold)} />
      <main className="max-w-5xl mx-auto p-4">{children}</main>
      <Toaster />
    </CartProvider>
  );
}
