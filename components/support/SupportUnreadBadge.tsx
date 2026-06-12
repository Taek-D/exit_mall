'use client';

import { RealtimeUnreadBadge } from '@/components/RealtimeUnreadBadge';

type Role = 'user' | 'admin';

export function SupportUnreadBadge({
  role,
  initial,
  className,
}: {
  role: Role;
  initial: number;
  className?: string;
}) {
  return (
    <RealtimeUnreadBadge
      role={role}
      initial={initial}
      rpcName="count_support_unread"
      channelPrefix="support-unread"
      tables={['support_requests', 'support_request_comments']}
      className={className}
    />
  );
}
