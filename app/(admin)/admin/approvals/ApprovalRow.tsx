'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTransition } from 'react';
import { approveUserAction, rejectUserAction } from '@/lib/actions/admin-approvals';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function ApprovalRow({ profile }: { profile: { id: string; email: string; name: string; phone: string; created_at: string } }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function act(fn: (id: string) => Promise<any>, success: string) {
    start(async () => {
      const r = await fn(profile.id);
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else { toast({ title: success }); router.refresh(); }
    });
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">{profile.name}</p>
          <p className="text-sm text-muted-foreground">{profile.email} · {profile.phone}</p>
          <p className="text-xs text-muted-foreground">{new Date(profile.created_at).toLocaleString('ko-KR')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => act(approveUserAction, '승인 완료')} disabled={pending}>승인</Button>
          <Button size="sm" variant="outline" onClick={() => act(rejectUserAction, '반려 완료')} disabled={pending}>반려</Button>
        </div>
      </CardContent>
    </Card>
  );
}
