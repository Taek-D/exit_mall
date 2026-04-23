'use client';
import { useState, useTransition } from 'react';
import { signupAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { AlertCircle, Mail, Lock, User, Phone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export default function SignupPage() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    start(async () => {
      const result = await signupAction(fd);
      if (result?.error) setError(result.error);
    });
  }

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
          <div className="space-y-1.5 mb-6">
            <h2 className="font-heading font-semibold text-lg">가입 신청</h2>
            <p className="text-sm text-muted-foreground">
              관리자 승인 후 로그인하실 수 있습니다.
            </p>
          </div>

          <form action={onSubmit} className="space-y-4">
            <IconField Icon={Mail} id="email" label="이메일" type="email" autoComplete="email" placeholder="name@company.com" />
            <IconField Icon={Lock} id="password" label="비밀번호" type="password" autoComplete="new-password" hint="8자 이상" />
            <IconField Icon={User} id="name" label="이름" />
            <IconField Icon={Phone} id="phone" label="휴대폰" placeholder="010-1234-5678" autoComplete="tel" />

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3 animate-slide-up-fade"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
                <p>{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full h-10" disabled={pending}>
              {pending ? '처리 중…' : '가입 신청'}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground mt-6">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-accent font-medium hover:underline">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function IconField({
  Icon,
  id,
  label,
  type = 'text',
  autoComplete,
  placeholder,
  hint,
}: {
  Icon: LucideIcon;
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {hint && <span className="text-[11px] text-muted-foreground font-normal ml-1">{hint}</span>}
      </Label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          name={id}
          type={type}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="pl-9 h-10"
        />
      </div>
    </div>
  );
}
