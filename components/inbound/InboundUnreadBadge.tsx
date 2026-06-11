'use client';
import { RealtimeUnreadBadge } from '@/components/RealtimeUnreadBadge';

type Role = 'user' | 'admin';

export function InboundUnreadBadge({
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
      rpcName="count_inbound_unread"
      channelPrefix="inbound-unread"
      tables={['inbound_requests', 'inbound_request_comments']}
      className={className}
    />
  );
}
