'use client';
import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { setUserGroupAction } from '@/lib/actions/admin-users';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import {
  USER_GROUPS,
  USER_GROUP_LABEL,
  type UserGroup,
} from '@/lib/auth/user-groups';

export function GroupChangeForm({
  userId,
  currentGroup,
  status,
}: {
  userId: string;
  currentGroup: UserGroup | null;
  status: string;
}) {
  const initial: UserGroup = currentGroup ?? 'group1';
  const [selected, setSelected] = useState<UserGroup>(initial);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const isActive = status === 'active';
  const isDirty = selected !== currentGroup;

  function submit() {
    if (!isDirty || !isActive) return;
    start(async () => {
      const r = await setUserGroupAction(userId, selected);
      if ((r as { error?: string }).error) {
        toast({
          title: '실패',
          description: (r as { error: string }).error,
          variant: 'destructive',
        });
      } else {
        toast({ title: '그룹 변경 완료' });
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="h-11 px-4 flex items-center gap-2 border-b">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="font-heading font-semibold text-sm">그룹</h2>
      </header>
      <div className="p-4 space-y-3">
        {!isActive && (
          <p className="text-xs text-muted-foreground">
            승인 후 설정할 수 있습니다.
          </p>
        )}
        <div className="space-y-2">
          {USER_GROUPS.map((g) => (
            <label
              key={g}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="radio"
                name={`group-${userId}`}
                value={g}
                checked={selected === g}
                onChange={() => setSelected(g)}
                disabled={!isActive || pending}
                className="h-4 w-4"
              />
              <span>{USER_GROUP_LABEL[g]}</span>
            </label>
          ))}
        </div>
        <Button
          size="sm"
          onClick={submit}
          disabled={!isActive || pending || !isDirty}
          className="w-full"
        >
          {pending ? '저장 중…' : '변경'}
        </Button>
      </div>
    </section>
  );
}
