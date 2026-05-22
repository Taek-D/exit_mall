import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/actions/_shared';
import {
  INBOUND_STATUS_LABEL,
  SHIPPING_UPLOAD_STATUS_LABEL,
  STOCK_ORDER_STATUS_LABEL,
  SUPPORT_STATUS_LABEL,
  type InboundStatus,
  type ShippingUploadStatus,
  type StockOrderStatus,
  type SupportStatus,
} from '@/lib/types';

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

type QueryResult = {
  data: unknown[] | null;
  count?: number | null;
  error: { message?: string } | null;
};

type RpcNumberResult = {
  data: number | null;
  error: { message?: string } | null;
};

type ProfileActivityRow = {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  created_at: string;
};

type DepositActivityRow = {
  id: string;
  amount: number;
  depositor_name: string | null;
  status: string;
  created_at: string;
  profiles: { name: string | null } | null;
};

type StockOrderActivityRow = {
  id: string;
  status: StockOrderStatus;
  total_amount: number;
  created_at: string;
  profiles: { name: string | null } | null;
};

type UploadActivityRow = {
  id: string;
  upload_type: 'exitmall' | 'purchased';
  original_name: string;
  status: ShippingUploadStatus;
  total_quantity: number;
  created_at: string;
  profiles: { name: string | null } | null;
};

type InboundActivityRow = {
  id: string;
  title: string;
  status: InboundStatus;
  last_comment_at: string | null;
  updated_at: string;
  created_at: string;
  profiles: { name: string | null } | null;
};

type SupportActivityRow = {
  id: string;
  title: string;
  status: SupportStatus;
  last_comment_at: string | null;
  updated_at: string;
  created_at: string;
  profiles: { name: string | null } | null;
};

function logDashboardError(label: string, error: unknown) {
  console.error(`[admin-dashboard] ${label}`, error);
}

async function safeCount(label: string, query: PromiseLike<QueryResult>): Promise<number> {
  const result = await query;
  if (result.error) {
    logDashboardError(label, result.error);
    return 0;
  }
  return result.count ?? 0;
}

async function safeRpcNumber(label: string, query: PromiseLike<RpcNumberResult>): Promise<number> {
  const result = await query;
  if (result.error) {
    logDashboardError(label, result.error);
    return 0;
  }
  return Number(result.data) || 0;
}

async function safeRows<T>(label: string, query: PromiseLike<QueryResult>): Promise<T[]> {
  const result = await query;
  if (result.error) {
    logDashboardError(label, result.error);
    return [];
  }
  return (result.data ?? []) as T[];
}

function displayName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function occurredAt(...values: Array<string | null | undefined>): string {
  return values.find((value) => value && !Number.isNaN(Date.parse(value))) ?? '';
}

function profileActivities(rows: ProfileActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `profile-${row.id}`,
    type: '가입 승인',
    title: displayName(row.name) ?? row.email ?? '신규 가입 요청',
    customerName: displayName(row.name),
    statusLabel: '승인대기',
    occurredAt: row.created_at,
    href: '/admin/approvals',
  }));
}

function depositActivities(rows: DepositActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `deposit-${row.id}`,
    type: '입금 확인',
    title: `${Number(row.amount).toLocaleString('ko-KR')}원 입금 요청`,
    customerName: displayName(row.profiles?.name) ?? displayName(row.depositor_name),
    statusLabel: '승인대기',
    occurredAt: row.created_at,
    href: '/admin/deposits',
  }));
}

function stockOrderActivities(rows: StockOrderActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `stock-order-${row.id}`,
    type: '구매 승인',
    title: `${Number(row.total_amount).toLocaleString('ko-KR')}원 구매 요청`,
    customerName: displayName(row.profiles?.name),
    statusLabel: STOCK_ORDER_STATUS_LABEL[row.status] ?? row.status,
    occurredAt: row.created_at,
    href: `/admin/orders/${row.id}`,
  }));
}

function uploadActivities(rows: UploadActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => {
    const baseHref =
      row.upload_type === 'purchased'
        ? '/admin/shipping-uploads/purchased'
        : '/admin/shipping-uploads/exitmall';
    return {
      id: `upload-${row.id}`,
      type: row.upload_type === 'purchased' ? '사입재고 배송대행' : '엑시트몰 배송대행',
      title: row.original_name,
      customerName: displayName(row.profiles?.name),
      statusLabel: SHIPPING_UPLOAD_STATUS_LABEL[row.status] ?? row.status,
      occurredAt: row.created_at,
      href: `${baseHref}/${row.id}`,
    };
  });
}

function inboundActivities(rows: InboundActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `inbound-${row.id}`,
    type: '입고리스트',
    title: row.title,
    customerName: displayName(row.profiles?.name),
    statusLabel: INBOUND_STATUS_LABEL[row.status] ?? row.status,
    occurredAt: occurredAt(row.last_comment_at, row.updated_at, row.created_at),
    href: `/admin/inbound-requests/${row.id}`,
  }));
}

function supportActivities(rows: SupportActivityRow[]): RawDashboardActivity[] {
  return rows.map((row) => ({
    id: `support-${row.id}`,
    type: 'CS 문의',
    title: row.title,
    customerName: displayName(row.profiles?.name),
    statusLabel: SUPPORT_STATUS_LABEL[row.status] ?? row.status,
    occurredAt: occurredAt(row.last_comment_at, row.updated_at, row.created_at),
    href: `/admin/support-requests/${row.id}`,
  }));
}

export async function fetchAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = createClient();

  const [
    pendingApprovals,
    pendingDeposits,
    pendingStockOrders,
    pendingExitmallUploads,
    pendingPurchasedUploads,
    openInboundRequests,
    unreadInboundRequests,
    openSupportRequests,
    unreadSupportRequests,
    profiles,
    deposits,
    stockOrders,
    uploads,
    inbound,
    support,
  ] = await Promise.all([
    safeCount(
      'pending approvals count',
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ),
    safeCount(
      'pending deposits count',
      supabase
        .from('deposit_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ),
    safeCount(
      'pending stock orders count',
      supabase
        .from('stock_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ),
    safeCount(
      'pending exitmall uploads count',
      supabase
        .from('order_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('upload_type', 'exitmall')
        .eq('status', 'pending'),
    ),
    safeCount(
      'pending purchased uploads count',
      supabase
        .from('order_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('upload_type', 'purchased')
        .eq('status', 'pending'),
    ),
    safeCount(
      'open inbound requests count',
      supabase
        .from('inbound_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ),
    safeRpcNumber(
      'unread inbound requests count',
      callRpc(supabase, 'count_inbound_unread', { p_role: 'admin' }),
    ),
    safeCount(
      'open support requests count',
      supabase
        .from('support_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ),
    safeRpcNumber(
      'unread support requests count',
      callRpc(supabase, 'count_support_unread', { p_role: 'admin' }),
    ),
    safeRows<ProfileActivityRow>(
      'recent pending approvals',
      supabase
        .from('profiles')
        .select('id,name,email,status,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
    ),
    safeRows<DepositActivityRow>(
      'recent pending deposits',
      supabase
        .from('deposit_requests')
        .select(
          'id,amount,depositor_name,status,created_at,profiles:profiles!deposit_requests_user_id_fkey(name)',
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
    ),
    safeRows<StockOrderActivityRow>(
      'recent stock orders',
      supabase
        .from('stock_orders')
        .select('id,status,total_amount,created_at,profiles!stock_orders_user_id_fkey(name)')
        .order('created_at', { ascending: false })
        .limit(5),
    ),
    safeRows<UploadActivityRow>(
      'recent shipping uploads',
      supabase
        .from('order_uploads')
        .select(
          'id,upload_type,original_name,status,total_quantity,created_at,profiles!order_uploads_user_id_fkey(name)',
        )
        .in('upload_type', ['exitmall', 'purchased'])
        .order('created_at', { ascending: false })
        .limit(10),
    ),
    safeRows<InboundActivityRow>(
      'recent inbound requests',
      supabase
        .from('inbound_requests')
        .select('id,title,status,last_comment_at,updated_at,created_at,profiles!inbound_requests_user_id_fkey(name)')
        .order('updated_at', { ascending: false })
        .limit(5),
    ),
    safeRows<SupportActivityRow>(
      'recent support requests',
      supabase
        .from('support_requests')
        .select('id,title,status,last_comment_at,updated_at,created_at,profiles!support_requests_user_id_fkey(name)')
        .order('updated_at', { ascending: false })
        .limit(5),
    ),
  ]);

  return composeDashboardData(
    {
      pendingApprovals,
      pendingDeposits,
      pendingStockOrders,
      pendingExitmallUploads,
      pendingPurchasedUploads,
      openInboundRequests,
      unreadInboundRequests,
      openSupportRequests,
      unreadSupportRequests,
    },
    [
      ...profileActivities(profiles),
      ...depositActivities(deposits),
      ...stockOrderActivities(stockOrders),
      ...uploadActivities(uploads),
      ...inboundActivities(inbound),
      ...supportActivities(support),
    ],
  );
}
