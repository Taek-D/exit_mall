'use client';

import { useState, useTransition } from 'react';
import {
  findAccountAction,
  requestPasswordResetAction,
} from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormMessage } from '@/components/FormMessage';
import { KeyRound, Mail, Phone, Search, User } from 'lucide-react';
import Link from 'next/link';

type FoundAccount = {
  email: string;
  status: string;
};

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
        <ForgotPasswordForm />
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
      if (result?.error) {
        setError(result.error);
        return;
      }
      setAccounts(result?.accounts ?? []);
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
        label="휴대폰"
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

function ForgotPasswordForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setSent(false);
    start(async () => {
      const result = await requestPasswordResetAction(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border bg-card p-6 space-y-5">
      <div className="space-y-1.5">
        <h2 className="font-heading font-semibold text-lg">비밀번호 찾기</h2>
        <p className="text-sm text-muted-foreground">
          가입 이메일로 비밀번호 재설정 링크를 보내드립니다.
        </p>
      </div>

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
      {sent && (
        <Message tone="success">
          재설정 메일을 보냈습니다. 메일의 링크는 짧은 시간 동안만 사용할 수 있습니다.
        </Message>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        <KeyRound className="h-4 w-4" aria-hidden />
        {pending ? '발송 중...' : '재설정 메일 보내기'}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        메일을 받지 못했다면 스팸함을 확인하거나 운영자에게 문의해주세요.
      </p>
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
  Icon: typeof Mail;
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
