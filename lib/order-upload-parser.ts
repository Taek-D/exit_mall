/**
 * @deprecated 2026-05-08 이후 사용하지 않음.
 * 새 흐름은 lib/shipping-upload-parser.ts 와 lib/actions/shipping-upload.ts 를 사용한다.
 * 이 파일은 legacy 데이터 호환성 검증을 위해 보존한다.
 */
import ExcelJS from 'exceljs';

export type ParsedOrderItem = {
  no: number;
  brand: string | null;
  code: string | null;
  name: string;
  option: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  memo: string | null;
  shipping_request: string | null;
};

export type ParsedOrderUpload = {
  order_date: string | null;
  buyer_order_number: string | null;
  company_name: string | null;
  contact_person: string | null;
  buyer_phone: string | null;
  buyer_email: string | null;
  shipping_address: string | null;
  request_memo: string | null;
  items: ParsedOrderItem[];
  total_quantity: number;
  total_amount: number;
};

const ITEMS_START_ROW = 12;
const ITEMS_END_ROW = 41;

function toNodeBuffer(buffer: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof ArrayBuffer) return Buffer.from(new Uint8Array(buffer));
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === 'object') {
    if ('text' in value) return value.text;
    if ('result' in value) return value.result;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
  }
  return value;
}

function readCellString(ws: ExcelJS.Worksheet, addr: string): string | null {
  const value = cellValue(ws.getCell(addr));
  if (value === null || value === undefined) return null;
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim();
  return s.length === 0 ? null : s;
}

function readCellNumber(ws: ExcelJS.Worksheet, addr: string): number | null {
  const value = cellValue(ws.getCell(addr));
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s원]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function parseOrderExcel(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): Promise<ParsedOrderUpload> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(toNodeBuffer(buffer) as any);
  } catch {
    throw new Error('엑셀 파일을 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식입니다.');
  }

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('엑셀 시트가 없습니다.');

  const order_date = readCellString(ws, 'B5');
  let buyer_order_number = readCellString(ws, 'F5');
  if (buyer_order_number === '엑셀 매세지') buyer_order_number = null;
  const company_name = readCellString(ws, 'B6');
  const contact_person = readCellString(ws, 'F6');
  const buyer_phone = readCellString(ws, 'B7');
  const buyer_email = readCellString(ws, 'F7');
  const shipping_address = readCellString(ws, 'B8');
  const request_memo = readCellString(ws, 'B9');

  const items: ParsedOrderItem[] = [];
  let total_quantity = 0;
  let total_amount = 0;

  for (let r = ITEMS_START_ROW; r <= ITEMS_END_ROW; r += 1) {
    const name = readCellString(ws, `D${r}`);
    const qty = readCellNumber(ws, `F${r}`);
    const price = readCellNumber(ws, `G${r}`);

    if (!name && qty === null && price === null) continue;

    if (!name) throw new Error(`${r}행 상품명이 비어있습니다.`);
    if (qty === null || qty < 1 || !Number.isInteger(qty)) {
      throw new Error(`${r}행(${name}): 수량이 올바르지 않습니다.`);
    }
    if (price === null || price < 0 || !Number.isInteger(price)) {
      throw new Error(`${r}행(${name}): 매입단가는 0 이상의 정수여야 합니다.`);
    }

    const computedAmount = qty * price;
    const explicitAmount = readCellNumber(ws, `H${r}`);
    if (explicitAmount !== null && (!Number.isInteger(explicitAmount) || explicitAmount < 0)) {
      throw new Error(`${r}행(${name}): 금액은 0 이상의 정수여야 합니다.`);
    }
    const amount = explicitAmount !== null && explicitAmount > 0 ? explicitAmount : computedAmount;

    items.push({
      no: items.length + 1,
      brand: readCellString(ws, `B${r}`),
      code: readCellString(ws, `C${r}`),
      name,
      option: readCellString(ws, `E${r}`),
      quantity: qty,
      unit_price: price,
      amount,
      memo: readCellString(ws, `I${r}`),
      shipping_request: readCellString(ws, `J${r}`),
    });

    total_quantity += qty;
    total_amount += computedAmount;
  }

  if (items.length === 0) throw new Error('주문 항목이 한 줄도 입력되지 않았습니다.');

  return {
    order_date,
    buyer_order_number,
    company_name,
    contact_person,
    buyer_phone,
    buyer_email,
    shipping_address,
    request_memo,
    items,
    total_quantity,
    total_amount,
  };
}
