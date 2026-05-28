'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  completeDirectPasswordResetAction,
  findAccountAction,
  startDirectPasswordResetAction,
} from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormMessage } from '@/components/FormMessage';
import { PasswordInput } from '@/components/PasswordInput';
import { KeyRound, Lock, Mail, Phone, Search, User, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

type FoundAccount = {
  email: string;
  status: string;
};

type FieldName = 'newPassword' | 'confirmPassword';

export function AccountRecoveryForms({
  defaultTab = 'id',
}: {
  defaultTab?: 'id' | 'password';
}) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="id">아이디 찾기</TabsTrigger>
        <TabsTrigger value="password">비밀번호 찾기</TabsTrigger>
      </TabsList>
      <TabsContent value="id" className="mt-4">
        <FindIdForm />
      </TabsContent>
      <TabsContent value="password" className="mt-4">
        <DirectPasswordResetForm />
      </TabsContent>
    </Tabs>
  );
}

function FindIdForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<FoundAccount[] | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setAccounts(null);
    start(async () => {
      const result = await findAccountAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAccounts(result.accounts);
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border bg-card p-6 space-y-5">
      <div className="space-y-1.5">
        <h2 className="font-heading font-semibold text-lg">아이디 찾기</h2>
        <p className="text-sm text-muted-foreground">
          가입 시 입력한 이름과 휴대폰 번호로 이메일 아이디를 확인합니다.
        </p>
      </div>

      <IconField Icon={User} id="name" label="이름" autoComplete="name" disabled={pending} />
      <IconField
        Icon={Phone}
        id="phone"
        label="휴대폰 번호"
        placeholder="010-1234-5678"
        autoComplete="tel"
        disabled={pending}
      />

      {error && <Message tone="error">{error}</Message>}
      {accounts && (
        <div className="rounded-md border bg-surface-muted/40 p-4 space-y-3">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              일치하는 계정을 찾지 못했습니다.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">가입된 아이디</p>
              <ul className="space-y-2">
                {accounts.map((account) => (
                  <li
                    key={`${account.email}-${account.status}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="font-mono tabular">{account.email}</span>
                    <span className="text-xs text-muted-foreground">{account.status}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        <Search className="h-4 w-4" aria-hidden />
        {pending ? '확인 중...' : '아이디 찾기'}
      </Button>
    </form>
  );
}

function DirectPasswordResetForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<FieldName, boolean>>({
    newPassword: false,
    confirmPassword: false,
  });

  function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const result = await startDirectPasswordResetAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setResetToken(result.resetToken);
    });
  }

  function onReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const result = await completeDirectPasswordResetAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/reset-password/success');
    });
  }

  if (resetToken) {
    return (
      <form onSubmit={onReset} className="rounded-lg border bg-card p-6 space-y-5">
        <input type="hidden" name="resetToken" value={resetToken} />
        <div className="space-y-1.5">
          <h2 className="font-heading font-semibold text-lg">새 비밀번호 설정</h2>
          <p className="text-sm text-muted-foreground">
            본인 정보가 확인되었습니다. 새 비밀번호를 입력해주세요.
          </p>
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

        {error && <Message tone="error">{error}</Message>}

        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setResetToken(null);
              setError(null);
            }}
          >
            이전
          </Button>
          <Button type="submit" className="w-full" disabled={pending}>
            <Lock className="h-4 w-4" aria-hidden />
            {pending ? '재설정 중...' : '비밀번호 재설정'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onVerify} className="rounded-lg border bg-card p-6 space-y-5">
      <div className="space-y-1.5">
        <h2 className="font-heading font-semibold text-lg">비밀번호 찾기</h2>
        <p className="text-sm text-muted-foreground">
          가입한 이름, 휴대폰 번호, 이메일이 모두 일치하면 바로 새 비밀번호를 설정합니다.
        </p>
      </div>

      <IconField Icon={User} id="name" label="이름" autoComplete="name" disabled={pending} />
      <IconField
        Icon={Phone}
        id="phone"
        label="휴대폰 번호"
        placeholder="010-1234-5678"
        autoComplete="tel"
        disabled={pending}
      />
      <IconField
        Icon={Mail}
        id="email"
        label="이메일"
        type="email"
        autoComplete="email"
        placeholder="name@company.com"
        disabled={pending}
      />

      {error && <Message tone="error">{error}</Message>}

      <Button type="submit" className="w-full" disabled={pending}>
        <KeyRound className="h-4 w-4" aria-hidden />
        {pending ? '확인 중...' : '본인 정보 확인'}
      </Button>
    </form>
  );
}

function IconField({
  Icon,
  id,
  label,
  type = 'text',
  autoComplete,
  placeholder,
  disabled,
}: {
  Icon: LucideIcon;
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
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
          disabled={disabled}
          className="h-10 pl-9"
        />
      </div>
    </div>
  );
}

function Message({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: React.ReactNode;
}) {
  return <FormMessage tone={tone}>{children}</FormMessage>;
}

export function RecoveryFooterLinks() {
  return (
    <p className="text-sm text-center text-muted-foreground mt-6">
      계정 정보가 기억나셨나요?{' '}
      <Link href="/login" className="text-accent font-medium hover:underline">
        로그인
      </Link>
    </p>
  );
}
