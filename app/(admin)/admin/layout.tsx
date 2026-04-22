import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NavAdmin } from '@/components/NavAdmin';
import { Toaster } from '@/components/ui/toaster';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name,role').eq('id', user.id)
    .single<{ name: string; role: string }>();
  if (!profile || profile.role !== 'admin') redirect('/shop');

  return (
    <div>
      <NavAdmin name={profile.name} />
      <main className="max-w-6xl mx-auto p-4">{children}</main>
      <Toaster />
    </div>
  );
}
