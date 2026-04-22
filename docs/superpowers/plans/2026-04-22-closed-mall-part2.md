# 엑시트몰 Implementation Plan — Part 2 (Tasks 11-27)

> **For agentic workers:** Continues from `2026-04-22-closed-mall.md` (Tasks 1-10). REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Continues from:** Task 10 (layouts + nav completed)

---

## Task 11: User /shop — Product Browsing

**Files:**
- Create: `app/(user)/shop/page.tsx`, `components/ProductCard.tsx`

- [ ] **Step 1: Write ProductCard component**

`components/ProductCard.tsx`:
```tsx
'use client';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { formatKRW } from '@/lib/money';
import { useCart } from '@/components/CartProvider';
import { useToast } from '@/components/ui/use-toast';

type Product = { id: string; name: string; description: string; price: number; stock: number; image_url: string | null };

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const { toast } = useToast();
  const soldOut = product.stock === 0;

  function onAdd() {
    add({ productId: product.id, name: product.name, price: product.price, quantity: 1, imageUrl: product.image_url });
    toast({ title: '장바구니 담김', description: product.name });
  }

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square relative bg-muted">
        {product.image_url
          ? <Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="300px" />
          : <div className="flex items-center justify-center h-full text-muted-foreground text-sm">이미지 없음</div>}
      </div>
      <CardContent className="p-4 space-y-1">
        <h3 className="font-semibold">{product.name}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
        <p className="font-bold">{formatKRW(product.price)}</p>
        {product.stock >= 0 && <p className="text-xs text-muted-foreground">재고 {product.stock}개</p>}
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full" disabled={soldOut} onClick={onAdd}>
          {soldOut ? '품절' : '장바구니 담기'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: Write /shop page**

`app/(user)/shop/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

export default async function ShopPage() {
  const supabase = createClient();
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, price, stock, image_url')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return <p className="text-destructive">상품 불러오기 실패: {error.message}</p>;

  const visible = (products ?? []).filter(p => p.stock !== 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">상품</h1>
      {visible.length === 0 ? (
        <p className="text-muted-foreground">판매중인 상품이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {visible.map(p => <ProductCard key={p.id} product={{ ...p, price: Number(p.price) }} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add toast component from shadcn**

```bash
pnpm dlx shadcn@latest add toast
```
(If prompted to overwrite, yes.)

- [ ] **Step 4: Manually verify**

Insert a test product via Supabase Studio SQL Editor:
```sql
insert into public.products (name, description, price, stock, is_active) values
  ('테스트 상품', '설명', 15000, 10, true),
  ('재고무제한', '무제한 상품', 5000, -1, true);
```
Then `pnpm dev` → login as active user → `/shop` shows both products.

- [ ] **Step 5: Commit**

```bash
git add app/\(user\)/shop components/ProductCard.tsx
git commit -m "feat(shop): product listing page and ProductCard"
```

---

## Task 12: User /cart Page

**Files:**
- Create: `app/(user)/cart/page.tsx`

- [ ] **Step 1: Write cart page**

`app/(user)/cart/page.tsx`:
```tsx
'use client';
import { useCart } from '@/components/CartProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { formatKRW } from '@/lib/money';
import Image from 'next/image';
import Link from 'next/link';

export default function CartPage() {
  const { items, updateQty, remove, total, clear } = useCart();

  if (items.length === 0) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-muted-foreground">장바구니가 비어있습니다.</p>
        <Button asChild><Link href="/shop">상품 보러가기</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">장바구니</h1>
      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.productId}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="relative w-16 h-16 bg-muted rounded">
                {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill className="object-cover rounded" sizes="64px" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-muted-foreground">{formatKRW(item.price)}</p>
              </div>
              <Input
                type="number" min={1} className="w-20"
                value={item.quantity}
                onChange={e => updateQty(item.productId, parseInt(e.target.value, 10) || 1)}
              />
              <p className="w-24 text-right font-semibold">{formatKRW(item.price * item.quantity)}</p>
              <Button variant="ghost" size="sm" onClick={() => remove(item.productId)}>삭제</Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <p className="text-lg">합계</p>
          <p className="text-2xl font-bold">{formatKRW(total)}</p>
        </CardContent>
      </Card>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={clear}>비우기</Button>
        <Button asChild><Link href="/checkout">주문하기</Link></Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

`pnpm dev` → add items from `/shop` → `/cart` shows, qty change, delete, clear all work.

- [ ] **Step 3: Commit**

```bash
git add app/\(user\)/cart
git commit -m "feat(cart): cart page with qty editing and total"
```

---

## Task 13: User /checkout + place_order Server Action

**Files:**
- Create: `app/(user)/checkout/page.tsx`, `lib/actions/order.ts`

- [ ] **Step 1: Write order Server Action**

`lib/actions/order.ts`:
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { checkoutSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';

export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; productId?: string };

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('place_order', {
    items: parsed.data.items.map(i => ({ product_id: i.productId, quantity: i.quantity })),
    shipping: {
      name: parsed.data.shipping.name,
      phone: parsed.data.shipping.phone,
      address: parsed.data.shipping.address,
      memo: parsed.data.shipping.memo ?? '',
    },
  });

  if (error) {
    const msg = error.message;
    if (msg.includes('INSUFFICIENT_BALANCE')) return { ok: false, error: '예치금이 부족합니다' };
    if (msg.includes('OUT_OF_STOCK')) {
      const productId = msg.split(':')[1]?.trim();
      return { ok: false, error: '재고가 부족합니다', productId };
    }
    if (msg.includes('PRODUCT_INACTIVE')) {
      const productId = msg.split(':')[1]?.trim();
      return { ok: false, error: '판매 중지된 상품이 있습니다', productId };
    }
    if (msg.includes('NOT_ACTIVE')) return { ok: false, error: '계정이 활성 상태가 아닙니다' };
    return { ok: false, error: msg };
  }

  revalidatePath('/orders');
  revalidatePath('/shop');
  return { ok: true, orderId: data as string };
}

export async function cancelOrderAction(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_order', { order_id: orderId });
  if (error) {
    if (error.message.includes('NOT_CANCELLABLE')) return { ok: false, error: '이미 처리되어 취소할 수 없습니다' };
    return { ok: false, error: error.message };
  }
  revalidatePath('/orders');
  return { ok: true };
}
```

- [ ] **Step 2: Write /checkout page**

`app/(user)/checkout/page.tsx`:
```tsx
'use client';
import { useCart } from '@/components/CartProvider';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { placeOrderAction } from '@/lib/actions/order';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatKRW } from '@/lib/money';
import { useToast } from '@/components/ui/use-toast';

export default function CheckoutPage() {
  const { items, total, remove, clear } = useCart();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const [shipping, setShipping] = useState({ name: '', phone: '', address: '', memo: '' });

  if (items.length === 0) {
    return <div className="py-12 text-center"><p>장바구니가 비어있습니다.</p></div>;
  }

  function submit() {
    setError(null);
    start(async () => {
      const result = await placeOrderAction({
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
        shipping,
      });
      if (!result.ok) {
        setError(result.error);
        if (result.productId) remove(result.productId);
        return;
      }
      clear();
      toast({ title: '주문 완료', description: '주문이 접수되었습니다' });
      router.push('/orders');
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">주문서 작성</h1>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold mb-2">주문 항목</h2>
          {items.map(i => (
            <div key={i.productId} className="flex justify-between text-sm">
              <span>{i.name} × {i.quantity}</span>
              <span>{formatKRW(i.price * i.quantity)}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-bold">
            <span>합계</span><span>{formatKRW(total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="font-semibold">배송 정보</h2>
          <div><Label>받는 사람 *</Label><Input value={shipping.name} onChange={e => setShipping({...shipping, name: e.target.value})} /></div>
          <div><Label>연락처 * (010-1234-5678)</Label><Input value={shipping.phone} onChange={e => setShipping({...shipping, phone: e.target.value})} /></div>
          <div><Label>주소 *</Label><Input value={shipping.address} onChange={e => setShipping({...shipping, address: e.target.value})} /></div>
          <div><Label>배송 메모</Label><Textarea value={shipping.memo} onChange={e => setShipping({...shipping, memo: e.target.value})} /></div>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => router.push('/cart')}>장바구니로</Button>
        <Button onClick={submit} disabled={pending}>{pending ? '주문중...' : `${formatKRW(total)} 결제`}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manually verify golden path**

`pnpm dev` → log in as active user with deposit_balance > 0 (set via SQL Studio):
```sql
update public.profiles set deposit_balance = 100000 where email='test@example.com';
```
Add items to cart → `/checkout` → fill form → submit → should redirect to `/orders`.

Then check DB:
```sql
select id, total_amount, status from public.orders order by created_at desc limit 1;
select type, amount, balance_after from public.balance_transactions order by created_at desc limit 1;
select deposit_balance from public.profiles where email='test@example.com';
```

- [ ] **Step 4: Commit**

```bash
git add app/\(user\)/checkout lib/actions/order.ts
git commit -m "feat(order): checkout page with place_order RPC integration"
```

---

## Task 14: User /deposit — List + New Request

**Files:**
- Create: `app/(user)/deposit/page.tsx`, `app/(user)/deposit/new/page.tsx`, `lib/actions/deposit.ts`

- [ ] **Step 1: Write deposit Server Action**

`lib/actions/deposit.ts`:
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { depositRequestSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createDepositRequestAction(formData: FormData) {
  const parsed = depositRequestSchema.safeParse({
    amount: Number(formData.get('amount')),
    depositorName: String(formData.get('depositorName') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { error } = await supabase.from('deposit_requests').insert({
    user_id: user.id,
    amount: parsed.data.amount,
    depositor_name: parsed.data.depositorName,
  });
  if (error) return { error: error.message };

  revalidatePath('/deposit');
  redirect('/deposit');
}
```

- [ ] **Step 2: Write /deposit list page**

`app/(user)/deposit/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatKRW } from '@/lib/money';
import { DEPOSIT_STATUS_LABEL, type DepositStatus } from '@/lib/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function statusVariant(s: DepositStatus): 'default'|'secondary'|'destructive' {
  return s === 'confirmed' ? 'default' : s === 'rejected' ? 'destructive' : 'secondary';
}

export default async function DepositListPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('deposit_balance').eq('id', user!.id).single();
  const { data: requests } = await supabase.from('deposit_requests')
    .select('id,amount,depositor_name,status,admin_memo,created_at,confirmed_at')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">예치금</h1>
        <Button asChild><Link href="/deposit/new">이체 요청</Link></Button>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <span>현재 잔액</span>
          <span className="text-2xl font-bold">{formatKRW(Number(profile?.deposit_balance ?? 0))}</span>
        </CardContent>
      </Card>

      <h2 className="font-semibold mt-6">이체 요청 내역</h2>
      {(!requests || requests.length === 0) ? (
        <p className="text-muted-foreground">요청 내역이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{formatKRW(Number(r.amount))}</p>
                  <p className="text-sm text-muted-foreground">입금자명: {r.depositor_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
                  {r.admin_memo && <p className="text-xs text-destructive">사유: {r.admin_memo}</p>}
                </div>
                <Badge variant={statusVariant(r.status as DepositStatus)}>{DEPOSIT_STATUS_LABEL[r.status as DepositStatus]}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write /deposit/new page**

`app/(user)/deposit/new/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { createDepositRequestAction } from '@/lib/actions/deposit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

export default async function NewDepositPage() {
  const supabase = createClient();
  const { data: settings } = await supabase.from('app_settings').select('*').eq('id', 1).single();

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">예치금 이체 요청</h1>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold">입금 계좌</h2>
          {settings?.bank_name ? (
            <>
              <p>{settings.bank_name} {settings.bank_account_number}</p>
              <p className="text-sm text-muted-foreground">예금주: {settings.bank_account_holder}</p>
              {settings.notice && <Alert className="mt-2"><AlertDescription>{settings.notice}</AlertDescription></Alert>}
            </>
          ) : (
            <Alert variant="destructive"><AlertDescription>관리자가 계좌 정보를 아직 설정하지 않았습니다.</AlertDescription></Alert>
          )}
        </CardContent>
      </Card>

      <form action={createDepositRequestAction} className="space-y-4">
        <div><Label htmlFor="amount">금액 (최소 1,000원)</Label><Input id="amount" name="amount" type="number" min={1000} step={1000} required /></div>
        <div><Label htmlFor="depositorName">입금자명</Label><Input id="depositorName" name="depositorName" required /></div>
        <Button type="submit" className="w-full">이체 완료 (확인 요청)</Button>
        <p className="text-xs text-muted-foreground">이체 후 본 버튼을 누르면 관리자에게 확인 요청이 전송됩니다. 관리자 확인 후 예치금이 반영됩니다.</p>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Manually verify**

`pnpm dev` → `/deposit` → "이체 요청" → fill form → back to list. Admin in SQL Studio can confirm:
```sql
select public.confirm_deposit('<request-id>'::uuid);
```
Then user sees balance updated.

- [ ] **Step 5: Commit**

```bash
git add app/\(user\)/deposit lib/actions/deposit.ts
git commit -m "feat(deposit): user deposit request flow + list"
```

---

## Task 15: User /orders + Cancel

**Files:**
- Create: `app/(user)/orders/page.tsx`, `components/OrderCancelButton.tsx`

- [ ] **Step 1: Write OrderCancelButton**

`components/OrderCancelButton.tsx`:
```tsx
'use client';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cancelOrderAction } from '@/lib/actions/order';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

export function OrderCancelButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function handle() {
    if (!confirm('주문을 취소하시겠습니까? 잔액이 복원됩니다.')) return;
    start(async () => {
      const result = await cancelOrderAction(orderId);
      if (result.ok) {
        toast({ title: '주문 취소 완료' });
        router.refresh();
      } else {
        toast({ title: '취소 실패', description: result.error, variant: 'destructive' });
      }
    });
  }

  return <Button variant="outline" size="sm" onClick={handle} disabled={pending}>{pending ? '...' : '주문 취소'}</Button>;
}
```

- [ ] **Step 2: Write /orders page**

`app/(user)/orders/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatKRW } from '@/lib/money';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { OrderCancelButton } from '@/components/OrderCancelButton';

export const dynamic = 'force-dynamic';

export default async function MyOrdersPage() {
  const supabase = createClient();
  const { data: orders } = await supabase
    .from('orders')
    .select('id,total_amount,status,shipping_name,tracking_number,carrier,created_at,order_items(product_name,quantity,unit_price,subtotal)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">주문 내역</h1>
      {(!orders || orders.length === 0) ? (
        <p className="text-muted-foreground">주문 내역이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {orders.map(o => (
            <Card key={o.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">주문번호 {o.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString('ko-KR')}</p>
                  </div>
                  <Badge>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</Badge>
                </div>
                <div className="text-sm">
                  {(o.order_items as any[]).map((it, i) => (
                    <p key={i}>{it.product_name} × {it.quantity} — {formatKRW(Number(it.subtotal))}</p>
                  ))}
                </div>
                {o.tracking_number && (
                  <p className="text-sm">송장: {o.carrier} {o.tracking_number}</p>
                )}
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-bold">{formatKRW(Number(o.total_amount))}</span>
                  {o.status === 'placed' && <OrderCancelButton orderId={o.id} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manually verify**

Place an order → `/orders` shows it with 접수 badge + cancel button. Click cancel → balance restored, order shows 취소 badge.

- [ ] **Step 4: Commit**

```bash
git add app/\(user\)/orders components/OrderCancelButton.tsx
git commit -m "feat(orders): user order list with cancel"
```

---

## Task 16: Integration Tests for RPC Functions

**Files:**
- Create: `tests/integration/helpers.ts`, `tests/integration/place-order.test.ts`, `tests/integration/confirm-deposit.test.ts`, `tests/integration/cancel-order.test.ts`

- [ ] **Step 1: Write test helpers**

`tests/integration/helpers.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
// Default Supabase local service_role — check `supabase status` output
const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export function adminClient(): SupabaseClient {
  return createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export async function createTestUser(email: string, role: 'user'|'admin' = 'user'): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'testpassword123', email_confirm: true,
    user_metadata: { name: 'Test', phone: '010-1234-5678' },
  });
  if (error) throw error;
  const userId = data.user!.id;
  await admin.from('profiles').update({ status: 'active', role }).eq('id', userId);
  return userId;
}

export async function userClient(email: string, password = 'testpassword123'): Promise<SupabaseClient> {
  const ANON = process.env.SUPABASE_TEST_ANON_KEY
    ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function wipeDb() {
  const admin = adminClient();
  await admin.from('balance_transactions').delete().gte('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('order_items').delete().gte('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('orders').delete().gte('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('deposit_requests').delete().gte('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('products').delete().gte('id', '00000000-0000-0000-0000-000000000000');
  const { data: users } = await admin.auth.admin.listUsers();
  for (const u of users.users) await admin.auth.admin.deleteUser(u.id);
}

export async function seedProduct(price: number, stock: number): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.from('products')
    .insert({ name: `P-${price}-${stock}`, description: '', price, stock, is_active: true })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

export async function setBalance(userId: string, balance: number) {
  await adminClient().from('profiles').update({ deposit_balance: balance }).eq('id', userId);
}

export async function getBalance(userId: string): Promise<number> {
  const { data } = await adminClient().from('profiles').select('deposit_balance').eq('id', userId).single();
  return Number(data!.deposit_balance);
}
```

- [ ] **Step 2: Write place_order integration tests**

`tests/integration/place-order.test.ts`:
```typescript
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { adminClient, createTestUser, userClient, wipeDb, seedProduct, setBalance, getBalance } from './helpers';

const SHIPPING = { name: '홍길동', phone: '010-1111-2222', address: '서울시 강남구', memo: '' };

describe('place_order RPC', () => {
  beforeAll(async () => { await wipeDb(); });
  beforeEach(async () => { await wipeDb(); });

  it('deducts balance and stock on successful order', async () => {
    const userId = await createTestUser('user1@test.com');
    await setBalance(userId, 50000);
    const productId = await seedProduct(10000, 5);
    const client = await userClient('user1@test.com');
    const { data, error } = await client.rpc('place_order', {
      items: [{ product_id: productId, quantity: 2 }],
      shipping: SHIPPING,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(await getBalance(userId)).toBe(30000);
    const { data: p } = await adminClient().from('products').select('stock').eq('id', productId).single();
    expect(p!.stock).toBe(3);
  });

  it('fails with INSUFFICIENT_BALANCE when balance < total', async () => {
    const userId = await createTestUser('user2@test.com');
    await setBalance(userId, 1000);
    const productId = await seedProduct(10000, 5);
    const client = await userClient('user2@test.com');
    const { error } = await client.rpc('place_order', {
      items: [{ product_id: productId, quantity: 1 }],
      shipping: SHIPPING,
    });
    expect(error?.message).toContain('INSUFFICIENT_BALANCE');
    expect(await getBalance(userId)).toBe(1000);
  });

  it('fails with OUT_OF_STOCK when stock insufficient', async () => {
    const userId = await createTestUser('user3@test.com');
    await setBalance(userId, 100000);
    const productId = await seedProduct(10000, 2);
    const client = await userClient('user3@test.com');
    const { error } = await client.rpc('place_order', {
      items: [{ product_id: productId, quantity: 5 }],
      shipping: SHIPPING,
    });
    expect(error?.message).toContain('OUT_OF_STOCK');
    expect(await getBalance(userId)).toBe(100000);
  });

  it('accepts unlimited stock (-1) products', async () => {
    const userId = await createTestUser('user4@test.com');
    await setBalance(userId, 50000);
    const productId = await seedProduct(5000, -1);
    const client = await userClient('user4@test.com');
    const { error } = await client.rpc('place_order', {
      items: [{ product_id: productId, quantity: 3 }],
      shipping: SHIPPING,
    });
    expect(error).toBeNull();
    expect(await getBalance(userId)).toBe(35000);
  });

  it('writes balance_transaction ledger', async () => {
    const userId = await createTestUser('user5@test.com');
    await setBalance(userId, 50000);
    const productId = await seedProduct(10000, 5);
    const client = await userClient('user5@test.com');
    const { data: orderId } = await client.rpc('place_order', {
      items: [{ product_id: productId, quantity: 1 }],
      shipping: SHIPPING,
    });
    const { data: txs } = await adminClient().from('balance_transactions')
      .select('*').eq('user_id', userId);
    expect(txs).toHaveLength(1);
    expect(txs![0].type).toBe('order');
    expect(Number(txs![0].amount)).toBe(-10000);
    expect(Number(txs![0].balance_after)).toBe(40000);
    expect(txs![0].ref_id).toBe(orderId);
  });
});
```

- [ ] **Step 3: Write confirm_deposit / cancel_order tests**

`tests/integration/confirm-deposit.test.ts`:
```typescript
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { adminClient, createTestUser, userClient, wipeDb, getBalance } from './helpers';

describe('confirm_deposit RPC', () => {
  beforeAll(async () => { await wipeDb(); });
  beforeEach(async () => { await wipeDb(); });

  it('confirms a pending request and credits balance', async () => {
    const userId = await createTestUser('u1@t.com');
    const adminId = await createTestUser('a1@t.com', 'admin');
    const userClientX = await userClient('u1@t.com');
    const { data: req } = await userClientX.from('deposit_requests')
      .insert({ user_id: userId, amount: 50000, depositor_name: 'X' })
      .select('id').single();

    const adminX = await userClient('a1@t.com');
    const { error } = await adminX.rpc('confirm_deposit', { request_id: req!.id });
    expect(error).toBeNull();
    expect(await getBalance(userId)).toBe(50000);
  });

  it('rejects duplicate confirmation', async () => {
    const userId = await createTestUser('u2@t.com');
    const adminId = await createTestUser('a2@t.com', 'admin');
    const userClientX = await userClient('u2@t.com');
    const { data: req } = await userClientX.from('deposit_requests')
      .insert({ user_id: userId, amount: 30000, depositor_name: 'Y' })
      .select('id').single();

    const adminX = await userClient('a2@t.com');
    await adminX.rpc('confirm_deposit', { request_id: req!.id });
    const { error } = await adminX.rpc('confirm_deposit', { request_id: req!.id });
    expect(error?.message).toContain('ALREADY_PROCESSED');
    expect(await getBalance(userId)).toBe(30000);  // only credited once
  });

  it('rejects non-admin callers', async () => {
    const userId = await createTestUser('u3@t.com');
    const userClientX = await userClient('u3@t.com');
    const { data: req } = await userClientX.from('deposit_requests')
      .insert({ user_id: userId, amount: 10000, depositor_name: 'Z' })
      .select('id').single();
    const { error } = await userClientX.rpc('confirm_deposit', { request_id: req!.id });
    expect(error?.message).toContain('FORBIDDEN');
  });
});
```

`tests/integration/cancel-order.test.ts`:
```typescript
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { adminClient, createTestUser, userClient, wipeDb, seedProduct, setBalance, getBalance } from './helpers';

const SHIPPING = { name: 'A', phone: '010-1111-2222', address: '주소', memo: '' };

describe('cancel_order RPC', () => {
  beforeAll(async () => { await wipeDb(); });
  beforeEach(async () => { await wipeDb(); });

  it('restores balance and stock on cancel', async () => {
    const userId = await createTestUser('c1@t.com');
    await setBalance(userId, 50000);
    const productId = await seedProduct(10000, 5);
    const client = await userClient('c1@t.com');
    const { data: orderId } = await client.rpc('place_order', {
      items: [{ product_id: productId, quantity: 2 }],
      shipping: SHIPPING,
    });
    expect(await getBalance(userId)).toBe(30000);

    const { error } = await client.rpc('cancel_order', { order_id: orderId });
    expect(error).toBeNull();
    expect(await getBalance(userId)).toBe(50000);
    const { data: p } = await adminClient().from('products').select('stock').eq('id', productId).single();
    expect(p!.stock).toBe(5);
  });

  it('blocks non-owner user from cancelling', async () => {
    const ownerId = await createTestUser('c2@t.com');
    const otherId = await createTestUser('c3@t.com');
    await setBalance(ownerId, 50000);
    const productId = await seedProduct(5000, 10);
    const owner = await userClient('c2@t.com');
    const { data: orderId } = await owner.rpc('place_order', {
      items: [{ product_id: productId, quantity: 1 }],
      shipping: SHIPPING,
    });
    const other = await userClient('c3@t.com');
    const { error } = await other.rpc('cancel_order', { order_id: orderId });
    expect(error?.message).toMatch(/FORBIDDEN|NOT_FOUND/);
  });

  it('admin can cancel any order and writes ledger with admin_id', async () => {
    const ownerId = await createTestUser('c4@t.com');
    const adminId = await createTestUser('c5@t.com', 'admin');
    await setBalance(ownerId, 30000);
    const productId = await seedProduct(5000, 10);
    const owner = await userClient('c4@t.com');
    const { data: orderId } = await owner.rpc('place_order', {
      items: [{ product_id: productId, quantity: 1 }],
      shipping: SHIPPING,
    });
    const admin = await userClient('c5@t.com');
    const { error } = await admin.rpc('cancel_order', { order_id: orderId });
    expect(error).toBeNull();
    expect(await getBalance(ownerId)).toBe(30000);
    const { data: tx } = await adminClient().from('balance_transactions')
      .select('*').eq('user_id', ownerId).eq('type', 'refund').single();
    expect(tx!.admin_id).toBe(adminId);
  });
});
```

- [ ] **Step 4: Run integration tests**

Make sure Supabase is running (`pnpm supabase start`), then:
```bash
pnpm test tests/integration
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/integration
git commit -m "test(rpc): integration tests for place_order, confirm_deposit, cancel_order"
```

---

## Task 17: Admin Dashboard

**Files:**
- Create: `app/(admin)/admin/page.tsx`

- [ ] **Step 1: Write admin dashboard**

`app/(admin)/admin/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = createClient();
  const [
    { count: newOrders },
    { count: pendingApprovals },
    { count: pendingDeposits },
    { count: lowBalance },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'placed'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('deposit_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.rpc('count_low_balance_users' as any, {} as any).then(r => ({ count: 0 })).catch(() => ({ count: 0 })),
    supabase.from('orders').select('id,user_id,total_amount,status,created_at').order('created_at', { ascending: false }).limit(10),
  ]);

  // Compute low-balance count in JS (no RPC for this — simple enough)
  const { data: lbUsers } = await supabase.from('profiles').select('deposit_balance,low_balance_threshold').eq('role','user');
  const lowBalanceCount = (lbUsers ?? []).filter(p => Number(p.deposit_balance) <= Number(p.low_balance_threshold)).length;

  const widgets = [
    { label: '신규 주문', value: newOrders ?? 0, href: '/admin/orders?status=placed' },
    { label: '승인 대기', value: pendingApprovals ?? 0, href: '/admin/approvals' },
    { label: '입금 확인 대기', value: pendingDeposits ?? 0, href: '/admin/deposits' },
    { label: '잔액 부족 고객', value: lowBalanceCount, href: '/admin/low-balance' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {widgets.map(w => (
          <Link key={w.label} href={w.href}>
            <Card className="hover:bg-muted transition">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{w.label}</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold">{w.value}</p></CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="font-semibold mb-2">최근 주문</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr>
                <th className="text-left p-2">주문번호</th><th className="text-left p-2">사용자</th>
                <th className="text-right p-2">금액</th><th className="text-left p-2">상태</th><th className="text-left p-2">시간</th>
              </tr></thead>
              <tbody>
                {(recentOrders ?? []).map(o => (
                  <tr key={o.id} className="border-t">
                    <td className="p-2"><Link href={`/admin/orders/${o.id}`} className="underline">{o.id.slice(0,8)}</Link></td>
                    <td className="p-2">{o.user_id.slice(0,8)}</td>
                    <td className="p-2 text-right">{formatKRW(Number(o.total_amount))}</td>
                    <td className="p-2"><Badge>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</Badge></td>
                    <td className="p-2">{new Date(o.created_at).toLocaleString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Log in as admin → `/admin` → widgets show counts. Click through to relevant pages (will 404 until built).

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/page.tsx
git commit -m "feat(admin): dashboard with stat widgets and recent orders"
```

---

## Task 18: Admin /approvals

**Files:**
- Create: `app/(admin)/admin/approvals/page.tsx`, `lib/actions/admin-approvals.ts`

- [ ] **Step 1: Write approvals Server Actions**

`lib/actions/admin-approvals.ts`:
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function approveUserAction(userId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('profiles')
    .update({ status: 'active', approved_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
  return { ok: true };
}

export async function rejectUserAction(userId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('profiles').update({ status: 'suspended' }).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath('/admin/approvals');
  return { ok: true };
}
```

- [ ] **Step 2: Write /approvals page**

`app/(admin)/admin/approvals/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { ApprovalRow } from './ApprovalRow';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const supabase = createClient();
  const { data: pending } = await supabase.from('profiles')
    .select('id,email,name,phone,created_at').eq('status', 'pending').order('created_at');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">가입 승인</h1>
      {(!pending || pending.length === 0) ? (
        <p className="text-muted-foreground">대기 중인 가입 요청이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {pending.map(p => <ApprovalRow key={p.id} profile={p} />)}
        </div>
      )}
    </div>
  );
}
```

`app/(admin)/admin/approvals/ApprovalRow.tsx`:
```tsx
'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTransition } from 'react';
import { approveUserAction, rejectUserAction } from '@/lib/actions/admin-approvals';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

export function ApprovalRow({ profile }: { profile: { id: string; email: string; name: string; phone: string; created_at: string } }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function act(fn: (id: string) => Promise<any>, success: string) {
    start(async () => {
      const r = await fn(profile.id);
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else { toast({ title: success }); router.refresh(); }
    });
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">{profile.name}</p>
          <p className="text-sm text-muted-foreground">{profile.email} · {profile.phone}</p>
          <p className="text-xs text-muted-foreground">{new Date(profile.created_at).toLocaleString('ko-KR')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => act(approveUserAction, '승인 완료')} disabled={pending}>승인</Button>
          <Button size="sm" variant="outline" onClick={() => act(rejectUserAction, '반려 완료')} disabled={pending}>반려</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Manually verify**

Sign up a new user → login as admin → `/admin/approvals` → approve → new user can now login.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/admin/approvals lib/actions/admin-approvals.ts
git commit -m "feat(admin): approvals page with approve/reject"
```

---

## Task 19: Admin /deposits

**Files:**
- Create: `app/(admin)/admin/deposits/page.tsx`, `app/(admin)/admin/deposits/DepositRow.tsx`, `lib/actions/admin-deposits.ts`

- [ ] **Step 1: Write actions**

`lib/actions/admin-deposits.ts`:
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function confirmDepositAction(requestId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('confirm_deposit', { request_id: requestId });
  if (error) {
    if (error.message.includes('ALREADY_PROCESSED')) return { error: '이미 처리된 요청입니다' };
    return { error: error.message };
  }
  revalidatePath('/admin/deposits');
  revalidatePath('/admin');
  return { ok: true };
}

export async function rejectDepositAction(requestId: string, memo: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('reject_deposit', { request_id: requestId, memo });
  if (error) return { error: error.message };
  revalidatePath('/admin/deposits');
  return { ok: true };
}
```

- [ ] **Step 2: Write /deposits page**

`app/(admin)/admin/deposits/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { DepositRow } from './DepositRow';

export const dynamic = 'force-dynamic';

export default async function AdminDepositsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('deposit_requests')
    .select('id,amount,depositor_name,created_at,user_id,profiles!inner(name,email,phone)')
    .eq('status', 'pending').order('created_at');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">입금 확인</h1>
      {(!data || data.length === 0) ? (
        <p className="text-muted-foreground">대기 중인 이체 요청이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {data.map((r: any) => (
            <DepositRow key={r.id} request={{
              id: r.id, amount: Number(r.amount), depositorName: r.depositor_name,
              createdAt: r.created_at, userName: r.profiles.name, userEmail: r.profiles.email, userPhone: r.profiles.phone,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
```

`app/(admin)/admin/deposits/DepositRow.tsx`:
```tsx
'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { confirmDepositAction, rejectDepositAction } from '@/lib/actions/admin-deposits';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { formatKRW } from '@/lib/money';

type Props = { request: { id: string; amount: number; depositorName: string; createdAt: string; userName: string; userEmail: string; userPhone: string } };

export function DepositRow({ request }: Props) {
  const [pending, start] = useTransition();
  const [memo, setMemo] = useState('');
  const { toast } = useToast();
  const router = useRouter();

  function confirm() {
    start(async () => {
      const r = await confirmDepositAction(request.id);
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else { toast({ title: '입금 확인 완료' }); router.refresh(); }
    });
  }
  function reject() {
    const m = prompt('반려 사유를 입력하세요', memo) ?? '';
    if (!m) return;
    start(async () => {
      const r = await rejectDepositAction(request.id, m);
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else { toast({ title: '반려 완료' }); router.refresh(); }
    });
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">{request.userName} — {formatKRW(request.amount)}</p>
          <p className="text-sm text-muted-foreground">입금자명: {request.depositorName}</p>
          <p className="text-xs text-muted-foreground">{request.userEmail} · {request.userPhone}</p>
          <p className="text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleString('ko-KR')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={confirm} disabled={pending}>확인</Button>
          <Button size="sm" variant="outline" onClick={reject} disabled={pending}>반려</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Manually verify**

User submits deposit request → admin /admin/deposits → confirm → user balance updated.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/admin/deposits lib/actions/admin-deposits.ts
git commit -m "feat(admin): deposit confirmation/rejection flow"
```

---

## Task 20: Admin /products CRUD + Image Upload

**Files:**
- Create: `app/(admin)/admin/products/page.tsx`, `app/(admin)/admin/products/new/page.tsx`, `app/(admin)/admin/products/[id]/page.tsx`, `components/ProductImageUpload.tsx`, `lib/actions/admin-products.ts`

- [ ] **Step 1: Write actions**

`lib/actions/admin-products.ts`:
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { productSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function parseForm(fd: FormData) {
  return productSchema.safeParse({
    name: fd.get('name'),
    description: fd.get('description') ?? '',
    price: Number(fd.get('price')),
    stock: Number(fd.get('stock')),
    isActive: fd.get('isActive') === 'on',
    imageUrl: (fd.get('imageUrl') as string) || null,
  });
}

export async function createProductAction(fd: FormData) {
  const parsed = parseForm(fd);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = createClient();
  const { error } = await supabase.from('products').insert({
    name: parsed.data.name, description: parsed.data.description,
    price: parsed.data.price, stock: parsed.data.stock,
    is_active: parsed.data.isActive, image_url: parsed.data.imageUrl,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/products');
  redirect('/admin/products');
}

export async function updateProductAction(id: string, fd: FormData) {
  const parsed = parseForm(fd);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = createClient();
  const { error } = await supabase.from('products').update({
    name: parsed.data.name, description: parsed.data.description,
    price: parsed.data.price, stock: parsed.data.stock,
    is_active: parsed.data.isActive, image_url: parsed.data.imageUrl,
  }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/products');
  redirect('/admin/products');
}

export async function deleteProductAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/products');
  return { ok: true };
}
```

- [ ] **Step 2: Write ProductImageUpload component**

`components/ProductImageUpload.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Image from 'next/image';

export function ProductImageUpload({ defaultUrl }: { defaultUrl?: string | null }) {
  const [url, setUrl] = useState<string | null>(defaultUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setUploading(true);
    const supabase = createClient();
    const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, { upsert: false });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path);
    setUrl(pub.publicUrl);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      {url && <div className="relative w-32 h-32"><Image src={url} alt="" fill className="object-cover rounded" sizes="128px" /></div>}
      <Input type="file" accept="image/*" onChange={onFile} disabled={uploading} />
      <input type="hidden" name="imageUrl" value={url ?? ''} />
      {uploading && <p className="text-sm text-muted-foreground">업로드중...</p>}
      {error && <p className="text-sm text-destructive">업로드 실패: {error} (이미지 없이 저장 가능)</p>}
      {url && <Button type="button" variant="outline" size="sm" onClick={() => setUrl(null)}>이미지 제거</Button>}
    </div>
  );
}
```

- [ ] **Step 3: Write /admin/products list**

`app/(admin)/admin/products/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import Image from 'next/image';
import { formatKRW } from '@/lib/money';
import { DeleteProductButton } from './DeleteProductButton';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const supabase = createClient();
  const { data: products } = await supabase.from('products').select('*').order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">상품 관리</h1>
        <Button asChild><Link href="/admin/products/new">+ 새 상품</Link></Button>
      </div>
      {(products ?? []).map(p => (
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
```

`app/(admin)/admin/products/DeleteProductButton.tsx`:
```tsx
'use client';
import { Button } from '@/components/ui/button';
import { deleteProductAction } from '@/lib/actions/admin-products';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  function handle() {
    if (!confirm(`"${name}" 상품을 삭제하시겠습니까? 과거 주문 내역은 보존됩니다.`)) return;
    start(async () => {
      const r = await deleteProductAction(id);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else { toast({ title: '삭제 완료' }); router.refresh(); }
    });
  }
  return <Button size="sm" variant="destructive" onClick={handle} disabled={pending}>삭제</Button>;
}
```

- [ ] **Step 4: Write /admin/products/new and /[id]**

`app/(admin)/admin/products/new/page.tsx`:
```tsx
import { createProductAction } from '@/lib/actions/admin-products';
import { ProductForm } from '../ProductForm';

export default function NewProductPage() {
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-4">새 상품</h1>
      <ProductForm action={createProductAction} />
    </div>
  );
}
```

`app/(admin)/admin/products/ProductForm.tsx`:
```tsx
'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProductImageUpload } from '@/components/ProductImageUpload';
import { useState, useTransition } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Props = {
  action: (fd: FormData) => Promise<{ error?: string } | void>;
  defaults?: { name: string; description: string; price: number; stock: number; is_active: boolean; image_url: string | null };
};

export function ProductForm({ action, defaults }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(fd: FormData) {
    setError(null);
    start(async () => {
      const r = await action(fd);
      if (r && 'error' in r && r.error) setError(r.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div><Label>이름 *</Label><Input name="name" required defaultValue={defaults?.name} /></div>
      <div><Label>설명</Label><Textarea name="description" defaultValue={defaults?.description} /></div>
      <div><Label>가격 (원) *</Label><Input name="price" type="number" min={0} required defaultValue={defaults?.price} /></div>
      <div><Label>재고 (-1 = 무제한) *</Label><Input name="stock" type="number" min={-1} required defaultValue={defaults?.stock ?? 0} /></div>
      <div className="flex items-center gap-2"><input id="isActive" name="isActive" type="checkbox" defaultChecked={defaults?.is_active ?? true} /><Label htmlFor="isActive">판매중</Label></div>
      <div><Label>이미지</Label><ProductImageUpload defaultUrl={defaults?.image_url ?? null} /></div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="submit" disabled={pending}>{pending ? '저장중...' : '저장'}</Button>
    </form>
  );
}
```

`app/(admin)/admin/products/[id]/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { ProductForm } from '../ProductForm';
import { updateProductAction } from '@/lib/actions/admin-products';
import { notFound } from 'next/navigation';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: p } = await supabase.from('products').select('*').eq('id', params.id).single();
  if (!p) notFound();

  const bound = updateProductAction.bind(null, params.id);

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-4">상품 수정</h1>
      <ProductForm action={bound as any} defaults={{
        name: p.name, description: p.description, price: Number(p.price), stock: p.stock,
        is_active: p.is_active, image_url: p.image_url,
      }} />
    </div>
  );
}
```

- [ ] **Step 5: Manually verify**

Admin creates product with image → appears in `/shop`. Edit, deactivate, delete all work.

- [ ] **Step 6: Commit**

```bash
git add app/\(admin\)/admin/products components/ProductImageUpload.tsx lib/actions/admin-products.ts
git commit -m "feat(admin): product CRUD with image upload"
```

---

## Task 21: Admin /orders List + Detail + Transitions

**Files:**
- Create: `app/(admin)/admin/orders/page.tsx`, `app/(admin)/admin/orders/[id]/page.tsx`, `app/(admin)/admin/orders/[id]/TransitionButtons.tsx`, `lib/actions/admin-orders.ts`

- [ ] **Step 1: Write actions**

`lib/actions/admin-orders.ts`:
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function markPreparingAction(orderId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('transition_order_status', { order_id: orderId, next_status: 'preparing' });
  if (error) return { error: error.message };
  revalidatePath(`/admin/orders/${orderId}`); revalidatePath('/admin/orders'); revalidatePath('/admin');
  return { ok: true };
}

export async function markShippedAction(orderId: string, tracking: string, carrier: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('transition_order_status', {
    order_id: orderId, next_status: 'shipped', tracking, carrier_name: carrier,
  });
  if (error) {
    if (error.message.includes('TRACKING_REQUIRED')) return { error: '송장번호와 택배사 필수' };
    return { error: error.message };
  }
  revalidatePath(`/admin/orders/${orderId}`); revalidatePath('/admin/orders');
  return { ok: true };
}

export async function markDeliveredAction(orderId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('transition_order_status', { order_id: orderId, next_status: 'delivered' });
  if (error) return { error: error.message };
  revalidatePath(`/admin/orders/${orderId}`); revalidatePath('/admin/orders');
  return { ok: true };
}

export async function adminCancelOrderAction(orderId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_order', { order_id: orderId });
  if (error) return { error: error.message };
  revalidatePath(`/admin/orders/${orderId}`); revalidatePath('/admin/orders');
  return { ok: true };
}
```

- [ ] **Step 2: Write /admin/orders list**

`app/(admin)/admin/orders/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { OrdersRealtime } from '@/components/OrdersRealtime';

export const dynamic = 'force-dynamic';

const TABS: (OrderStatus | 'all')[] = ['all', 'placed', 'preparing', 'shipped', 'delivered', 'cancelled'];

export default async function AdminOrdersPage({ searchParams }: { searchParams: { status?: string } }) {
  const supabase = createClient();
  const status = (searchParams.status as OrderStatus) ?? 'all';
  let q = supabase.from('orders').select('id,user_id,total_amount,status,shipping_name,created_at,profiles!orders_user_id_fkey(name)').order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">주문 관리</h1>
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <Link key={t} href={`/admin/orders${t === 'all' ? '' : `?status=${t}`}`}>
            <Badge variant={status === t ? 'default' : 'secondary'}>
              {t === 'all' ? '전체' : ORDER_STATUS_LABEL[t]}
            </Badge>
          </Link>
        ))}
      </div>
      <OrdersRealtime />
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr>
              <th className="text-left p-2">주문번호</th><th className="text-left p-2">사용자</th>
              <th className="text-left p-2">배송지</th>
              <th className="text-right p-2">금액</th><th className="text-left p-2">상태</th><th className="text-left p-2">시간</th>
            </tr></thead>
            <tbody>
              {(data ?? []).map((o: any) => (
                <tr key={o.id} className="border-t">
                  <td className="p-2"><Link href={`/admin/orders/${o.id}`} className="underline">{o.id.slice(0,8)}</Link></td>
                  <td className="p-2">{o.profiles?.name ?? o.user_id.slice(0,8)}</td>
                  <td className="p-2">{o.shipping_name}</td>
                  <td className="p-2 text-right">{formatKRW(Number(o.total_amount))}</td>
                  <td className="p-2"><Badge>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</Badge></td>
                  <td className="p-2">{new Date(o.created_at).toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Write /admin/orders/[id] detail**

`app/(admin)/admin/orders/[id]/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { notFound } from 'next/navigation';
import { formatKRW } from '@/lib/money';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { TransitionButtons } from './TransitionButtons';

export const dynamic = 'force-dynamic';

export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: order } = await supabase.from('orders')
    .select('*,order_items(*),profiles!orders_user_id_fkey(name,email,phone)')
    .eq('id', params.id).single();
  if (!order) notFound();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">주문 상세</h1>
        <Badge>{ORDER_STATUS_LABEL[order.status as OrderStatus]}</Badge>
      </div>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold">주문자</h2>
          <p>{(order as any).profiles.name} ({(order as any).profiles.email})</p>
          <p className="text-sm text-muted-foreground">{(order as any).profiles.phone}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold">배송 정보</h2>
          <p>받는 사람: {order.shipping_name}</p>
          <p>연락처: {order.shipping_phone}</p>
          <p>주소: {order.shipping_address}</p>
          {order.shipping_memo && <p className="text-sm">메모: {order.shipping_memo}</p>}
          {order.tracking_number && <p className="text-sm mt-2">송장: {order.carrier} {order.tracking_number}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-1">
          <h2 className="font-semibold">주문 항목</h2>
          {(order as any).order_items.map((it: any) => (
            <div key={it.id} className="flex justify-between text-sm">
              <span>{it.product_name} × {it.quantity}</span>
              <span>{formatKRW(Number(it.subtotal))}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-bold">
            <span>합계</span><span>{formatKRW(Number(order.total_amount))}</span>
          </div>
        </CardContent>
      </Card>

      <TransitionButtons orderId={order.id} status={order.status as OrderStatus} />

      <Card className="print:shadow-none">
        <CardContent className="p-4">
          <button onClick={(() => window.print()) as any} className="underline text-sm">인쇄</button>
        </CardContent>
      </Card>
    </div>
  );
}
```

`app/(admin)/admin/orders/[id]/TransitionButtons.tsx`:
```tsx
'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { markPreparingAction, markShippedAction, markDeliveredAction, adminCancelOrderAction } from '@/lib/actions/admin-orders';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import type { OrderStatus } from '@/lib/types';

export function TransitionButtons({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState('');

  function run(fn: () => Promise<any>, success: string) {
    start(async () => {
      const r = await fn();
      if (r.error) toast({ title: '실패', description: r.error, variant: 'destructive' });
      else { toast({ title: success }); router.refresh(); }
    });
  }

  function cancel() {
    if (!confirm('주문을 취소하시겠습니까? 잔액이 환불됩니다.')) return;
    run(() => adminCancelOrderAction(orderId), '주문 취소 완료');
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className="font-semibold">상태 전이</h2>
        {status === 'placed' && <Button onClick={() => run(() => markPreparingAction(orderId), '준비중으로 변경')} disabled={pending}>준비중으로</Button>}
        {status === 'preparing' && (
          <div className="space-y-2">
            <div><Label>택배사 *</Label><Input value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="예: CJ대한통운" /></div>
            <div><Label>송장번호 *</Label><Input value={tracking} onChange={e => setTracking(e.target.value)} /></div>
            <Button onClick={() => run(() => markShippedAction(orderId, tracking, carrier), '발송 처리 완료')} disabled={pending || !tracking || !carrier}>발송 처리</Button>
          </div>
        )}
        {status === 'shipped' && <Button onClick={() => run(() => markDeliveredAction(orderId), '배송 완료 처리')} disabled={pending}>배송 완료로</Button>}
        {status !== 'cancelled' && status !== 'delivered' && (
          <Button variant="destructive" onClick={cancel} disabled={pending}>주문 취소 (환불)</Button>
        )}
        {(status === 'delivered' || status === 'cancelled') && <p className="text-sm text-muted-foreground">전이할 상태가 없습니다.</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Manually verify**

Admin sees placed order → [준비중으로] → [발송 처리] with tracking → [배송 완료]. Cancel at any stage refunds balance.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/admin/orders lib/actions/admin-orders.ts
git commit -m "feat(admin): order list, detail, and state transitions"
```

---

## Task 22: Admin /users + Balance Adjust

**Files:**
- Create: `app/(admin)/admin/users/page.tsx`, `app/(admin)/admin/users/[id]/page.tsx`, `app/(admin)/admin/users/[id]/BalanceAdjustForm.tsx`, `lib/actions/admin-users.ts`

- [ ] **Step 1: Write actions**

`lib/actions/admin-users.ts`:
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { adjustBalanceSchema, thresholdSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';

export async function adjustBalanceAction(userId: string, fd: FormData) {
  const parsed = adjustBalanceSchema.safeParse({ delta: Number(fd.get('delta')), memo: fd.get('memo') });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = createClient();
  const { error } = await supabase.rpc('adjust_balance', {
    target_user: userId, delta: parsed.data.delta, memo: parsed.data.memo,
  });
  if (error) {
    if (error.message.includes('NEGATIVE_BALANCE')) return { error: '잔액이 음수가 됩니다' };
    return { error: error.message };
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function updateThresholdAction(userId: string, fd: FormData) {
  const parsed = thresholdSchema.safeParse({ threshold: Number(fd.get('threshold')) });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = createClient();
  const { error } = await supabase.from('profiles').update({ low_balance_threshold: parsed.data.threshold }).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function setUserStatusAction(userId: string, status: 'active'|'suspended') {
  const supabase = createClient();
  const { data: { user: me } } = await supabase.auth.getUser();
  if (me!.id === userId) return { error: '본인 상태는 변경할 수 없습니다' };
  const { error } = await supabase.from('profiles').update({ status }).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Write /admin/users list**

`app/(admin)/admin/users/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatKRW } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({ searchParams }: { searchParams: { filter?: string } }) {
  const supabase = createClient();
  const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  const filter = searchParams.filter;
  const filtered = (users ?? []).filter(u => {
    if (filter === 'low') return Number(u.deposit_balance) <= Number(u.low_balance_threshold);
    if (filter === 'pending') return u.status === 'pending';
    return true;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">사용자 관리</h1>
      <div className="flex gap-2">
        <Link href="/admin/users"><Badge variant={!filter ? 'default' : 'secondary'}>전체</Badge></Link>
        <Link href="/admin/users?filter=low"><Badge variant={filter === 'low' ? 'default' : 'secondary'}>잔액 낮음</Badge></Link>
        <Link href="/admin/users?filter=pending"><Badge variant={filter === 'pending' ? 'default' : 'secondary'}>승인 대기</Badge></Link>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr>
              <th className="p-2 text-left">이름</th><th className="p-2 text-left">이메일</th>
              <th className="p-2 text-right">잔액</th><th className="p-2 text-left">상태</th><th className="p-2 text-left">역할</th>
            </tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-2"><Link href={`/admin/users/${u.id}`} className="underline">{u.name}</Link></td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2 text-right">{formatKRW(Number(u.deposit_balance))}</td>
                  <td className="p-2"><Badge variant={u.status === 'active' ? 'default' : 'secondary'}>{u.status}</Badge></td>
                  <td className="p-2">{u.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Write /admin/users/[id] detail**

`app/(admin)/admin/users/[id]/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notFound } from 'next/navigation';
import { formatKRW } from '@/lib/money';
import { BalanceAdjustForm } from './BalanceAdjustForm';
import { UserStatusButtons } from './UserStatusButtons';
import { ThresholdForm } from './ThresholdForm';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: u }, { data: orders }, { data: deposits }, { data: txs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).single(),
    supabase.from('orders').select('id,total_amount,status,created_at').eq('user_id', params.id).order('created_at', { ascending: false }),
    supabase.from('deposit_requests').select('*').eq('user_id', params.id).order('created_at', { ascending: false }),
    supabase.from('balance_transactions').select('*').eq('user_id', params.id).order('created_at', { ascending: false }),
  ]);
  if (!u) notFound();

  const totalSpent = (orders ?? []).filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total_amount), 0);

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">{u.name}</h1>
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-muted-foreground">이메일</p><p>{u.email}</p></div>
          <div><p className="text-muted-foreground">연락처</p><p>{u.phone}</p></div>
          <div><p className="text-muted-foreground">잔액</p><p className="font-bold">{formatKRW(Number(u.deposit_balance))}</p></div>
          <div><p className="text-muted-foreground">총 사용액</p><p>{formatKRW(totalSpent)}</p></div>
          <div><p className="text-muted-foreground">상태</p><p>{u.status}</p></div>
          <div><p className="text-muted-foreground">역할</p><p>{u.role}</p></div>
          <div><p className="text-muted-foreground">임계치</p><p>{formatKRW(Number(u.low_balance_threshold))}</p></div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <BalanceAdjustForm userId={u.id} />
        <ThresholdForm userId={u.id} defaultValue={Number(u.low_balance_threshold)} />
        <UserStatusButtons userId={u.id} status={u.status as any} />
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">주문 이력</TabsTrigger>
          <TabsTrigger value="deposits">이체 이력</TabsTrigger>
          <TabsTrigger value="ledger">원장</TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          <Card><CardContent className="p-0"><table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">주문번호</th><th className="p-2 text-right">금액</th><th className="p-2 text-left">상태</th><th className="p-2 text-left">시간</th></tr></thead>
            <tbody>{(orders ?? []).map(o => (
              <tr key={o.id} className="border-t"><td className="p-2">{o.id.slice(0,8)}</td><td className="p-2 text-right">{formatKRW(Number(o.total_amount))}</td><td className="p-2">{o.status}</td><td className="p-2">{new Date(o.created_at).toLocaleString('ko-KR')}</td></tr>
            ))}</tbody>
          </table></CardContent></Card>
        </TabsContent>
        <TabsContent value="deposits">
          <Card><CardContent className="p-0"><table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">금액</th><th className="p-2 text-left">입금자명</th><th className="p-2 text-left">상태</th><th className="p-2 text-left">시간</th></tr></thead>
            <tbody>{(deposits ?? []).map(d => (
              <tr key={d.id} className="border-t"><td className="p-2">{formatKRW(Number(d.amount))}</td><td className="p-2">{d.depositor_name}</td><td className="p-2">{d.status}</td><td className="p-2">{new Date(d.created_at).toLocaleString('ko-KR')}</td></tr>
            ))}</tbody>
          </table></CardContent></Card>
        </TabsContent>
        <TabsContent value="ledger">
          <Card><CardContent className="p-0"><table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">종류</th><th className="p-2 text-right">증감</th><th className="p-2 text-right">잔액</th><th className="p-2 text-left">메모</th><th className="p-2 text-left">시간</th></tr></thead>
            <tbody>{(txs ?? []).map(t => (
              <tr key={t.id} className="border-t"><td className="p-2">{t.type}</td><td className="p-2 text-right">{formatKRW(Number(t.amount))}</td><td className="p-2 text-right">{formatKRW(Number(t.balance_after))}</td><td className="p-2">{t.memo ?? '-'}</td><td className="p-2">{new Date(t.created_at).toLocaleString('ko-KR')}</td></tr>
            ))}</tbody>
          </table></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

`app/(admin)/admin/users/[id]/BalanceAdjustForm.tsx`:
```tsx
'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState, useTransition } from 'react';
import { adjustBalanceAction } from '@/lib/actions/admin-users';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

export function BalanceAdjustForm({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function onSubmit(fd: FormData) {
    start(async () => {
      const r = await adjustBalanceAction(userId, fd);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else { toast({ title: '잔액 조정 완료' }); router.refresh(); }
    });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold">잔액 수동 조정</h3>
        <form action={onSubmit} className="space-y-2">
          <div><Label>증감액 (음수=차감)</Label><Input name="delta" type="number" required /></div>
          <div><Label>사유</Label><Textarea name="memo" required /></div>
          <Button type="submit" disabled={pending} className="w-full">{pending ? '처리중...' : '조정'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

`app/(admin)/admin/users/[id]/ThresholdForm.tsx`:
```tsx
'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTransition } from 'react';
import { updateThresholdAction } from '@/lib/actions/admin-users';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

export function ThresholdForm({ userId, defaultValue }: { userId: string; defaultValue: number }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  function onSubmit(fd: FormData) {
    start(async () => {
      const r = await updateThresholdAction(userId, fd);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else { toast({ title: '임계치 변경 완료' }); router.refresh(); }
    });
  }
  return (
    <Card><CardContent className="p-4 space-y-2">
      <h3 className="font-semibold">잔액 부족 임계치</h3>
      <form action={onSubmit} className="space-y-2">
        <div><Label>임계치 (원)</Label><Input name="threshold" type="number" min={0} defaultValue={defaultValue} required /></div>
        <Button type="submit" disabled={pending} className="w-full">저장</Button>
      </form>
    </CardContent></Card>
  );
}
```

`app/(admin)/admin/users/[id]/UserStatusButtons.tsx`:
```tsx
'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTransition } from 'react';
import { setUserStatusAction } from '@/lib/actions/admin-users';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

export function UserStatusButtons({ userId, status }: { userId: string; status: 'pending'|'active'|'suspended' }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  function run(next: 'active'|'suspended') {
    start(async () => {
      const r = await setUserStatusAction(userId, next);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else { toast({ title: '상태 변경 완료' }); router.refresh(); }
    });
  }
  return (
    <Card><CardContent className="p-4 space-y-2">
      <h3 className="font-semibold">계정 상태</h3>
      <p className="text-sm">현재: {status}</p>
      <div className="flex gap-2">
        {status !== 'active' && <Button size="sm" onClick={() => run('active')} disabled={pending}>활성화</Button>}
        {status !== 'suspended' && <Button size="sm" variant="destructive" onClick={() => run('suspended')} disabled={pending}>정지</Button>}
      </div>
    </CardContent></Card>
  );
}
```

- [ ] **Step 4: Manually verify**

/admin/users → filter → click user → adjust balance (±) → ledger tab shows adjust entry. Change threshold. Suspend/activate.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/admin/users lib/actions/admin-users.ts
git commit -m "feat(admin): users list + detail with balance adjust/threshold/status"
```

---

## Task 23: Admin /settings

**Files:**
- Create: `app/(admin)/admin/settings/page.tsx`, `lib/actions/admin-settings.ts`

- [ ] **Step 1: Write action**

`lib/actions/admin-settings.ts`:
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { appSettingsSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';

export async function saveAppSettingsAction(fd: FormData) {
  const parsed = appSettingsSchema.safeParse({
    bankName: fd.get('bankName') ?? '',
    bankAccountNumber: fd.get('bankAccountNumber') ?? '',
    bankAccountHolder: fd.get('bankAccountHolder') ?? '',
    notice: fd.get('notice') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('app_settings').update({
    bank_name: parsed.data.bankName,
    bank_account_number: parsed.data.bankAccountNumber,
    bank_account_holder: parsed.data.bankAccountHolder,
    notice: parsed.data.notice,
    updated_at: new Date().toISOString(),
    updated_by: user!.id,
  }).eq('id', 1);
  if (error) return { error: error.message };
  revalidatePath('/admin/settings'); revalidatePath('/deposit/new');
  return { ok: true };
}
```

- [ ] **Step 2: Write /admin/settings page**

`app/(admin)/admin/settings/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const { data: s } = await supabase.from('app_settings').select('*').eq('id', 1).single();
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-4">앱 설정</h1>
      <SettingsForm defaults={{
        bankName: s?.bank_name ?? '', bankAccountNumber: s?.bank_account_number ?? '',
        bankAccountHolder: s?.bank_account_holder ?? '', notice: s?.notice ?? '',
      }} />
    </div>
  );
}
```

`app/(admin)/admin/settings/SettingsForm.tsx`:
```tsx
'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { saveAppSettingsAction } from '@/lib/actions/admin-settings';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/ui/use-toast';

export function SettingsForm({ defaults }: { defaults: { bankName: string; bankAccountNumber: string; bankAccountHolder: string; notice: string } }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  function onSubmit(fd: FormData) {
    start(async () => {
      const r = await saveAppSettingsAction(fd);
      if ((r as any).error) toast({ title: '실패', description: (r as any).error, variant: 'destructive' });
      else toast({ title: '저장 완료' });
    });
  }
  return (
    <form action={onSubmit} className="space-y-3">
      <div><Label>은행명</Label><Input name="bankName" defaultValue={defaults.bankName} /></div>
      <div><Label>계좌번호</Label><Input name="bankAccountNumber" defaultValue={defaults.bankAccountNumber} /></div>
      <div><Label>예금주</Label><Input name="bankAccountHolder" defaultValue={defaults.bankAccountHolder} /></div>
      <div><Label>안내문</Label><Textarea name="notice" defaultValue={defaults.notice} rows={4} /></div>
      <Button type="submit" disabled={pending}>{pending ? '저장중...' : '저장'}</Button>
    </form>
  );
}
```

- [ ] **Step 3: Manually verify**

Admin enters bank info → `/deposit/new` as user shows the info.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/admin/settings lib/actions/admin-settings.ts
git commit -m "feat(admin): app settings page (bank info)"
```

---

## Task 24: Admin /low-balance

**Files:**
- Create: `app/(admin)/admin/low-balance/page.tsx`

- [ ] **Step 1: Write page**

`app/(admin)/admin/low-balance/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { formatKRW } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function LowBalancePage() {
  const supabase = createClient();
  const { data: users } = await supabase.from('profiles')
    .select('id,name,email,phone,deposit_balance,low_balance_threshold')
    .eq('role', 'user').eq('status', 'active');

  const low = (users ?? []).filter(u => Number(u.deposit_balance) <= Number(u.low_balance_threshold));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">잔액 부족 고객</h1>
      <p className="text-sm text-muted-foreground">{low.length}명 — 전화/카톡/문자로 개별 안내해주세요.</p>
      {low.length === 0 ? <p className="text-muted-foreground">해당 고객이 없습니다.</p> : (
        <div className="grid md:grid-cols-2 gap-3">
          {low.map(u => (
            <Card key={u.id}><CardContent className="p-4">
              <p className="font-semibold">{u.name}</p>
              <p className="text-sm">{u.phone}</p>
              <p className="text-sm text-muted-foreground">{u.email}</p>
              <p className="text-sm mt-2">현재 잔액: <span className="font-semibold">{formatKRW(Number(u.deposit_balance))}</span></p>
              <p className="text-xs text-muted-foreground">임계치: {formatKRW(Number(u.low_balance_threshold))}</p>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/admin/low-balance
git commit -m "feat(admin): low-balance customers listing page"
```

---

## Task 25: Realtime Subscription on Orders

**Files:**
- Create: `components/OrdersRealtime.tsx`

- [ ] **Step 1: Write component**

`components/OrdersRealtime.tsx`:
```tsx
'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';

export function OrdersRealtime() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        toast({ title: '새 주문 접수' });
        router.refresh();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        router.refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router, toast]);

  return null;
}
```

- [ ] **Step 2: Enable Realtime for orders table**

Append to migration `20260422000003_rpc_functions.sql` (or create a new one `20260422000005_realtime.sql`):
```sql
alter publication supabase_realtime add table public.orders;
```
Then `pnpm supabase db reset`.

- [ ] **Step 3: Manually verify**

Admin opens `/admin/orders` in one tab. In another tab as user, place an order. Admin tab shows toast + list updates.

- [ ] **Step 4: Commit**

```bash
git add components/OrdersRealtime.tsx supabase/migrations
git commit -m "feat(realtime): subscribe to orders INSERT for admin dashboard"
```

---

## Task 26: E2E Tests (Playwright)

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/deposit-flow.spec.ts`, `tests/e2e/order-flow.spec.ts`, `tests/e2e/cancel-refund.spec.ts`

- [ ] **Step 1: Configure Playwright**

```bash
pnpm dlx playwright install chromium
```

`playwright.config.ts`:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,  // shared DB state
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 2: Write helpers and deposit flow test**

`tests/e2e/_helpers.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

const URL = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_KEY!;

export const admin = () => createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

export async function resetDb() {
  const a = admin();
  await a.from('balance_transactions').delete().gte('id','00000000-0000-0000-0000-000000000000');
  await a.from('order_items').delete().gte('id','00000000-0000-0000-0000-000000000000');
  await a.from('orders').delete().gte('id','00000000-0000-0000-0000-000000000000');
  await a.from('deposit_requests').delete().gte('id','00000000-0000-0000-0000-000000000000');
  await a.from('products').delete().gte('id','00000000-0000-0000-0000-000000000000');
  const { data: users } = await a.auth.admin.listUsers();
  for (const u of users.users) await a.auth.admin.deleteUser(u.id);
}

export async function createActiveUser(email: string, role: 'user'|'admin' = 'user') {
  const a = admin();
  const { data } = await a.auth.admin.createUser({
    email, password: 'testpass123', email_confirm: true,
    user_metadata: { name: email.split('@')[0], phone: '010-1234-5678' },
  });
  await a.from('profiles').update({ status: 'active', role }).eq('id', data.user!.id);
  return data.user!.id;
}

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('[name=email]', email);
  await page.fill('[name=password]', 'testpass123');
  await page.click('button[type=submit]');
  await page.waitForURL(u => u.pathname !== '/login');
}
```

`tests/e2e/deposit-flow.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';
import { admin, resetDb, createActiveUser, login } from './_helpers';

test('user submits deposit, admin confirms, balance reflects', async ({ page, context }) => {
  await resetDb();
  const userId = await createActiveUser('e2e-user@t.com', 'user');
  await createActiveUser('e2e-admin@t.com', 'admin');

  await login(page, 'e2e-user@t.com');
  await page.goto('/deposit/new');
  await page.fill('[name=amount]', '50000');
  await page.fill('[name=depositorName]', '홍길동');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/deposit/);
  await expect(page.getByText('승인대기')).toBeVisible();

  // Admin confirms via DB
  const a = admin();
  const { data: req } = await a.from('deposit_requests').select('id').eq('user_id', userId).single();
  await a.rpc('confirm_deposit', { request_id: req!.id });

  // User reloads and sees confirmed + balance
  await page.reload();
  await expect(page.getByText('반영완료')).toBeVisible();
  await expect(page.getByText('₩50,000').first()).toBeVisible();
});
```

`tests/e2e/order-flow.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';
import { admin, resetDb, createActiveUser, login } from './_helpers';

test('place order → admin transitions to shipped', async ({ page }) => {
  await resetDb();
  const userId = await createActiveUser('o-user@t.com', 'user');
  await createActiveUser('o-admin@t.com', 'admin');
  const a = admin();
  await a.from('profiles').update({ deposit_balance: 100000 }).eq('id', userId);
  const { data: prod } = await a.from('products').insert({ name: '테스트상품', price: 10000, stock: 5, description: '', is_active: true }).select('id').single();

  await login(page, 'o-user@t.com');
  await page.goto('/shop');
  await page.getByRole('button', { name: '장바구니 담기' }).first().click();
  await page.goto('/checkout');
  await page.fill('input >> nth=0', '홍길동');  // name
  await page.locator('input').nth(1).fill('010-1234-5678');
  await page.locator('input').nth(2).fill('서울시 강남구');
  await page.getByRole('button', { name: /결제/ }).click();
  await page.waitForURL('/orders');
  await expect(page.getByText('접수')).toBeVisible();

  // Admin transitions via DB (easier than second page)
  const { data: order } = await a.from('orders').select('id').eq('user_id', userId).single();
  await a.rpc('transition_order_status', { order_id: order!.id, next_status: 'preparing' });
  await a.rpc('transition_order_status', {
    order_id: order!.id, next_status: 'shipped', tracking: '1234567890', carrier_name: 'CJ',
  });

  await page.reload();
  await expect(page.getByText('배송중')).toBeVisible();
  await expect(page.getByText('CJ 1234567890')).toBeVisible();
});
```

`tests/e2e/cancel-refund.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';
import { admin, resetDb, createActiveUser, login } from './_helpers';

test('user cancels order → balance restored', async ({ page }) => {
  await resetDb();
  const userId = await createActiveUser('c-user@t.com', 'user');
  const a = admin();
  await a.from('profiles').update({ deposit_balance: 50000 }).eq('id', userId);
  const { data: prod } = await a.from('products').insert({ name: 'P', price: 10000, stock: 5, description: '', is_active: true }).select('id').single();

  await login(page, 'c-user@t.com');
  await page.goto('/shop');
  await page.getByRole('button', { name: '장바구니 담기' }).first().click();
  await page.goto('/checkout');
  await page.locator('input').nth(0).fill('A');
  await page.locator('input').nth(1).fill('010-1234-5678');
  await page.locator('input').nth(2).fill('주소');
  await page.getByRole('button', { name: /결제/ }).click();
  await page.waitForURL('/orders');

  // Confirm balance deducted
  await page.goto('/deposit');
  await expect(page.getByText('₩40,000').first()).toBeVisible();

  // Cancel
  await page.goto('/orders');
  page.on('dialog', d => d.accept());
  await page.getByRole('button', { name: '주문 취소' }).click();
  await expect(page.getByText('취소')).toBeVisible();

  // Balance restored
  await page.goto('/deposit');
  await expect(page.getByText('₩50,000').first()).toBeVisible();
});
```

- [ ] **Step 3: Run E2E**

```bash
SUPABASE_TEST_SERVICE_KEY=<service-key> pnpm test:e2e
```
Expected: all 3 scenarios pass.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): deposit, order, and cancel-refund golden-path flows"
```

---

## Task 27: README + Bootstrap Guide + Final Checks

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

`README.md`:
```markdown
# 엑시트몰 (폐쇄몰)

예치금 기반 폐쇄몰. Next.js 14 + Supabase.

## 로컬 개발 환경 셋업

### 필수 도구
- Node.js 20+ / pnpm
- Docker Desktop (Supabase CLI용)

### 1. 설치

```bash
pnpm install
pnpm supabase start  # Docker 필요
```

Supabase 로컬이 시작되면 `anon key`와 `service_role key`가 출력됩니다.

### 2. 환경 변수

`.env.local.example`을 `.env.local`로 복사하고 값 채우기:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<로컬 anon key>
SUPABASE_SERVICE_ROLE_KEY=<로컬 service_role key>
```

### 3. DB 초기화 + 타입 생성

```bash
pnpm supabase db reset
pnpm db:types
```

### 4. 개발 서버

```bash
pnpm dev  # http://localhost:3000
```

## 초기 관리자 부트스트랩

첫 관리자는 앱 UI로 만들 수 없습니다(승인해줄 관리자가 없음). 수동 생성:

1. `/signup`에서 관리자 계정으로 회원가입 (또는 Supabase Studio Auth 대시보드에서 사용자 생성).
2. Supabase Studio(`http://127.0.0.1:54323`) SQL Editor에서:
   ```sql
   update public.profiles
   set role = 'admin', status = 'active', approved_at = now()
   where email = 'admin@example.com';
   ```
3. `/login` → 관리자로 로그인 → `/admin/settings`에서 계좌 정보 입력.

## 테스트

```bash
pnpm test                 # 단위 + 통합
pnpm test:e2e             # Playwright
```

E2E 실행 시 환경 변수 필요:
```bash
SUPABASE_TEST_SERVICE_KEY=<service-key> pnpm test:e2e
```

## 배포 (프로덕션)

1. Supabase 클라우드 프로젝트 생성 → 프로젝트 URL/키 확인.
2. `pnpm supabase link --project-ref <ref>` → `pnpm supabase db push`로 마이그레이션 적용.
3. Vercel에 연결 → 환경 변수 3개 설정 → 배포.
4. Supabase 대시보드에서 Point-in-Time Recovery(PITR) 활성화(유료).
5. 프로덕션 환경에서 관리자 부트스트랩 (위 SQL).

## 주요 경로

### 주문자
- `/shop` 상품 목록 / `/cart` 장바구니 / `/checkout` 주문서
- `/deposit` 예치금 잔액·이체 내역 / `/deposit/new` 이체 요청
- `/orders` 내 주문 내역

### 관리자 (`/admin/*`, role=admin 전용)
- `/admin` 대시보드
- `/admin/approvals` 가입 승인
- `/admin/deposits` 입금 확인
- `/admin/orders` 주문 관리 (실시간)
- `/admin/products` 상품 CRUD
- `/admin/users` 사용자 관리
- `/admin/low-balance` 잔액 부족 고객
- `/admin/settings` 계좌 정보

## 설계 문서

- 설계: `docs/superpowers/specs/2026-04-22-closed-mall-design.md`
- 구현 계획: `docs/superpowers/plans/2026-04-22-closed-mall.md`, `-part2.md`
```

- [ ] **Step 2: Final manual verification checklist**

Run through each manually in order:

1. Admin bootstrap works (SQL update → login → dashboard).
2. `/admin/settings` → 계좌 정보 저장 → 사용자 `/deposit/new`에 표시됨.
3. 새 사용자 signup → pending 화면 → 관리자 /approvals → 승인 → 사용자 로그인 가능.
4. 사용자 이체 요청 → 관리자 confirm → 잔액 증가 → 원장 기록.
5. 관리자 상품 등록 (이미지 포함) → 사용자 /shop에 노출 → 장바구니 → 주문 성공.
6. 관리자 /admin/orders → 실시간 새 주문 토스트 확인 (다른 탭에서 주문).
7. 주문 상세 → 준비중 → 발송 처리(송장번호 필수) → 배송 완료.
8. 사용자 placed 상태 주문 취소 → 잔액·재고 복원.
9. 관리자 수동 잔액 조정 (+/-) → 원장 기록.
10. 잔액 부족 사용자 → 사이트 내 배너 노출 + /admin/low-balance 목록 노출.
11. pending/suspended 사용자 주문/이체 요청 시도 → 차단.
12. 일반 사용자가 `/admin` 접근 시도 → `/shop`으로 리다이렉트.
13. 모든 금액이 원 단위 콤마 표기.
14. 모바일 뷰포트 (375px)에서 각 페이지 정상 렌더.
15. `pnpm typecheck && pnpm build` 성공.
16. `pnpm test && pnpm test:e2e` 모두 통과.

- [ ] **Step 3: Commit and tag**

```bash
git add README.md
git commit -m "docs: README with setup, bootstrap, and route guide"
git tag -a v0.1.0 -m "Initial closed-mall MVP"
```

---

## Self-Review (skill's own check)

**Spec coverage verification:**

| Spec section | Covered by task |
|---|---|
| §2.1 Route groups | Tasks 1, 10 |
| §2.2 RLS + middleware | Tasks 3, 8 |
| §2.3 Realtime | Task 25 |
| §3.1–3.7 Tables | Task 2 |
| §3.8 RLS policies | Task 3 |
| §3.9 RPC functions | Task 4 |
| §4.1 Signup/pending | Task 9 |
| §4.2 Deposit request | Task 14 |
| §4.3 Order flow | Tasks 11–13 |
| §4.4 Order cancel | Task 15 |
| §5.1 Dashboard | Task 17 |
| §5.2 Approvals | Task 18 |
| §5.3 Deposits | Task 19 |
| §5.4 Orders mgmt | Task 21 |
| §5.5 Products CRUD | Task 20 |
| §5.6 Users/balance | Task 22 |
| §5.7 Settings | Task 23 |
| §5.8 Low-balance | Task 24 |
| §6 Error handling + edge cases | Integrated into each task (RPC errors → user-friendly messages; test cases cover edges) |
| §7.1 Unit tests | Task 6 |
| §7.2 Integration | Task 16 |
| §7.3 E2E | Task 26 |
| §8 Deployment + bootstrap | Task 27 |
| §9 Indexes | Task 2 (inline in schema) |

No gaps.

**Placeholder scan:** None. Every step has full code or exact commands.

**Type consistency:** RPC names and signatures consistent across tasks 4, 13, 16, 21, 22. Table/column names match between migrations, types, and UI. Cart item structure consistent across CartProvider, ProductCard, CartPage, CheckoutPage.

---

## Execution Handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-04-22-closed-mall.md` (Tasks 1–10) **and** `docs/superpowers/plans/2026-04-22-closed-mall-part2.md` (Tasks 11–27).

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
