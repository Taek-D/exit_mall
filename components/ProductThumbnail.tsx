import type { ReactNode } from 'react';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProductThumbnailProps = {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
  iconClassName?: string;
  children?: ReactNode;
};

export function ProductThumbnail({
  src,
  alt,
  sizes,
  className,
  iconClassName,
  children,
}: ProductThumbnailProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-surface-muted', className)}>
      {src ? (
        <Image src={src} alt={alt} fill className="object-cover" sizes={sizes} />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
          <ImageOff className={cn('h-4 w-4', iconClassName)} aria-hidden />
        </div>
      )}
      {children}
    </div>
  );
}
