'use client';
import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { UploadCloud, X, AlertCircle, Loader2 } from 'lucide-react';

export function ProductImageUpload({ defaultUrl }: { defaultUrl?: string | null }) {
  const [url, setUrl] = useState<string | null>(defaultUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const supabase = createClient();
    const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error: upErr } = await supabase.storage
      .from('product-images')
      .upload(path, file, { upsert: false });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path);
    setUrl(pub.publicUrl);
    setUploading(false);
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        disabled={uploading}
        className="sr-only"
        id="product-image-upload"
      />
      <input type="hidden" name="imageUrl" value={url ?? ''} />

      {url ? (
        <div className="flex items-start gap-4">
          <div className="relative h-32 w-32 rounded-md border bg-surface-muted overflow-hidden shrink-0">
            <Image src={url} alt="상품 이미지" fill className="object-cover" sizes="128px" />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <UploadCloud className="h-3.5 w-3.5" aria-hidden />
              이미지 변경
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setUrl(null)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              제거
            </Button>
          </div>
        </div>
      ) : (
        <label
          htmlFor="product-image-upload"
          className="flex flex-col items-center justify-center gap-2 h-36 rounded-md border-2 border-dashed border-input bg-background hover:bg-surface transition-colors cursor-pointer"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" aria-hidden />
          ) : (
            <UploadCloud className="h-6 w-6 text-muted-foreground" aria-hidden />
          )}
          <div className="text-center">
            <p className="text-sm">
              {uploading ? '업로드 중…' : '클릭하여 이미지 선택'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">JPG · PNG · WebP · 10MB 이하</p>
          </div>
        </label>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <p>
            업로드 실패: {error}
            <span className="text-xs block mt-0.5 text-muted-foreground">이미지 없이 저장 가능</span>
          </p>
        </div>
      )}
    </div>
  );
}
