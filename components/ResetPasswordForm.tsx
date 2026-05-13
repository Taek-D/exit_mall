'use client';

import { useState, useTransition } from 'react';
import { resetRecoveredPasswordAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/FormMessage';
import { PasswordInput } from '@/components/PasswordInput';
import { CheckCircle2, KeyRound, Lock } from 'lucide-react';
import Link from 'next/link';

type FieldName = 'newPassword' | 'confirmPassword';

export function ResetPasswordForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [visible, setVisible] = useState<Record<FieldName, boolean>>({
    newPassword: false,
    confirmPassword: false,
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setSuccess(false);
    start(async () => {
      const result = await resetRecoveredPasswordAction(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="rounded-lg border bg-card p-8 flex flex-col items-center text-center gap-4">
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
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border bg-card divide-y">
      <section className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-heading font-semibold">새 비밀번호 설정</h2>
        </div>

        <PasswordInput
          name="newPassword"
          label="새 비밀번호"
          visible={visible.newPassword}
          disabled={pending}
          onToggle={() => setVisible((v) => ({ ...v, newPassword: !v.newPassword }))}
        />
        <PasswordInput
          name="confirmPassword"
          label="새 비밀번호 확인"
          visible={visible.confirmPassword}
          disabled={pending}
          onToggle={() =>
            setVisible((v) => ({ ...v, confirmPassword: !v.confirmPassword }))
          }
        />
      </section>

      {error && (
        <div className="px-5 pt-5">
          <FormMessage tone="error">{error}</FormMessage>
        </div>
      )}

      <div className="p-5 flex items-center justify-end">
        <Button type="submit" disabled={pending}>
          <Lock className="h-4 w-4" aria-hidden />
          {pending ? '재설정 중...' : '비밀번호 재설정'}
        </Button>
      </div>
    </form>
  );
}
