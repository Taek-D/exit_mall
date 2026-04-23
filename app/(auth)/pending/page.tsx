import { Button } from '@/components/ui/button';
import { logoutAction } from '@/lib/actions/auth';
import { Clock, Ban, Mail } from 'lucide-react';

export default function PendingPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status ?? 'pending';
  const suspended = status === 'suspended';

  const Icon = suspended ? Ban : Clock;
  const title = suspended ? '계정이 정지되었습니다' : '관리자 승인 대기 중';
  const body = suspended
    ? '접근이 제한되었습니다. 운영자에게 문의해주세요.'
    : '가입 신청이 접수되었습니다. 관리자 승인 후 로그인하실 수 있습니다.';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface dotted-grid">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-md bg-primary grid place-items-center">
            <span className="text-primary-foreground text-sm font-heading font-semibold">E</span>
          </div>
          <h1 className="font-heading font-semibold text-xl tracking-tight">엑시트몰</h1>
        </div>

        <div className="rounded-lg border bg-card p-8 shadow-card">
          <div className="flex flex-col items-center text-center gap-4">
            <div
              className={`h-12 w-12 rounded-full grid place-items-center ${
                suspended ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-heading font-semibold text-lg">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>

            {!suspended && (
              <div className="w-full mt-2 rounded-md border bg-accent/5 p-3 flex items-start gap-2 text-left">
                <Mail className="h-4 w-4 mt-0.5 text-accent shrink-0" aria-hidden />
                <p className="text-xs text-foreground leading-relaxed">
                  승인 처리가 완료되면 등록된 이메일로 안내해드립니다. 영업일 기준 1일 이내 처리됩니다.
                </p>
              </div>
            )}

            <form action={logoutAction} className="w-full mt-2">
              <Button type="submit" variant="outline" className="w-full">
                로그아웃
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
