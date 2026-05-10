// 1회용. node scripts/build-shipping-template.cjs 로 실행하면 public/shipping-template.xlsx 생성.
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('배송대행');
  ws.addRows([
    ['배송대행 업로드 양식', '', '', '', '', '', '', '', ''],
    ['CJ대한통운 기준 · 쿠팡/토스 통일 양식', '', '', '', '', '', '', '', ''],
    [],
    ['업로드 정보', '', '', '', '', '', '', '', ''],
    ['상호', '(예: ABC상사)', '담당자 연락처', '010-0000-0000', '', '', '', '', ''],
    ['요청사항', '(공통 메모, 선택)', '', '', '', '', '', '', ''],
    [],
    ['No', '받는사람*', '연락처*', '주소*', '관리코드*', '상품명/옵션', '수량*', '메모', '송장번호'],
    [1, '예시 홍길동', '010-1234-5678', '서울시 강남구 ...', 'SKR-001', '스니커즈/270', 1, '문 앞에 두세요', ''],
    [2, '', '', '', '', '', '', '', ''],
  ]);
  ws.columns = [
    { width: 5 },
    { width: 12 },
    { width: 14 },
    { width: 36 },
    { width: 14 },
    { width: 24 },
    { width: 6 },
    { width: 20 },
    { width: 16 },
  ];

  const outPath = path.resolve(__dirname, '..', 'public', 'shipping-template.xlsx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
