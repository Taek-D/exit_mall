'use client';
import { useState, useTransition } from 'react';
import { signupAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

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
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>엑시트몰 가입 신청</CardTitle></CardHeader>
        <form action={onSubmit}>
          <CardContent className="space-y-4">
            <div><Label htmlFor="email">이메일</Label><Input id="email" name="email" type="email" required /></div>
            <div><Label htmlFor="password">비밀번호 (8자 이상)</Label><Input id="password" name="password" type="password" required /></div>
            <div><Label htmlFor="name">이름</Label><Input id="name" name="name" required /></div>
            <div><Label htmlFor="phone">휴대폰 (010-1234-5678)</Label><Input id="phone" name="phone" required /></div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={pending}>{pending ? '처리중...' : '가입 신청'}</Button>
            <p className="text-sm text-muted-foreground">이미 계정이 있으신가요? <Link href="/login" className="underline">로그인</Link></p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
