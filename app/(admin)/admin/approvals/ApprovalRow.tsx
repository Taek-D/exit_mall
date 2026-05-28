'use client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState, useTransition } from 'react';
import {
  approveUserAction,
  rejectUserAction,
} from '@/lib/actions/admin-approvals';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import {
  USER_GROUPS,
  USER_GROUP_LABEL,
  type UserGroup,
} from '@/lib/auth/user-groups';

type Profile = {
  id: string;
  email: string;
  name: string;
  phone: string;
  created_at: string;
};

export function ApprovalRow({ profile }: { profile: Profile }) {
  const [group, setGroup] = useState<UserGroup | ''>('');
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function approve() {
    if (!group) return;
    start(async () => {
      const r = await approveUserAction(profile.id, group);
      if (!r.ok) {
        toast({ title: '실패', description: r.error, variant: 'destructive' });
      } else {
        toast({ title: '승인 완료' });
        router.refresh();
      }
    });
  }

  function reject() {
    start(async () => {
      const r = await rejectUserAction(profile.id);
      if (!r.ok) {
        toast({ title: '실패', description: r.error, variant: 'destructive' });
      } else {
        toast({ title: '반려 완료' });
        router.refresh();
      }
    });
  }

  const initial = (profile.name || '?').charAt(0).toUpperCase();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 hover:bg-surface-muted/50 transition-colors">
      <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
        <div className="h-10 w-10 rounded-full bg-muted grid place-items-center shrink-0">
          <span className="text-sm font-medium">{initial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{profile.name}</p>
          <p className="text-xs text-muted-foreground break-all sm:truncate">
            {profile.email}
            <span className="text-muted-foreground/60"> · </span>
            <span className="font-mono tabular whitespace-nowrap">
              {profile.phone}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(profile.created_at).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0 sm:self-center">
        <Select value={group} onValueChange={(v) => setGroup(v as UserGroup)}>
          <SelectTrigger className="h-9 w-[180px]" aria-label="그룹 선택">
            <SelectValue placeholder="그룹 선택" />
          </SelectTrigger>
          <SelectContent>
            {USER_GROUPS.map((g) => (
              <SelectItem key={g} value={g}>
                {USER_GROUP_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={approve}
          disabled={pending || !group}
          className="flex-1 sm:flex-initial"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          승인
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={reject}
          disabled={pending}
          className="flex-1 sm:flex-initial"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          반려
        </Button>
      </div>
    </div>
  );
}
