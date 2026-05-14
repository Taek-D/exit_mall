'use client';
import type { ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProductImageUpload } from '@/components/ProductImageUpload';
import { Save } from 'lucide-react';

type Props = {
  action: (fd: FormData) => Promise<{ error?: string } | void>;
  defaults?: {
    name: string;
    description: string;
    price: number;
    stock: number;
    is_active: boolean;
    image_url: string | null;
    per_user_limit: number | null;
    brand?: string | null;
    option_name?: string | null;
    management_code?: string | null;
    category?: string | null;
    barcode?: string | null;
  };
};

type MetadataField = {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  className?: string;
};

export function ProductForm({ action, defaults }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const metadataFields: MetadataField[] = [
    { id: 'brand', name: 'brand', label: '브랜드', defaultValue: defaults?.brand ?? '' },
    { id: 'optionName', name: 'optionName', label: '옵션', defaultValue: defaults?.option_name ?? '' },
    {
      id: 'managementCode',
      name: 'managementCode',
      label: '관리코드',
      defaultValue: defaults?.management_code ?? '',
    },
    { id: 'category', name: 'category', label: '카테고리', defaultValue: defaults?.category ?? '' },
    {
      id: 'barcode',
      name: 'barcode',
      label: '바코드',
      defaultValue: defaults?.barcode ?? '',
      className: 'sm:col-span-2',
    },
  ];

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
      <ProductFormSection title="기본 정보">
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
      </ProductFormSection>

      <ProductFormSection title="가격 · 재고">
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

        <div className="space-y-1.5">
          <Label htmlFor="perUserLimit">1인 구매 한도</Label>
          <Input
            id="perUserLimit"
            name="perUserLimit"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="비워두면 무제한"
            defaultValue={defaults?.per_user_limit ?? ''}
            className="font-mono tabular"
          />
          <p className="text-[11px] text-muted-foreground">
            한 명의 고객이 이 상품을 누적 구매할 수 있는 최대 수량 (취소된 주문은 제외).
            비워두면 제한 없음.
          </p>
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
      </ProductFormSection>

      <ProductFormSection title="엑셀 메타 정보">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {metadataFields.map((field) => (
            <div
              key={field.id}
              className={field.className ? `space-y-1.5 ${field.className}` : 'space-y-1.5'}
            >
              <Label htmlFor={field.id}>{field.label}</Label>
              <Input id={field.id} name={field.name} defaultValue={field.defaultValue} />
            </div>
          ))}
        </div>
      </ProductFormSection>

      <ProductFormSection title="이미지">
        <ProductImageUpload defaultUrl={defaults?.image_url ?? null} />
      </ProductFormSection>

      <FormError message={error} className="mx-5 mb-0 mt-5" />

      <div className="p-5 flex items-center justify-end gap-3">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" aria-hidden />
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  );
}

function ProductFormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="p-5 space-y-4">
      <h2 className="font-heading font-semibold">{title}</h2>
      {children}
    </section>
  );
}
