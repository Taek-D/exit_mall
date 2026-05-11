import { Button } from '@/components/ui/button';
import { logoutAction, logoutToSignupAction } from '@/lib/actions/auth';
import { Ban, CheckCircle2, Clock, Mail, CircleX } from 'lucide-react';

export default function PendingPage({ searchParams }: { searchParams: { status?: string; from?: string } }) {
  const status = searchParams.status ?? 'pending';
  const suspended = status === 'suspended';
  const rejected = status === 'rejected';
  const completedSignup = !suspended && !rejected && searchParams.from === 'signup';

  const Icon = suspended ? Ban : rejected ? CircleX : completedSignup ? CheckCircle2 : Clock;
  const title = suspended
    ? '계정이 정지되었습니다'
    : rejected
      ? '가입 신청이 반려되었습니다'
    : completedSignup
      ? '가입 신청이 완료되었습니다'
      : '관리자 승인 대기 중';
  const body = suspended
    ? '접근이 제한되었습니다. 운영자에게 문의해주세요.'
    : rejected
      ? '입력 정보를 확인한 뒤 같은 이메일로 다시 가입 신청할 수 있습니다.'
    : '가입 신청이 접수되었습니다. 관리자 승인 후 로그인하실 수 있습니다.';
  const iconTone = suspended
    ? 'bg-destructive/10 text-destructive'
    : rejected
      ? 'bg-destructive/10 text-destructive'
    : completedSignup
      ? 'bg-success/10 text-success'
      : 'bg-warning/10 text-warning';
  const buttonLabel = rejected ? '다시 가입 신청하기' : completedSignup ? '로그인 화면으로 이동' : '로그아웃';
  const buttonAction = rejected ? logoutToSignupAction : logoutAction;

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
              className={`h-12 w-12 rounded-full grid place-items-center ${iconTone}`}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-heading font-semibold text-lg">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>

            {!suspended && !rejected && (
              <div className="w-full mt-2 rounded-md border bg-accent/5 p-3 flex items-start gap-2 text-left">
                <Mail className="h-4 w-4 mt-0.5 text-accent shrink-0" aria-hidden />
                <p className="text-xs text-foreground leading-relaxed">
                  승인 처리가 완료되면 등록된 이메일로 안내해드립니다. 영업일 기준 1일 이내 처리됩니다.
                </p>
              </div>
            )}

            <form action={buttonAction} className="w-full mt-2">
              <Button type="submit" variant="outline" className="w-full">
                {buttonLabel}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
