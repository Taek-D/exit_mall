import { cn } from '@/lib/utils';
import type {
  OrderStatus,
  DepositStatus,
  UserStatus,
  StockOrderStatus,
  ShippingUploadStatus,
} from '@/lib/types';
import {
  ORDER_STATUS_LABEL,
  DEPOSIT_STATUS_LABEL,
  STOCK_ORDER_STATUS_LABEL,
  SHIPPING_UPLOAD_STATUS_LABEL,
} from '@/lib/types';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'violet';

const TONE_CLASS: Record<Tone, string> = {
  info: 'bg-info/10 text-info ring-info/20',
  success: 'bg-success/10 text-success ring-success/20',
  warning: 'bg-warning/10 text-warning ring-warning/20',
  danger: 'bg-destructive/10 text-destructive ring-destructive/20',
  neutral: 'bg-muted text-muted-foreground ring-border',
  // violet은 시맨틱 토큰이 없어 보조 색상 유지 (배송중 상태 시각 구분용)
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

export type OrderUploadStatus = 'pending' | 'approved' | 'rejected' | 'failed';

const ORDER_UPLOAD_TONE: Record<OrderUploadStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  failed: 'danger',
};

const ORDER_UPLOAD_LABEL: Record<OrderUploadStatus, string> = {
  pending: '검토 대기',
  approved: '승인 완료',
  rejected: '반려',
  failed: '처리 실패',
};

export function OrderUploadStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = (
    ['pending', 'approved', 'rejected', 'failed'].includes(status) ? status : 'pending'
  ) as OrderUploadStatus;
  return (
    <Pill tone={ORDER_UPLOAD_TONE[key]} className={className}>
      {ORDER_UPLOAD_LABEL[key]}
    </Pill>
  );
}

const STOCK_ORDER_TONE: Record<StockOrderStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export function StockOrderStatusBadge({ status }: { status: StockOrderStatus }) {
  return <Pill tone={STOCK_ORDER_TONE[status]}>{STOCK_ORDER_STATUS_LABEL[status]}</Pill>;
}

const SHIPPING_UPLOAD_TONE: Record<ShippingUploadStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  failed: 'danger',
  shipped: 'violet',
  completed: 'info',
  cancelled: 'neutral',
};

export function ShippingUploadStatusBadge({
  status,
  className,
}: {
  status: ShippingUploadStatus;
  className?: string;
}) {
  return (
    <Pill tone={SHIPPING_UPLOAD_TONE[status]} className={className}>
      {SHIPPING_UPLOAD_STATUS_LABEL[status]}
    </Pill>
  );
}

export { Pill as StatusPill };
