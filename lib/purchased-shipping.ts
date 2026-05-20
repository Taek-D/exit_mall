import ExcelJS from 'exceljs';
import { normalizeProductMatchKey } from '@/lib/shipping-match';

export type ParsedInboundInventoryItem = {
  row_number: number;
  product_name: string;
  option_name: string;
  quantity: number;
  gift: string | null;
  carrier: string | null;
  tracking_number: string | null;
  memo: string | null;
};

export type PurchasedInventoryLot = {
  id: string;
  product_name: string;
  option_name: string;
  available_quantity: number;
  created_at: string;
};

export type PurchasedShippingDemand = {
  item_no: number;
  product_name: string;
  option_name: string;
  quantity: number;
};

export type PurchasedShippingAllocation = {
  item_no: number;
  lot_id: string;
  quantity: number;
};

export type PurchasedInventoryShortage = {
  product_name: string;
  option_name: string;
  requested: number;
  available: number;
};

export type PurchasedInventorySummaryLot = {
  id: string;
  product_name: string;
  option_name: string;
  initial_quantity: number;
  remaining_quantity: number;
  created_at: string;
};

export type PurchasedInventoryReservation = {
  lot_id: string;
  quantity: number;
};

export type PurchasedInventorySummaryRow = {
  product_name: string;
  option_name: string;
  total_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
};

export type PurchasedInventoryAmbiguity = {
  key: string;
  labels: string[];
};

const INBOUND_HEADERS = [
  '발송일',
  '상품명',
  '옵션',
  '재고수량',
  '사은품',
  '택배사',
  '송장번호',
  '비고',
] as const;

function toNodeBuffer(buffer: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof ArrayBuffer) return Buffer.from(new Uint8Array(buffer));
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function rawCellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object') {
    if ('text' in value) return value.text;
    if ('result' in value) return value.result;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
  }
  return value;
}

function cellString(value: unknown): string | null {
  const raw = rawCellValue(value as ExcelJS.CellValue);
  if (raw === null || raw === undefined) return null;
  const s = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).trim();
  return s.length === 0 ? null : s;
}

function cellInt(value: unknown): number | null {
  const raw = rawCellValue(value as ExcelJS.CellValue);
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function keyOf(productName: string, optionName: string): string {
  return `${normalizeProductMatchKey(productName)}\u0000${normalizeProductMatchKey(optionName)}`;
}

function labelOf(productName: string, optionName: string): string {
  return optionName ? `${productName} / ${optionName}` : productName;
}

export async function parseInboundInventoryExcel(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): Promise<ParsedInboundInventoryItem[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(toNodeBuffer(buffer) as any);
  } catch {
    throw new Error('입고 엑셀 파일을 읽을 수 없습니다.');
  }

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('시트가 없습니다.');

  const headerRow = ws.getRow(1);
  for (let i = 0; i < INBOUND_HEADERS.length; i += 1) {
    const actual = normalizeHeader(cellString(headerRow.getCell(i + 1).value) ?? '');
    const expected = normalizeHeader(INBOUND_HEADERS[i]);
    if (actual !== expected) {
      throw new Error(`입고리스트 양식 헤더가 올바르지 않습니다 (${i + 1}열).`);
    }
  }

  const items: ParsedInboundInventoryItem[] = [];
  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    const productName = cellString(row.getCell(2).value);
    const optionName = cellString(row.getCell(3).value) ?? '';
    const quantity = cellInt(row.getCell(4).value);
    const gift = cellString(row.getCell(5).value);
    const carrier = cellString(row.getCell(6).value);
    const tracking = cellString(row.getCell(7).value);
    const memo = cellString(row.getCell(8).value);

    if (!productName && !optionName && quantity === null && !gift && !carrier && !tracking && !memo) {
      continue;
    }

    if (!productName) throw new Error(`${rowNumber}행 상품명이 비어 있습니다.`);
    // Mirror purchased_inventory_lots.product_name's 1..100 check so the
    // user sees a row-specific error before the RPC fires set_inbound_status
    // can't complete.
    if (productName.length > 100) {
      throw new Error(`${rowNumber}행 상품명은 100자 이하여야 합니다.`);
    }
    if (quantity === null || quantity < 1) {
      throw new Error(`${rowNumber}행 재고수량은 1 이상이어야 합니다.`);
    }

    items.push({
      row_number: rowNumber,
      product_name: productName,
      option_name: optionName,
      quantity,
      gift,
      carrier,
      tracking_number: tracking,
      memo,
    });
  }

  if (items.length === 0) throw new Error('입고 품목을 한 줄 이상 입력해주세요.');
  return items;
}

export function detectPurchasedInventoryAmbiguities(
  lots: PurchasedInventoryLot[],
): PurchasedInventoryAmbiguity[] {
  const labelsByKey = new Map<string, Set<string>>();
  for (const lot of lots) {
    const key = keyOf(lot.product_name, lot.option_name);
    const labels = labelsByKey.get(key) ?? new Set<string>();
    labels.add(labelOf(lot.product_name, lot.option_name));
    labelsByKey.set(key, labels);
  }

  return Array.from(labelsByKey.entries())
    .filter(([, labels]) => labels.size > 1)
    .map(([key, labels]) => ({
      key,
      labels: Array.from(labels).sort((a, b) => a.localeCompare(b, 'ko')),
    }));
}

export function allocatePurchasedInventoryFifo(
  lots: PurchasedInventoryLot[],
  demands: PurchasedShippingDemand[],
):
  | { ok: true; allocations: PurchasedShippingAllocation[] }
  | { ok: false; shortages: PurchasedInventoryShortage[] } {
  const remaining = new Map<string, number>();
  const orderedLots = [...lots].sort((a, b) => {
    const byDate = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });
  for (const lot of orderedLots) remaining.set(lot.id, Math.max(0, lot.available_quantity));

  const allocations: PurchasedShippingAllocation[] = [];
  const shortages: PurchasedInventoryShortage[] = [];

  for (const demand of demands) {
    let need = demand.quantity;
    let availableForDemand = 0;
    const demandKey = keyOf(demand.product_name, demand.option_name);
    const matchingLots = orderedLots.filter(
      (lot) => keyOf(lot.product_name, lot.option_name) === demandKey,
    );
    for (const lot of matchingLots) availableForDemand += remaining.get(lot.id) ?? 0;

    if (availableForDemand < need) {
      shortages.push({
        product_name: demand.product_name,
        option_name: demand.option_name,
        requested: need,
        available: availableForDemand,
      });
      continue;
    }

    for (const lot of matchingLots) {
      if (need <= 0) break;
      const lotRemaining = remaining.get(lot.id) ?? 0;
      if (lotRemaining <= 0) continue;
      const used = Math.min(lotRemaining, need);
      allocations.push({ item_no: demand.item_no, lot_id: lot.id, quantity: used });
      remaining.set(lot.id, lotRemaining - used);
      need -= used;
    }
  }

  if (shortages.length > 0) return { ok: false, shortages };
  return { ok: true, allocations };
}

export function summarizePurchasedInventory(
  lots: PurchasedInventorySummaryLot[],
  reservations: PurchasedInventoryReservation[],
): PurchasedInventorySummaryRow[] {
  const reservedByLot = new Map<string, number>();
  for (const reservation of reservations) {
    reservedByLot.set(
      reservation.lot_id,
      (reservedByLot.get(reservation.lot_id) ?? 0) + reservation.quantity,
    );
  }

  const byItem = new Map<string, PurchasedInventorySummaryRow>();
  for (const lot of lots) {
    const reserved = reservedByLot.get(lot.id) ?? 0;
    const key = keyOf(lot.product_name, lot.option_name);
    const current =
      byItem.get(key) ??
      ({
        product_name: lot.product_name,
        option_name: lot.option_name,
        total_quantity: 0,
        reserved_quantity: 0,
        available_quantity: 0,
      } satisfies PurchasedInventorySummaryRow);

    current.total_quantity += lot.initial_quantity;
    current.reserved_quantity += reserved;
    current.available_quantity += Math.max(0, lot.remaining_quantity - reserved);
    byItem.set(key, current);
  }

  return Array.from(byItem.values()).sort((a, b) => {
    const byProduct = a.product_name.localeCompare(b.product_name, 'ko');
    return byProduct !== 0 ? byProduct : a.option_name.localeCompare(b.option_name, 'ko');
  });
}
