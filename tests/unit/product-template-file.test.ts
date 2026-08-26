import { describe, expect, it } from 'vitest';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { parseProductImportExcel } from '@/lib/product-import-parser';

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'product-template.xlsx');

async function loadTemplate(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  return wb;
}

// public/product-template.xlsx 는 손으로 만든 정적 파일이라
// PRODUCT_IMPORT_HEADERS 나 헤더 정규화 규칙이 바뀌면 조용히 어긋난다.
// 실제 파서를 그대로 태워서 확인한다.
describe('public/product-template.xlsx', () => {
  it('필수 3개 열은 헤더에 * 로 표시돼 있다', async () => {
    const header = (await loadTemplate()).worksheets[0]!.getRow(1);
    const text = (index: number) => {
      const value = header.getCell(index).value;
      if (value && typeof value === 'object' && 'richText' in value) {
        return (value.richText as { text: string }[]).map((part) => part.text).join('');
      }
      return String(value ?? '');
    };

    expect(text(3)).toBe('상품명*');
    expect(text(4)).toBe('옵션*');
    expect(text(5)).toBe('고객 판매가*');
    // 선택 항목에는 * 가 없어야 구분이 의미를 가진다
    expect(text(1)).toBe('제품이미지');
    expect(text(2)).toBe('브랜드');
    expect(text(9)).toBe('비고');
  });

  it('* 가 붙은 채로도 파서를 통과하고, 한 행을 채우면 그대로 읽힌다', async () => {
    const wb = await loadTemplate();
    const ws = wb.worksheets[0]!;
    ws.getRow(2).values = [null, '브랜드A', '상품A', '옵션A', 12000, 'MC-1', '카테고리A', '8801234567890', '비고A'];

    const parsed = await parseProductImportExcel(Buffer.from(await wb.xlsx.writeBuffer()));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.errors).toEqual([]);
    expect(parsed.rows[0]!.displayName).toBe('상품A / 옵션A');
    expect(parsed.rows[0]!.price).toBe(12000);
  });

  it('선택 항목만 비우면 통과하고, 필수 항목이 비면 오류가 난다', async () => {
    const wb = await loadTemplate();
    const ws = wb.worksheets[0]!;
    ws.getRow(2).values = [null, null, '상품B', '옵션B', 5000, null, null, null, null];
    ws.getRow(3).values = [null, '브랜드C', '상품C', null, null, null, null, null, null];

    const parsed = await parseProductImportExcel(Buffer.from(await wb.xlsx.writeBuffer()));

    expect(parsed.rows[0]!.errors).toEqual([]);
    expect(parsed.rows[1]!.errors).toEqual([
      '옵션이 비어 있습니다.',
      '고객 판매가는 0 이상의 정수여야 합니다.',
    ]);
  });
});
