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
    <form action={onSubmit as unknown as (fd: FormData) => void} className="space-y-3">
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
