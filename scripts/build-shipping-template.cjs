// Generates the official CJ-style shipping upload template.
// Run with: node scripts/build-shipping-template.cjs
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADER_ROW = 8;
const TRACKING_COL = 9;
const TEXT_FMT = '@';
const ROWS_TO_FORMAT = 1000;

const HEADER = [
  'No',
  '받는분성명',
  '받는분전화번호',
  '받는분주소(전체, 분할)',
  '품목명',
  '내품명',
  '내품수량',
  '배송메세지1',
  '송장번호',
];

function applyTrackingTextFormat(ws) {
  ws.getColumn(TRACKING_COL).numFmt = TEXT_FMT;
  for (let row = HEADER_ROW; row <= HEADER_ROW + ROWS_TO_FORMAT; row += 1) {
    ws.getRow(row).getCell(TRACKING_COL).numFmt = TEXT_FMT;
  }
}

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('배송대행');

  ws.addRows([
    ['배송대행 업로드 양식', '', '', '', '', '', '', '', ''],
    ['CJ대한통운 기준 통합 양식', '', '', '', '', '', '', '', ''],
    [],
    ['업로드 정보', '', '', '', '', '', '', '', ''],
    ['상호', '(예: ABC상사)', '담당자 연락처', '010-0000-0000', '', '', '', '', ''],
    ['요청사항', '(공통 메모, 선택)', '', '', '', '', '', '', ''],
    [],
    HEADER,
    [
      1,
      '홍길동',
      '010-5555-6666',
      '서울시 도봉구 해등로180, 203호 자동문앞',
      'TEST',
      '',
      1,
      '문 앞에 두세요',
      521853092894,
    ],
    [2, '', '', '', '', '', '', '', ''],
  ]);

  ws.columns = [
    { width: 5 },
    { width: 14 },
    { width: 16 },
    { width: 36 },
    { width: 14 },
    { width: 24 },
    { width: 8 },
    { width: 20 },
    { width: 16 },
  ];
  applyTrackingTextFormat(ws);

  const outPath = path.resolve(__dirname, '..', 'public', 'shipping-template.xlsx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
