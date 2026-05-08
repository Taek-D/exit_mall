import { redirect } from 'next/navigation';

export default function LegacyAdminOrderUploadsRedirect() {
  redirect('/admin/shipping-uploads');
}
