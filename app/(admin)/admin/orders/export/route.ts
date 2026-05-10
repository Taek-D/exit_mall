import { createClient } from '@/lib/supabase/server';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  total_amount: number;
  status: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_memo: string | null;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  shipped_at: string | null;
  user_id: string;
  profiles: { name: string; email: string; phone: string } | null;
  order_items: { product_name: string; quantity: number; unit_price: number; subtotal: number }[];
};

function formatDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function nextDayKstIso(dateStr: string): string {
  const start = new Date(`${dateStr}T00:00:00+09:00`);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
}

export async function GET(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .single<{ role: string; status: string }>();
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

  let query = supabase
    .from('orders')
    .select(
      'id,total_amount,status,shipping_name,shipping_phone,shipping_address,shipping_memo,tracking_number,carrier,created_at,shipped_at,user_id,profiles!orders_user_id_fkey(name,email,phone),order_items(product_name,quantity,unit_price,subtotal)',
    )
    .order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  if (fromParam) {
    query = query.gte(
      'created_at',
      dateOnly.test(fromParam) ? `${fromParam}T00:00:00+09:00` : fromParam,
    );
  }
  if (toParam) {
    query = dateOnly.test(toParam)
      ? query.lt('created_at', nextDayKstIso(toParam))
      : query.lte('created_at', toParam);
  }

  const { data, error } = await query;
  if (error) return new Response(`DB error: ${error.message}`, { status: 500 });
  const rows = (data ?? []) as unknown as OrderRow[];

  const sheetData: (string | number)[][] = [
    [
      '주문번호',
      '주문일시',
      '상태',
      '고객명',
      '고객 이메일',
      '고객 전화',
      '받는 사람',
      '연락처',
      '주소',
      '배송메모',
      '상품',
      '수량 합계',
      '총 금액(원)',
      '택배사',
      '송장번호',
      '발송일시',
    ],
  ];

  for (const order of rows) {
    const itemsText = (order.order_items ?? [])
      .map((item) => `${item.product_name} × ${item.quantity}`)
      .join(' / ');
    const totalQty = (order.order_items ?? []).reduce(
      (sum, item) => sum + Number(item.quantity ?? 0),
      0,
    );
    sheetData.push([
      order.id,
      formatDate(order.created_at),
      ORDER_STATUS_LABEL[order.status as OrderStatus] ?? order.status,
      order.profiles?.name ?? '',
      order.profiles?.email ?? '',
      order.profiles?.phone ?? '',
      order.shipping_name,
      order.shipping_phone,
      order.shipping_address,
      order.shipping_memo ?? '',
      itemsText,
      totalQty,
      Number(order.total_amount),
      order.carrier ?? '',
      order.tracking_number ?? '',
      formatDate(order.shipped_at),
    ]);
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('주문');
  worksheet.addRows(sheetData);
  worksheet.columns = [
    { width: 38 },
    { width: 18 },
    { width: 8 },
    { width: 12 },
    { width: 28 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 40 },
    { width: 24 },
    { width: 50 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
  ];
  const buffer = await workbook.xlsx.writeBuffer();

  const today = new Date();
  const tag =
    `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}` +
    (status && status !== 'all' ? `_${status}` : '');
  const filename = encodeURIComponent(`exitmall_orders_${tag}.xlsx`);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
      'Cache-Control': 'no-store',
    },
  });
}
