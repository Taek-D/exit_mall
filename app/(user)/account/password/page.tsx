import { AccountPasswordForm } from '@/components/AccountPasswordForm';

export default function UserPasswordPage() {
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header className="pb-4 border-b">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          비밀번호 변경
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          현재 비밀번호 확인 후 새 비밀번호로 변경합니다.
        </p>
      </header>

      <AccountPasswordForm />
    </div>
  );
}
