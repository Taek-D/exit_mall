import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/AdminSidebar';
import { AdminHeader } from '@/components/AdminHeader';
import { Toaster } from '@/components/ui/toaster';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('name,role')
    .eq('id', user.id)
    .single<{ name: string; role: string }>();
  if (!profile || profile.role !== 'admin') redirect('/shop');

  return (
    <div className="min-h-screen flex bg-surface">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader name={profile.name} email={user.email} />
        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
