'use client';
import { RealtimeUnreadBadge } from '@/components/RealtimeUnreadBadge';

// 모듈 상수로 고정한다. 컴포넌트 안에서 배열 리터럴을 만들면 렌더링마다 새 참조가 되어
// RealtimeUnreadBadge의 구독 effect가 매번 재실행되고, 그때마다 realtime 채널이 새로 생성된다.
const INBOUND_TABLES = ['inbound_requests', 'inbound_request_comments'];

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
      tables={INBOUND_TABLES}
      className={className}
    />
  );
}
