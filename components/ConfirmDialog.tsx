'use client';
import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, AlertCircle } from 'lucide-react';

type Tone = 'default' | 'destructive';

type Options = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
};

type State = Options & {
  open: boolean;
  resolve?: (v: { ok: true; reason: string } | { ok: false }) => void;
};

const DEFAULT: State = { open: false, title: '' };

export function useConfirm() {
  const [state, setState] = useState<State>(DEFAULT);
  const [reason, setReason] = useState('');

  const confirm = useCallback((opts: Options) => {
    setReason('');
    return new Promise<{ ok: true; reason: string } | { ok: false }>((resolve) => {
      setState({ ...opts, open: true, resolve });
    });
  }, []);

  const close = useCallback((result: { ok: true; reason: string } | { ok: false }) => {
    state.resolve?.(result);
    setState((s) => ({ ...s, open: false }));
  }, [state]);

  const element = (
    <Dialog open={state.open} onOpenChange={(o) => !o && close({ ok: false })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={
                state.tone === 'destructive'
                  ? 'h-9 w-9 shrink-0 rounded-full bg-destructive/10 text-destructive grid place-items-center'
                  : 'h-9 w-9 shrink-0 rounded-full bg-accent/10 text-accent grid place-items-center'
              }
            >
              {state.tone === 'destructive' ? (
                <AlertTriangle className="h-4 w-4" aria-hidden />
              ) : (
                <AlertCircle className="h-4 w-4" aria-hidden />
              )}
            </div>
            <div className="flex-1 space-y-1.5 text-left">
              <DialogTitle className="font-heading font-semibold">{state.title}</DialogTitle>
              {state.description && (
                <DialogDescription className="text-sm text-muted-foreground">
                  {state.description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        {state.requireReason && (
          <div className="space-y-1.5 mt-2">
            <Label htmlFor="confirm-reason">
              {state.reasonLabel ?? '사유'}
            </Label>
            <Textarea
              id="confirm-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={state.reasonPlaceholder ?? '사유를 입력해주세요'}
              autoFocus
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => close({ ok: false })}>
            {state.cancelLabel ?? '취소'}
          </Button>
          <Button
            variant={state.tone === 'destructive' ? 'destructive' : 'default'}
            disabled={state.requireReason && reason.trim().length === 0}
            onClick={() => close({ ok: true, reason: reason.trim() })}
          >
            {state.confirmLabel ?? '확인'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, element };
}
