import { createClient } from '@/lib/supabase/server';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import * as XLSX from 'xlsx';

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

export async function GET(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
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

  let q = supabase
    .from('orders')
    .select(
      'id,total_amount,status,shipping_name,shipping_phone,shipping_address,shipping_memo,tracking_number,carrier,created_at,shipped_at,user_id,profiles!orders_user_id_fkey(name,email,phone),order_items(product_name,quantity,unit_price,subtotal)',
    )
    .order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  if (fromParam) q = q.gte('created_at', fromParam);
  if (toParam) q = q.lte('created_at', toParam);

  const { data, error } = await q;
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

  for (const o of rows) {
    const itemsText = (o.order_items ?? [])
      .map((it) => `${it.product_name} × ${it.quantity}`)
      .join(' / ');
    const totalQty = (o.order_items ?? []).reduce((s, it) => s + Number(it.quantity ?? 0), 0);
    const statusLabel = ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status;
    sheetData.push([
      o.id,
      formatDate(o.created_at),
      statusLabel,
      o.profiles?.name ?? '',
      o.profiles?.email ?? '',
      o.profiles?.phone ?? '',
      o.shipping_name,
      o.shipping_phone,
      o.shipping_address,
      o.shipping_memo ?? '',
      itemsText,
      totalQty,
      Number(o.total_amount),
      o.carrier ?? '',
      o.tracking_number ?? '',
      formatDate(o.shipped_at),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  // Column widths
  ws['!cols'] = [
    { wch: 38 }, // 주문번호
    { wch: 18 }, // 주문일시
    { wch: 8 }, // 상태
    { wch: 12 }, // 고객명
    { wch: 28 }, // 이메일
    { wch: 14 }, // 전화
    { wch: 12 }, // 받는사람
    { wch: 14 }, // 연락처
    { wch: 40 }, // 주소
    { wch: 24 }, // 메모
    { wch: 50 }, // 상품
    { wch: 10 }, // 수량
    { wch: 14 }, // 금액
    { wch: 14 }, // 택배사
    { wch: 18 }, // 송장
    { wch: 18 }, // 발송일
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '주문');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const today = new Date();
  const tag =
    `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}` +
    (status && status !== 'all' ? `_${status}` : '');
  const filename = encodeURIComponent(`exitmall_orders_${tag}.xlsx`);

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
      'Cache-Control': 'no-store',
    },
  });
}
