'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { saveAppSettingsAction } from '@/lib/actions/admin-settings';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';

export function SettingsForm({ defaults }: { defaults: { bankName: string; bankAccountNumber: string; bankAccountHolder: string; notice: string } }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  function onSubmit(fd: FormData) {
    start(async () => {
      const r = await saveAppSettingsAction(fd);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else toast({ title: '저장 완료' });
    });
  }
  return (
    <form action={onSubmit as unknown as (fd: FormData) => void} className="space-y-3">
      <div><Label>은행명</Label><Input name="bankName" defaultValue={defaults.bankName} /></div>
      <div><Label>계좌번호</Label><Input name="bankAccountNumber" defaultValue={defaults.bankAccountNumber} /></div>
      <div><Label>예금주</Label><Input name="bankAccountHolder" defaultValue={defaults.bankAccountHolder} /></div>
      <div><Label>안내문</Label><Textarea name="notice" defaultValue={defaults.notice} rows={4} /></div>
      <Button type="submit" disabled={pending}>{pending ? '저장중...' : '저장'}</Button>
    </form>
  );
}
