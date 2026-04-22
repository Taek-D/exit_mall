import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import Image from 'next/image';
import { formatKRW } from '@/lib/money';
import { DeleteProductButton } from './DeleteProductButton';

export const dynamic = 'force-dynamic';

type Product = { id: string; name: string; price: number; stock: number; image_url: string | null; is_active: boolean };

export default async function ProductsPage() {
  const supabase = createClient();
  const { data: products } = await supabase.from('products').select('*').order('created_at', { ascending: false });
  const list = (products ?? []) as unknown as Product[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">상품 관리</h1>
        <Button asChild><Link href="/admin/products/new">+ 새 상품</Link></Button>
      </div>
      {list.map(p => (
        <Card key={p.id}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="relative w-16 h-16 bg-muted rounded">
              {p.image_url && <Image src={p.image_url} alt="" fill className="object-cover rounded" sizes="64px" />}
            </div>
            <div className="flex-1">
              <p className="font-semibold">{p.name} {!p.is_active && <Badge variant="secondary">판매중지</Badge>}</p>
              <p className="text-sm">{formatKRW(Number(p.price))} · 재고 {p.stock === -1 ? '무제한' : p.stock}</p>
            </div>
            <Button asChild variant="outline" size="sm"><Link href={`/admin/products/${p.id}`}>수정</Link></Button>
            <DeleteProductButton id={p.id} name={p.name} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
