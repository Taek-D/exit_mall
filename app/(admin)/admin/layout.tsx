import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/AdminSidebar';
import { AdminHeader } from '@/components/AdminHeader';
import { GuideBanner } from '@/components/guide/GuideBanner';
import { Toaster } from '@/components/ui/toaster';
import { fetchUnreadCount } from '@/lib/inbound/queries';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('name,role,guide_banner_dismissed_at')
    .eq('id', user.id)
    .single<{ name: string; role: string; guide_banner_dismissed_at: string | null }>();
  if (!profile || profile.role !== 'admin') redirect('/shop');

  const inboundUnread = await fetchUnreadCount('admin');

  return (
    <div className="min-h-screen flex bg-surface">
      <AdminSidebar inboundUnread={inboundUnread} />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader name={profile.name} email={user.email} inboundUnread={inboundUnread} />
        {profile.guide_banner_dismissed_at === null && (
          <GuideBanner guideHref="/admin/guide" />
        )}
        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
