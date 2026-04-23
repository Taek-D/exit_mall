'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { saveAppSettingsAction } from '@/lib/actions/admin-settings';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Save } from 'lucide-react';

type Defaults = {
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  notice: string;
};

export function SettingsForm({ defaults }: { defaults: Defaults }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function onSubmit(fd: FormData) {
    start(async () => {
      const r = await saveAppSettingsAction(fd);
      if ((r as { error?: string }).error) {
        toast({
          title: '저장 실패',
          description: (r as { error: string }).error,
          variant: 'destructive',
        });
      } else {
        toast({ title: '저장 완료' });
      }
    });
  }

  return (
    <form
      action={onSubmit as unknown as (fd: FormData) => void}
      className="rounded-lg border bg-card divide-y"
    >
      <section className="p-5 space-y-4">
        <div>
          <h2 className="font-heading font-semibold">입금 계좌 정보</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            사용자가 이체 요청 페이지에서 확인하는 정보입니다.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bankName">은행명</Label>
            <Input id="bankName" name="bankName" defaultValue={defaults.bankName} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bankAccountNumber">계좌번호</Label>
            <Input
              id="bankAccountNumber"
              name="bankAccountNumber"
              defaultValue={defaults.bankAccountNumber}
              className="font-mono tabular"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="bankAccountHolder">예금주</Label>
            <Input
              id="bankAccountHolder"
              name="bankAccountHolder"
              defaultValue={defaults.bankAccountHolder}
            />
          </div>
        </div>
      </section>

      <section className="p-5 space-y-4">
        <div>
          <h2 className="font-heading font-semibold">안내문</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            이체 요청 페이지에 노출되는 공지사항입니다.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notice">공지</Label>
          <Textarea id="notice" name="notice" defaultValue={defaults.notice} rows={5} />
        </div>
      </section>

      <div className="p-5 flex items-center justify-end gap-3">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" aria-hidden />
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  );
}
