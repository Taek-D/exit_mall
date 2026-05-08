import { redirect } from 'next/navigation';

export default function LegacyAdminOrderUploadDetailRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/admin/shipping-uploads/${params.id}`);
}
