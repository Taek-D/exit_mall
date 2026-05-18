import { StatusPill, type StatusPillTone } from '@/components/StatusBadge';
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUS_LABEL,
  type SupportCategory,
  type SupportStatus,
} from '@/lib/types';

const SUPPORT_STATUS_TONE: Record<SupportStatus, StatusPillTone> = {
  open: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
};

const SUPPORT_CATEGORY_TONE: Record<SupportCategory, StatusPillTone> = {
  exchange: 'violet',
  return: 'warning',
  cs: 'info',
  other: 'neutral',
};

export function SupportStatusBadge({
  status,
  className,
}: {
  status: SupportStatus;
  className?: string;
}) {
  return (
    <StatusPill tone={SUPPORT_STATUS_TONE[status]} className={className}>
      {SUPPORT_STATUS_LABEL[status]}
    </StatusPill>
  );
}

export function SupportCategoryBadge({
  category,
  className,
}: {
  category: SupportCategory;
  className?: string;
}) {
  return (
    <StatusPill tone={SUPPORT_CATEGORY_TONE[category]} className={className}>
      {SUPPORT_CATEGORY_LABEL[category]}
    </StatusPill>
  );
}
