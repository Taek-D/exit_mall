'use client';

import { useState, useTransition } from 'react';
import { changePasswordAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';

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
            <PasswordField
              key={field.name}
              name={field.name}
              label={field.label}
              autoComplete={field.autoComplete}
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
          <div
            role="alert"
            aria-live="polite"
            className={
              error
                ? 'flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3'
                : 'flex items-start gap-2 text-sm text-success bg-success/5 border border-success/20 rounded-md p-3'
            }
          >
            {error ? (
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
            )}
            <p>{error ?? success}</p>
          </div>
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

function PasswordField({
  name,
  label,
  autoComplete,
  visible,
  disabled,
  onToggle,
}: {
  name: FieldName;
  label: string;
  autoComplete: string;
  visible: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={name}
          name={name}
          type={visible ? 'text' : 'password'}
          required
          minLength={name === 'currentPassword' ? undefined : 8}
          maxLength={72}
          autoComplete={autoComplete}
          disabled={disabled}
          className="h-10 pl-9 pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          aria-label={visible ? `${label} 숨기기` : `${label} 보기`}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
