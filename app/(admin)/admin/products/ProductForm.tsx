'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProductImageUpload } from '@/components/ProductImageUpload';
import { useState, useTransition } from 'react';
import { AlertCircle, Save } from 'lucide-react';

type Props = {
  action: (fd: FormData) => Promise<{ error?: string } | void>;
  defaults?: {
    name: string;
    description: string;
    price: number;
    stock: number;
    is_active: boolean;
    image_url: string | null;
  };
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
    <form
      action={onSubmit as unknown as (fd: FormData) => void}
      className="rounded-lg border bg-card divide-y"
    >
      <section className="p-5 space-y-4">
        <h2 className="font-heading font-semibold">기본 정보</h2>
        <div className="space-y-1.5">
          <Label htmlFor="name">상품명 *</Label>
          <Input id="name" name="name" required defaultValue={defaults?.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">설명</Label>
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={defaults?.description}
          />
        </div>
      </section>

      <section className="p-5 space-y-4">
        <h2 className="font-heading font-semibold">가격 · 재고</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="price">가격</Label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono"
                aria-hidden
              >
                ₩
              </span>
              <Input
                id="price"
                name="price"
                type="number"
                min={0}
                required
                defaultValue={defaults?.price}
                className="pl-7 font-mono tabular"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stock">재고</Label>
            <Input
              id="stock"
              name="stock"
              type="number"
              min={-1}
              required
              defaultValue={defaults?.stock ?? 0}
              className="font-mono tabular"
            />
            <p className="text-[11px] text-muted-foreground">−1 입력 시 무제한</p>
          </div>
        </div>

        <label
          htmlFor="isActive"
          className="flex items-start gap-3 p-3 rounded-md border bg-background cursor-pointer"
        >
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            defaultChecked={defaults?.is_active ?? true}
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <span className="flex-1 text-sm">
            <span className="font-medium block">판매중</span>
            <span className="text-muted-foreground text-xs">
              체크 해제 시 상점 목록에서 숨겨집니다.
            </span>
          </span>
        </label>
      </section>

      <section className="p-5 space-y-4">
        <h2 className="font-heading font-semibold">이미지</h2>
        <ProductImageUpload defaultUrl={defaults?.image_url ?? null} />
      </section>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mx-5 mb-0 mt-5 flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <div className="p-5 flex items-center justify-end gap-3">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" aria-hidden />
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  );
}
