'use client';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { loginAction } from '@/lib/actions/auth';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Mail, Lock, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(fd: FormData) {
    setError(null);
    start(async () => {
      const result = await loginAction(fd);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface dotted-grid">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-md bg-primary grid place-items-center">
            <span className="text-primary-foreground text-sm font-heading font-semibold">E</span>
          </div>
          <h1 className="font-heading font-semibold text-xl tracking-tight">엑시트몰</h1>
        </div>

        <div className="rounded-lg border bg-card p-8 shadow-card">
          <div className="space-y-1.5 mb-6">
            <h2 className="font-heading font-semibold text-lg">로그인</h2>
            <p className="text-sm text-muted-foreground">계정 정보를 입력해주세요</p>
          </div>

          <form action={onSubmit} className="space-y-4">
            <AuthInput
              id="email"
              name="email"
              type="email"
              label="이메일"
              icon={Mail}
              required
              autoComplete="email"
              placeholder="name@company.com"
            />

            <AuthInput
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              label="비밀번호"
              icon={Lock}
              required
              autoComplete="current-password"
              action={
                <Link
                  href="/find-account"
                  className="text-xs text-accent font-medium hover:underline"
                >
                  아이디/비밀번호 찾기
                </Link>
              }
            >
              <PasswordVisibilityButton
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </AuthInput>

            <FormError message={error} className="animate-slide-up-fade" />

            <Button type="submit" className="w-full h-10" disabled={pending}>
              {pending ? '로그인 중…' : '로그인'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-2 text-[11px] uppercase tracking-wider text-muted-foreground bg-card">
                또는
              </span>
            </div>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            계정이 없으신가요?{' '}
            <Link href="/signup" className="text-accent font-medium hover:underline">
              가입 신청
            </Link>
          </p>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-6">
          가입은 관리자 승인 후 이용할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

type AuthInputProps = ComponentPropsWithoutRef<typeof Input> & {
  id: string;
  label: string;
  icon: LucideIcon;
  action?: ReactNode;
  children?: ReactNode;
};

function AuthInput({
  id,
  label,
  icon: Icon,
  action,
  children,
  className,
  ...inputProps
}: AuthInputProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          className={cn('h-10 pl-9', children && 'pr-10', className)}
          {...inputProps}
        />
        {children}
      </div>
    </div>
  );
}

function PasswordVisibilityButton({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  const Icon = visible ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
