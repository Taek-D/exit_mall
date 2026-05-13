'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  addCustomInventoryAction,
  adjustCustomInventoryAction,
  deleteCustomInventoryAction,
} from '@/lib/actions/admin-custom-inventory';

export type CustomInventoryRow = {
  id: string;
  name: string;
  quantity: number;
  updated_at: string;
};

export function CustomInventoryManager({
  userId,
  rows,
}: {
  userId: string;
  rows: CustomInventoryRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [initQty, setInitQty] = useState<number>(0);
  const [memo, setMemo] = useState('');
  const [addErr, setAddErr] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();

  const [editing, setEditing] = useState<Record<string, { delta: number; memo: string }>>({});
  const [rowErr, setRowErr] = useState<Record<string, string | null>>({});
  const [adjusting, startAdjust] = useTransition();
  const [deleting, startDelete] = useTransition();

  const onAdd = () =>
    startAdd(async () => {
      setAddErr(null);
      const r = await addCustomInventoryAction({
        userId,
        name: name.trim(),
        quantity: Number.isFinite(initQty) ? initQty : 0,
        memo,
      });
      if (!r.ok) {
        setAddErr(r.error ?? '실패');
        return;
      }
      toast({ title: '수기 항목 추가됨' });
      setName('');
      setInitQty(0);
      setMemo('');
      router.refresh();
    });

  const onAdjust = (id: string) =>
    startAdjust(async () => {
      setRowErr((m) => ({ ...m, [id]: null }));
      const state = editing[id] ?? { delta: 0, memo: '' };
      if (state.delta === 0) {
        setRowErr((m) => ({ ...m, [id]: '0이 아닌 값을 입력해주세요.' }));
        return;
      }
      const r = await adjustCustomInventoryAction({
        userId,
        customInventoryId: id,
        delta: state.delta,
        memo: state.memo,
      });
      if (!r.ok) {
        setRowErr((m) => ({ ...m, [id]: r.error ?? '실패' }));
        return;
      }
      toast({ title: '조정 완료' });
      setEditing((m) => ({ ...m, [id]: { delta: 0, memo: '' } }));
      router.refresh();
    });

  const onDelete = (id: string, currentQty: number, nm: string) =>
    startDelete(async () => {
      const msg =
        currentQty > 0
          ? `"${nm}" 항목을 삭제할까요? 현재 ${currentQty}개가 손실 처리됩니다.`
          : `"${nm}" 항목을 삭제할까요?`;
      if (!window.confirm(msg)) return;
      const r = await deleteCustomInventoryAction({ userId, customInventoryId: id });
      if (!r.ok) {
        setRowErr((m) => ({ ...m, [id]: r.error ?? '실패' }));
        return;
      }
      toast({ title: '삭제 완료' });
      router.refresh();
    });

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <h3 className="font-medium">수기 보유 재고</h3>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">새 수기 항목 추가</p>
        <div className="grid grid-cols-[1fr_120px_1fr_auto] gap-2">
          <Input placeholder="상품명" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            type="number"
            placeholder="초기 수량"
            value={Number.isFinite(initQty) ? initQty : 0}
            onChange={(e) => setInitQty(parseInt(e.target.value, 10) || 0)}
          />
          <Input placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
          <Button disabled={adding || name.trim().length === 0} onClick={onAdd}>
            {adding ? '추가 중…' : '추가'}
          </Button>
        </div>
        {addErr && <p className="text-sm text-destructive">{addErr}</p>}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">현재 수기 항목</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 수기 항목이 없습니다.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((row) => {
              const e = editing[row.id] ?? { delta: 0, memo: '' };
              const err = rowErr[row.id];
              return (
                <li
                  key={row.id}
                  className={`p-3 grid grid-cols-[1fr_80px_120px_1fr_auto_auto] gap-2 items-center ${
                    row.quantity === 0 ? 'opacity-60' : ''
                  }`}
                >
                  <span className="text-sm truncate">{row.name}</span>
                  <span className="font-mono tabular text-right">보유 {row.quantity}</span>
                  <Input
                    type="number"
                    placeholder="±"
                    value={Number.isFinite(e.delta) ? e.delta : 0}
                    onChange={(ev) =>
                      setEditing((m) => ({
                        ...m,
                        [row.id]: { ...e, delta: parseInt(ev.target.value, 10) || 0 },
                      }))
                    }
                  />
                  <Input
                    placeholder="메모"
                    value={e.memo}
                    onChange={(ev) =>
                      setEditing((m) => ({ ...m, [row.id]: { ...e, memo: ev.target.value } }))
                    }
                  />
                  <Button
                    variant="secondary"
                    disabled={adjusting || e.delta === 0}
                    onClick={() => onAdjust(row.id)}
                  >
                    조정
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={deleting}
                    onClick={() => onDelete(row.id, row.quantity, row.name)}
                  >
                    삭제
                  </Button>
                  {err && (
                    <p className="col-span-6 text-xs text-destructive">{err}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
