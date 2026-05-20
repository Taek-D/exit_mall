'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { updateUserContactAction } from '@/lib/actions/admin-users';
import { UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function UserContactForm({
  userId,
  defaultName,
  defaultPhone,
}: {
  userId: string;
  defaultName: string;
  defaultPhone: string;
}) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function onSubmit(fd: FormData) {
    start(async () => {
      const result = await updateUserContactAction(userId, fd);
      if ((result as { error?: string }).error) {
        toast({
          title: '저장 실패',
          description: (result as { error: string }).error,
          variant: 'destructive',
        });
      } else {
        toast({ title: '기본정보 저장 완료' });
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="h-11 px-4 flex items-center gap-2 border-b">
        <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="font-heading font-semibold text-sm">기본정보 수정</h2>
      </header>
      <form action={onSubmit as unknown as (fd: FormData) => void} className="p-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="admin-contact-name">이름</Label>
          <Input
            id="admin-contact-name"
            name="name"
            defaultValue={defaultName}
            maxLength={30}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-contact-phone">전화번호</Label>
          <Input
            id="admin-contact-phone"
            name="phone"
            defaultValue={defaultPhone}
            placeholder="010-1234-5678"
            autoComplete="tel"
            required
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending} className="md:min-w-24">
          {pending ? '저장 중' : '저장'}
        </Button>
      </form>
    </section>
  );
}
