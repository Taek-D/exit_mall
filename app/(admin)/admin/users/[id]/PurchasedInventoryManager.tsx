'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  addPurchasedInventoryLotAction,
  updatePurchasedInventoryLotAction,
} from '@/lib/actions/admin-purchased-inventory';
import type {
  AdminPurchasedInventoryRow,
  PurchasedInventorySummaryRow,
} from '@/lib/admin/user-detail';

type EditState = {
  productName: string;
  optionName: string;
  remainingQuantity: number;
  memo: string;
};

function toEditState(row: AdminPurchasedInventoryRow): EditState {
  return {
    productName: row.product_name,
    optionName: row.option_name,
    remainingQuantity: row.remaining_quantity,
    memo: row.admin_memo ?? '',
  };
}

function sourceTypeLabel(sourceType: AdminPurchasedInventoryRow['source_type']) {
  return sourceType === 'admin_manual' ? '관리자 수기' : '입고리스트';
}

export function PurchasedInventoryManager({
  userId,
  rows,
  summary,
}: {
  userId: string;
  rows: AdminPurchasedInventoryRow[];
  summary: PurchasedInventorySummaryRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [productName, setProductName] = useState('');
  const [optionName, setOptionName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [memo, setMemo] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();

  const [hideEmpty, setHideEmpty] = useState(true);
  const visibleRows = useMemo(
    () => (hideEmpty ? rows.filter((row) => row.remaining_quantity > 0) : rows),
    [rows, hideEmpty],
  );

  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [rowError, setRowError] = useState<Record<string, string | null>>({});
  const [updating, startUpdate] = useTransition();

  const onAdd = () =>
    startAdd(async () => {
      setAddError(null);
      const result = await addPurchasedInventoryLotAction({
        userId,
        productName: productName.trim(),
        optionName: optionName.trim(),
        quantity: Number.isFinite(quantity) ? quantity : 0,
        memo: memo.trim(),
      });
      if (!result.ok) {
        setAddError(result.error ?? '처리 중 오류가 발생했습니다.');
        return;
      }

      toast({ title: '사입재고 추가 완료' });
      setProductName('');
      setOptionName('');
      setQuantity(1);
      setMemo('');
      router.refresh();
    });

  const onSave = (row: AdminPurchasedInventoryRow, state: EditState) =>
    startUpdate(async () => {
      setRowError((prev) => ({ ...prev, [row.id]: null }));
      if (state.remainingQuantity < row.reserved_quantity) {
        setRowError((prev) => ({
          ...prev,
          [row.id]: '잔여 수량은 예약 수량보다 작을 수 없습니다.',
        }));
        return;
      }

      const result = await updatePurchasedInventoryLotAction({
        userId,
        lotId: row.id,
        productName: state.productName.trim(),
        optionName: state.optionName.trim(),
        remainingQuantity: Number.isFinite(state.remainingQuantity) ? state.remainingQuantity : 0,
        memo: state.memo.trim(),
      });
      if (!result.ok) {
        setRowError((prev) => ({
          ...prev,
          [row.id]: result.error ?? '처리 중 오류가 발생했습니다.',
        }));
        return;
      }

      toast({ title: '사입재고 수정 완료' });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      router.refresh();
    });

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <h3 className="font-medium">사입재고 관리</h3>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">관리자 수기 사입재고 추가</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_120px_1fr_auto]">
          <Input
            placeholder="상품명"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
          <Input
            placeholder="옵션명"
            value={optionName}
            onChange={(e) => setOptionName(e.target.value)}
          />
          <Input
            type="number"
            min={1}
            placeholder="수량"
            value={Number.isFinite(quantity) ? quantity : 1}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
          />
          <Input
            placeholder="메모 (선택)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <Button disabled={adding || productName.trim().length === 0 || quantity < 1} onClick={onAdd}>
            {adding ? '추가 중...' : '추가'}
          </Button>
        </div>
        {addError && <p className="text-sm text-destructive">{addError}</p>}
      </div>

      {summary.length > 0 && (
        <div className="rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">상품별 잔여 수량</p>
          <ul className="mt-2 divide-y text-sm">
            {summary.map((row) => (
              <li key={row.key} className="flex items-baseline justify-between gap-3 py-1.5">
                <span>{row.label}</span>
                <span className="whitespace-nowrap font-mono tabular text-lg font-medium">
                  {row.remaining}
                  {row.reserved > 0 && (
                    <span className="ml-1 font-sans text-xs font-normal text-muted-foreground">
                      (예약 {row.reserved})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            현재 사입재고 {visibleRows.length}건
          </p>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
            />
            잔여 0 숨기기
          </label>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 사입재고가 없습니다.</p>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">잔여 수량이 있는 사입재고가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[980px] table-fixed text-sm">
              {/* 초기·잔여·예약은 5~6%면 좌우 여백을 빼고 25~35px만 남아
                  한글 두 글자와 폭이 거의 같다. 7%로 올리고 nowrap을 걸어
                  "초/기"처럼 접히지 않게 한다(docs/standards.md). */}
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[19%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
                <col className="w-[15%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium">상품명</th>
                  <th className="px-3 py-2 text-left font-medium">옵션명</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">초기</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">잔여</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">예약</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">출처</th>
                  <th className="px-3 py-2 text-left font-medium">메모</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">저장</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRows.map((row) => {
                  const state = editing[row.id] ?? toEditState(row);
                  const hasReservations = row.reserved_quantity > 0;
                  const invalidQuantity = state.remainingQuantity < row.reserved_quantity;

                  return (
                    <tr key={row.id} className={row.remaining_quantity === 0 ? 'opacity-70' : ''}>
                      <td className="px-3 py-2">
                        <Input
                          value={state.productName}
                          disabled={hasReservations}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [row.id]: { ...state, productName: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={state.optionName}
                          disabled={hasReservations}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [row.id]: { ...state, optionName: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular">
                        {row.initial_quantity}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="px-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          min={row.reserved_quantity}
                          value={Number.isFinite(state.remainingQuantity) ? state.remainingQuantity : 0}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [row.id]: {
                                ...state,
                                remainingQuantity: parseInt(e.target.value, 10) || 0,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular">
                        {row.reserved_quantity}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {sourceTypeLabel(row.source_type)}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={state.memo}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [row.id]: { ...state, memo: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="secondary"
                          disabled={updating || invalidQuantity}
                          onClick={() => onSave(row, state)}
                        >
                          저장
                        </Button>
                        {invalidQuantity && (
                          <p className="mt-1 text-left text-xs text-destructive">
                            예약 수량 이상이어야 합니다.
                          </p>
                        )}
                        {rowError[row.id] && (
                          <p className="mt-1 text-left text-xs text-destructive">
                            {rowError[row.id]}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
