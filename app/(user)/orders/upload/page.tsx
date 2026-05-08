import { redirect } from 'next/navigation';

export default function LegacyOrderUploadRedirect() {
  redirect('/shipping-uploads');
}
