'use client';

import { useState, useTransition } from 'react';
import { changePasswordAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/FormMessage';
import { PasswordInput } from '@/components/PasswordInput';
import { Lock, ShieldCheck } from 'lucide-react';

type FieldName = 'currentPassword' | 'newPassword' | 'confirmPassword';

const FIELDS: {
  name: FieldName;
  label: string;
  autoComplete: string;
}[] = [
  { name: 'currentPassword', label: '현재 비밀번호', autoComplete: 'current-password' },
  { name: 'newPassword', label: '새 비밀번호', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: '새 비밀번호 확인', autoComplete: 'new-password' },
];

export function AccountPasswordForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<FieldName, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    setSuccess(null);

    start(async () => {
      const result = await changePasswordAction(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      form.reset();
      setVisible({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });
      setSuccess('비밀번호가 변경되었습니다.');
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border bg-card divide-y">
      <section className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-heading font-semibold">보안 정보</h2>
        </div>

        <div className="space-y-4">
          {FIELDS.map((field) => (
            <PasswordInput
              key={field.name}
              name={field.name}
              label={field.label}
              autoComplete={field.autoComplete}
              minLength={field.name === 'currentPassword' ? undefined : 8}
              visible={visible[field.name]}
              disabled={pending}
              onToggle={() =>
                setVisible((v) => ({ ...v, [field.name]: !v[field.name] }))
              }
            />
          ))}
        </div>
      </section>

      {(error || success) && (
        <div className="px-5 pt-5">
          <FormMessage tone={error ? 'error' : 'success'}>{error ?? success}</FormMessage>
        </div>
      )}

      <div className="p-5 flex items-center justify-end">
        <Button type="submit" disabled={pending}>
          <Lock className="h-4 w-4" aria-hidden />
          {pending ? '변경 중...' : '비밀번호 변경'}
        </Button>
      </div>
    </form>
  );
}
