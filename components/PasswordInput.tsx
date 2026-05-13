'use client';

import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PasswordInput({
  name,
  label,
  visible,
  disabled,
  onToggle,
  autoComplete = 'new-password',
  minLength = 8,
  maxLength = 72,
}: {
  name: string;
  label: string;
  visible: boolean;
  disabled?: boolean;
  onToggle: () => void;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={name}
          name={name}
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
          disabled={disabled}
          className="h-10 pl-9 pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          aria-label={visible ? `${label} 숨기기` : `${label} 보기`}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
