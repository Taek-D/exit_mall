// node tests/fixtures/build-shipping-fixtures.cjs 로 실행하면 픽스처 .xlsx 파일을 생성한다.
const ExcelJS = require('exceljs');
const path = require('path');

const HEADER_ROW = [
  'No',
  '받는사람',
  '연락처',
  '주소',
  '상품명',
  '옵션',
  '수량',
  '메모',
  '송장번호',
];

async function build(name, rowsAfterHeader) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('배송대행');
  ws.addRows([
    ['배송대행 양식', '', '', '', '', '', '', '', ''],
    [],
    ['상호', '예시상사', '담당자 연락처', '010-1111-1111', '', '', '', '', ''],
    ['요청사항', '안전 배송', '', '', '', '', '', '', ''],
    [],
    [],
    [],
    HEADER_ROW,
    ...rowsAfterHeader,
  ]);
  const outPath = path.resolve(__dirname, name);
  await wb.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
}

async function main() {
  await build('shipping-valid.xlsx', [
    [1, '홍길동', '010-1234-5678', '서울시 강남구 1', '스니커즈', '270', 1, '문 앞', ''],
    [2, '김철수', '010-2222-3333', '서울시 마포구 2', '스니커즈', '280', 2, '', ''],
    [3, '박영희', '010-4444-5555', '부산시 수영구 3', '티셔츠', 'L', 1, '경비실', ''],
  ]);

  await build('shipping-empty.xlsx', []);
  await build('shipping-missing-recipient.xlsx', [
    [1, '', '010-1234-5678', '서울시 1', '스니커즈', '270', 1, '', ''],
  ]);
  await build('shipping-bad-quantity.xlsx', [
    [1, '홍길동', '010-1234-5678', '서울시 1', '스니커즈', '270', -1, '', ''],
  ]);
  await build('shipping-with-tracking.xlsx', [
    [1, '홍길동', '010-1234-5678', '서울시 1', '스니커즈', '270', 1, '', '632012345678'],
    [2, '김철수', '010-2222-3333', '서울시 2', '스니커즈', '280', 1, '', ''],
  ]);
  await build('shipping-with-tracking-partial.xlsx', [
    [1, '홍길동', '010-1234-5678', '서울시 1', '스니커즈', '270', 1, '', '632012345678'],
    [2, '김철수', '010-2222-3333', '서울시 2', '스니커즈', '280', 1, '', ''],
    [3, '박영희', '010-4444-5555', '부산시 3', '티셔츠', 'L', 1, '', '632099998888'],
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
