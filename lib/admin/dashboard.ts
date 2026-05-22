export type AdminDashboardIconKey =
  | 'user-check'
  | 'wallet'
  | 'shopping-cart'
  | 'file-spreadsheet'
  | 'inbox'
  | 'life-buoy';

export type AdminWorkQueue = {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  tone: 'default' | 'warning' | 'danger';
  icon: AdminDashboardIconKey;
  secondaryCount?: number;
  secondaryLabel?: string;
};

export type AdminRecentActivity = {
  id: string;
  type: string;
  title: string;
  customerName: string | null;
  statusLabel: string;
  occurredAt: string;
  href: string;
};

export type RawDashboardActivity = AdminRecentActivity;

export type AdminDashboardCounts = {
  pendingApprovals: number;
  pendingDeposits: number;
  pendingStockOrders: number;
  pendingExitmallUploads: number;
  pendingPurchasedUploads: number;
  openInboundRequests: number;
  unreadInboundRequests: number;
  openSupportRequests: number;
  unreadSupportRequests: number;
};

export type AdminDashboardData = {
  totalPendingCount: number;
  unreadAttentionCount: number;
  workQueues: AdminWorkQueue[];
  recentActivities: AdminRecentActivity[];
};

function queueTone(count: number, secondaryCount = 0): AdminWorkQueue['tone'] {
  return count > 0 || secondaryCount > 0 ? 'warning' : 'default';
}

export function buildWorkQueues(counts: AdminDashboardCounts): AdminWorkQueue[] {
  return [
    {
      key: 'approvals',
      label: '가입 승인',
      description: '신규 회원 승인 대기',
      count: counts.pendingApprovals,
      href: '/admin/approvals',
      tone: queueTone(counts.pendingApprovals),
      icon: 'user-check',
    },
    {
      key: 'deposits',
      label: '입금 확인',
      description: '예치금 이체 요청',
      count: counts.pendingDeposits,
      href: '/admin/deposits',
      tone: queueTone(counts.pendingDeposits),
      icon: 'wallet',
    },
    {
      key: 'stock-orders',
      label: '구매 승인',
      description: '엑시트몰 상품 구매 검토',
      count: counts.pendingStockOrders,
      href: '/admin/orders?status=pending',
      tone: queueTone(counts.pendingStockOrders),
      icon: 'shopping-cart',
    },
    {
      key: 'exitmall-shipping',
      label: '엑시트몰 배송대행',
      description: '배송대행 업로드 검토',
      count: counts.pendingExitmallUploads,
      href: '/admin/shipping-uploads/exitmall?status=pending',
      tone: queueTone(counts.pendingExitmallUploads),
      icon: 'file-spreadsheet',
    },
    {
      key: 'purchased-shipping',
      label: '사입재고 배송대행',
      description: '사입재고 배송 요청 검토',
      count: counts.pendingPurchasedUploads,
      href: '/admin/shipping-uploads/purchased?status=pending',
      tone: queueTone(counts.pendingPurchasedUploads),
      icon: 'file-spreadsheet',
    },
    {
      key: 'inbound-requests',
      label: '입고리스트',
      description: '신규 입고요청 접수',
      count: counts.openInboundRequests,
      href: '/admin/inbound-requests?status=open',
      tone: queueTone(counts.openInboundRequests, counts.unreadInboundRequests),
      icon: 'inbox',
      secondaryCount: counts.unreadInboundRequests,
      secondaryLabel: '미확인 답변',
    },
    {
      key: 'support-requests',
      label: 'CS 문의',
      description: '교환/반품 및 고객 문의',
      count: counts.openSupportRequests,
      href: '/admin/support-requests?status=open',
      tone: queueTone(counts.openSupportRequests, counts.unreadSupportRequests),
      icon: 'life-buoy',
      secondaryCount: counts.unreadSupportRequests,
      secondaryLabel: '미확인 댓글',
    },
  ];
}

export function buildRecentActivities(rows: RawDashboardActivity[]): AdminRecentActivity[] {
  return rows
    .filter((row) => row.occurredAt && !Number.isNaN(Date.parse(row.occurredAt)))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

export function limitRecentActivities(
  rows: AdminRecentActivity[],
  limit = 15,
): AdminRecentActivity[] {
  return rows.slice(0, limit);
}

export function composeDashboardData(
  counts: AdminDashboardCounts,
  activities: RawDashboardActivity[],
): AdminDashboardData {
  const workQueues = buildWorkQueues(counts);
  return {
    totalPendingCount: workQueues.reduce((sum, queue) => sum + queue.count, 0),
    unreadAttentionCount: workQueues.reduce(
      (sum, queue) => sum + (queue.secondaryCount ?? 0),
      0,
    ),
    workQueues,
    recentActivities: limitRecentActivities(buildRecentActivities(activities), 15),
  };
}
