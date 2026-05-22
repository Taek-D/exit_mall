import { describe, expect, it } from 'vitest';
import {
  buildRecentActivities,
  buildWorkQueues,
  limitRecentActivities,
  type RawDashboardActivity,
} from '@/lib/admin/dashboard';

describe('admin dashboard work queues', () => {
  it('builds the fixed queue order with matching filter links', () => {
    const queues = buildWorkQueues({
      pendingApprovals: 1,
      pendingDeposits: 2,
      pendingStockOrders: 3,
      pendingExitmallUploads: 4,
      pendingPurchasedUploads: 5,
      openInboundRequests: 6,
      unreadInboundRequests: 7,
      openSupportRequests: 8,
      unreadSupportRequests: 9,
    });

    expect(queues.map((q) => q.key)).toEqual([
      'approvals',
      'deposits',
      'stock-orders',
      'exitmall-shipping',
      'purchased-shipping',
      'inbound-requests',
      'support-requests',
    ]);
    expect(queues.map((q) => q.href)).toEqual([
      '/admin/approvals',
      '/admin/deposits',
      '/admin/orders?status=pending',
      '/admin/shipping-uploads/exitmall?status=pending',
      '/admin/shipping-uploads/purchased?status=pending',
      '/admin/inbound-requests',
      '/admin/support-requests',
    ]);
  });

  it('uses warning tone when primary or secondary count needs attention', () => {
    const [approvals, deposits, stock, exitmall, purchased, inbound, support] =
      buildWorkQueues({
        pendingApprovals: 0,
        pendingDeposits: 0,
        pendingStockOrders: 0,
        pendingExitmallUploads: 0,
        pendingPurchasedUploads: 0,
        openInboundRequests: 0,
        unreadInboundRequests: 2,
        openSupportRequests: 0,
        unreadSupportRequests: 0,
      });

    expect(approvals.tone).toBe('default');
    expect(deposits.tone).toBe('default');
    expect(stock.tone).toBe('default');
    expect(exitmall.tone).toBe('default');
    expect(purchased.tone).toBe('default');
    expect(inbound.tone).toBe('warning');
    expect(inbound.secondaryCount).toBe(2);
    expect(inbound.secondaryLabel).toBe('미확인 답변');
    expect(support.tone).toBe('default');
  });

  it('sums primary pending and unread attention counts separately', () => {
    const queues = buildWorkQueues({
      pendingApprovals: 1,
      pendingDeposits: 2,
      pendingStockOrders: 3,
      pendingExitmallUploads: 4,
      pendingPurchasedUploads: 5,
      openInboundRequests: 6,
      unreadInboundRequests: 7,
      openSupportRequests: 8,
      unreadSupportRequests: 9,
    });

    const totalPending = queues.reduce((sum, q) => sum + q.count, 0);
    const unreadAttention = queues.reduce((sum, q) => sum + (q.secondaryCount ?? 0), 0);

    expect(totalPending).toBe(29);
    expect(unreadAttention).toBe(16);
  });
});

describe('admin dashboard recent activities', () => {
  it('normalizes and sorts activities by occurredAt descending', () => {
    const raw: RawDashboardActivity[] = [
      {
        id: 'old-stock',
        type: '구매 승인',
        title: '오래된 구매 요청',
        customerName: '김고객',
        statusLabel: '검토대기',
        occurredAt: '2026-05-22T02:00:00.000Z',
        href: '/admin/orders/old-stock',
      },
      {
        id: 'new-cs',
        type: 'CS 문의',
        title: '새 CS 댓글',
        customerName: '이고객',
        statusLabel: '접수',
        occurredAt: '2026-05-22T04:00:00.000Z',
        href: '/admin/support-requests/new-cs',
      },
      {
        id: 'mid-upload',
        type: '엑시트몰 배송대행',
        title: '배송 업로드.xlsx',
        customerName: null,
        statusLabel: '검토대기',
        occurredAt: '2026-05-22T03:00:00.000Z',
        href: '/admin/shipping-uploads/exitmall/mid-upload',
      },
    ];

    expect(buildRecentActivities(raw).map((a) => a.id)).toEqual([
      'new-cs',
      'mid-upload',
      'old-stock',
    ]);
  });

  it('drops activities without a usable occurredAt and limits the result', () => {
    const raw: RawDashboardActivity[] = Array.from({ length: 17 }, (_, index) => ({
      id: `activity-${index}`,
      type: '구매 승인',
      title: `요청 ${index}`,
      customerName: null,
      statusLabel: '검토대기',
      occurredAt: `2026-05-22T${String(index).padStart(2, '0')}:00:00.000Z`,
      href: `/admin/orders/activity-${index}`,
    }));
    raw.push({
      id: 'bad-date',
      type: 'CS 문의',
      title: '날짜 없음',
      customerName: null,
      statusLabel: '접수',
      occurredAt: '',
      href: '/admin/support-requests/bad-date',
    });

    const limited = limitRecentActivities(buildRecentActivities(raw), 15);

    expect(limited).toHaveLength(15);
    expect(limited[0]?.id).toBe('activity-16');
    expect(limited.some((a) => a.id === 'bad-date')).toBe(false);
  });
});
