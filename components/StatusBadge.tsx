import { cn } from '@/lib/utils';
import type { OrderStatus, DepositStatus, UserStatus } from '@/lib/types';
import { ORDER_STATUS_LABEL, DEPOSIT_STATUS_LABEL } from '@/lib/types';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'violet';

const TONE_CLASS: Record<Tone, string> = {
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 h-5 text-[11px] font-medium ring-1 ring-inset leading-none',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ORDER_TONE: Record<OrderStatus, Tone> = {
  placed: 'info',
  preparing: 'warning',
  shipped: 'violet',
  delivered: 'success',
  cancelled: 'danger',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Pill tone={ORDER_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Pill>;
}

const DEPOSIT_TONE: Record<DepositStatus, Tone> = {
  pending: 'warning',
  confirmed: 'success',
  rejected: 'danger',
};

export function DepositStatusBadge({ status }: { status: DepositStatus }) {
  return <Pill tone={DEPOSIT_TONE[status]}>{DEPOSIT_STATUS_LABEL[status]}</Pill>;
}

const USER_TONE: Record<UserStatus, Tone> = {
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
};

const USER_LABEL: Record<UserStatus, string> = {
  pending: '승인 대기',
  active: '활성',
  suspended: '정지',
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Pill tone={USER_TONE[status]}>{USER_LABEL[status]}</Pill>;
}

export { Pill as StatusPill };
