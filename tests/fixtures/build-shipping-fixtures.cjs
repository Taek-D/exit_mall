// node tests/fixtures/build-shipping-fixtures.cjs 로 실행 → 픽스처 .xlsx 들 생성.
const XLSX = require('xlsx');
const path = require('path');

const HEADER_ROW = ['No', '받는사람', '연락처', '주소', '관리코드', '상품명/옵션', '수량', '메모', '송장번호'];

function build(name, rowsAfterHeader) {
  const wb = XLSX.utils.book_new();
  const aoa = [
    ['배송대행 양식', '', '', '', '', '', '', '', ''],
    [],
    ['상호', '예시상사', '담당자 연락처', '010-1111-1111', '', '', '', '', ''],
    ['요청사항', '안전 배송', '', '', '', '', '', '', ''],
    [],
    [],
    [],
    HEADER_ROW,
    ...rowsAfterHeader,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, '배송대행');
  const outPath = path.resolve(__dirname, name);
  XLSX.writeFile(wb, outPath);
  console.log('Wrote', outPath);
}

build('shipping-valid.xlsx', [
  [1, '홍길동', '010-1234-5678', '서울시 강남구 1', 'SKR-001', '스니커즈/270', 1, '문 앞', ''],
  [2, '김철수', '010-2222-3333', '서울시 마포구 2', 'SKR-001', '스니커즈/280', 2, '', ''],
  [3, '박영희', '010-4444-5555', '부산시 수영구 3', 'TSH-002', '티셔츠/L', 1, '경비실', ''],
]);

build('shipping-empty.xlsx', []);

build('shipping-missing-recipient.xlsx', [
  [1, '', '010-1234-5678', '서울시 1', 'SKR-001', '스니커즈', 1, '', ''],
]);

build('shipping-bad-quantity.xlsx', [
  [1, '홍길동', '010-1234-5678', '서울시 1', 'SKR-001', '스니커즈', -1, '', ''],
]);

build('shipping-with-tracking.xlsx', [
  [1, '홍길동', '010-1234-5678', '서울시 1', 'SKR-001', '스니커즈', 1, '', '632012345678'],
  [2, '김철수', '010-2222-3333', '서울시 2', 'SKR-001', '스니커즈', 1, '', ''],
]);

build('shipping-with-tracking-partial.xlsx', [
  [1, '홍길동', '010-1234-5678', '서울시 1', 'SKR-001', '스니커즈', 1, '', '632012345678'],
  [2, '김철수', '010-2222-3333', '서울시 2', 'SKR-001', '스니커즈', 1, '', ''],
  [3, '박영희', '010-4444-5555', '부산시 3', 'TSH-002', '티셔츠', 1, '', '632099998888'],
]);
