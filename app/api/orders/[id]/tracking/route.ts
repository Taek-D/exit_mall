import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { trackCjDelivery } from '@/lib/delivery/cj';
import { DeliveryTrackingError } from '@/lib/delivery/types';
import { isCjCarrier } from '@/lib/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProfileAccess = {
  role: string;
  status: string;
};

type OrderTrackingTarget = {
  id: string;
  user_id: string;
  carrier: string | null;
  tracking_number: string | null;
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401);
    }

    const service = createServiceRoleClient();
    const { data: profile } = await service
      .from('profiles')
      .select('role,status')
      .eq('id', user.id)
      .single<ProfileAccess>();

    if (!profile || profile.status !== 'active') {
      return jsonError('FORBIDDEN', '배송조회 권한이 없습니다.', 403);
    }

    const { data: order } = await service
      .from('orders')
      .select('id,user_id,carrier,tracking_number')
      .eq('id', params.id)
      .single<OrderTrackingTarget>();

    if (!order) {
      return jsonError('NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
    }

    const isAdmin = profile.role === 'admin';
    if (!isAdmin && order.user_id !== user.id) {
      return jsonError('FORBIDDEN', '배송조회 권한이 없습니다.', 403);
    }

    if (!order.tracking_number) {
      return jsonError('TRACKING_MISSING', '송장번호가 입력되지 않았습니다.', 400);
    }
    if (!isCjCarrier(order.carrier)) {
      return jsonError('UNSUPPORTED_CARRIER', 'CJ대한통운 주문만 앱 안에서 조회할 수 있습니다.', 400);
    }

    const tracking = await trackCjDelivery(order.tracking_number);
    return NextResponse.json(tracking, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof DeliveryTrackingError) {
      return jsonError(error.code, error.publicMessage, error.status);
    }
    return jsonError('UNKNOWN', '배송조회 중 오류가 발생했습니다.', 500);
  }
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, error: message }, { status, headers: noStoreHeaders() });
}

function noStoreHeaders() {
  return { 'Cache-Control': 'no-store' };
}
