import { ResetPasswordForm } from '@/components/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface dotted-grid">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-md bg-primary grid place-items-center">
            <span className="text-primary-foreground text-sm font-heading font-semibold">E</span>
          </div>
          <h1 className="font-heading font-semibold text-xl tracking-tight">엑시트몰</h1>
        </div>

        <header className="rounded-lg border bg-card p-6 mb-4 space-y-1.5">
          <h2 className="font-heading font-semibold text-lg">비밀번호 재설정</h2>
          <p className="text-sm text-muted-foreground">
            메일로 받은 재설정 링크를 통해 새 비밀번호를 설정합니다.
          </p>
        </header>

        <ResetPasswordForm />
      </div>
    </div>
  );
}
