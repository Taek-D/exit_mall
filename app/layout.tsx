import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '엑시트몰', description: '폐쇄몰' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
