// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// 배지가 realtime 채널을 몇 번 만드는지 센다.
const channelSpy = vi.fn();

vi.mock('@/lib/supabase/browser', () => {
  const makeChannel = () => {
    const channel: Record<string, unknown> = {};
    channel.on = vi.fn(() => channel);
    channel.subscribe = vi.fn(() => channel);
    return channel;
  };
  return {
    createClient: () => ({
      channel: (name: string) => {
        channelSpy(name);
        return makeChannel();
      },
      removeChannel: vi.fn(),
      rpc: vi.fn(async () => ({ data: 0, error: null })),
    }),
  };
});

import { InboundUnreadBadge } from '@/components/inbound/InboundUnreadBadge';
import { SupportUnreadBadge } from '@/components/support/SupportUnreadBadge';

beforeEach(() => {
  channelSpy.mockClear();
  cleanup();
});

describe('읽지않음 배지 realtime 구독', () => {
  // 운영 사고 방지 조건: 리렌더링마다 구독을 새로 맺으면 서버 쪽 realtime 구독이
  // 누적되어 사이트 전체가 느려진다. 테이블 목록이 렌더링마다 새 배열이면 재발한다.
  it('여러 번 리렌더링해도 채널을 한 번만 만든다 (입고 배지)', () => {
    const { rerender } = render(<InboundUnreadBadge role="user" initial={0} />);
    rerender(<InboundUnreadBadge role="user" initial={0} />);
    rerender(<InboundUnreadBadge role="user" initial={0} />);
    rerender(<InboundUnreadBadge role="user" initial={0} />);

    expect(channelSpy).toHaveBeenCalledTimes(1);
  });

  it('여러 번 리렌더링해도 채널을 한 번만 만든다 (문의 배지)', () => {
    const { rerender } = render(<SupportUnreadBadge role="admin" initial={0} />);
    rerender(<SupportUnreadBadge role="admin" initial={0} />);
    rerender(<SupportUnreadBadge role="admin" initial={0} />);

    expect(channelSpy).toHaveBeenCalledTimes(1);
  });

  it('배지 숫자가 바뀌어도 재구독하지 않는다', () => {
    const { rerender } = render(<InboundUnreadBadge role="user" initial={0} />);
    rerender(<InboundUnreadBadge role="user" initial={3} />);
    rerender(<InboundUnreadBadge role="user" initial={7} />);

    expect(channelSpy).toHaveBeenCalledTimes(1);
  });

  it('같은 배지를 두 곳에 동시에 띄워도 채널 이름이 겹치지 않는다', () => {
    // PC 메뉴와 모바일 메뉴가 함께 마운트되므로, 이름이 같으면
    // 한쪽이 사라질 때 다른 쪽 구독까지 끊긴다.
    render(
      <>
        <InboundUnreadBadge role="admin" initial={0} />
        <InboundUnreadBadge role="admin" initial={0} />
      </>,
    );

    expect(channelSpy).toHaveBeenCalledTimes(2);
    const [first, second] = channelSpy.mock.calls.map((c) => c[0]);
    expect(first).not.toBe(second);
  });
});
