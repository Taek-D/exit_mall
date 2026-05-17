import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ResetPasswordSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface dotted-grid">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-md bg-primary grid place-items-center">
            <span className="text-primary-foreground text-sm font-heading font-semibold">E</span>
          </div>
          <h1 className="font-heading font-semibold text-xl tracking-tight">엑시트몰</h1>
        </div>

        <section className="rounded-lg border bg-card p-8 flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded-full bg-success/10 text-success grid place-items-center">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-heading font-semibold text-lg">비밀번호가 재설정되었습니다</h2>
            <p className="text-sm text-muted-foreground">
              새 비밀번호로 다시 로그인해주세요.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href="/login">로그인으로 이동</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
