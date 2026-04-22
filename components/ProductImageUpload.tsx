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
