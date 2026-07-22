export type InventoryRef =
  | { kind: 'product'; id: string }
  | { kind: 'custom'; id: string };

export type ProductLite = { id: string; name: string };
export type CustomInventoryLite = { id: string; name: string };

export type MatchResult =
  | { ok: true; refs: Map<string, InventoryRef> }
  | { ok: false; duplicates: string[]; unknown: string[] };

export function normalizeProductMatchKey(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '');
}

function displayDuplicateKey(key: string, inputNames: string[]): string {
  return inputNames.find((name) => normalizeProductMatchKey(name) === key) ?? key;
}

export function matchInventoryRefs(
  names: string[],
  products: ProductLite[],
  customs: CustomInventoryLite[],
): MatchResult {
  const inputNames = Array.from(new Set(names));
  const inputKeys = new Set(inputNames.map((name) => normalizeProductMatchKey(name)));
  const productByKey = new Map<string, string>();
  const duplicateKeys = new Set<string>();

  for (const product of products) {
    const key = normalizeProductMatchKey(product.name);
    if (productByKey.has(key)) {
      if (inputKeys.has(key)) duplicateKeys.add(key);
    } else {
      productByKey.set(key, product.id);
    }
  }

  const customByKey = new Map<string, string>();
  for (const custom of customs) {
    const key = normalizeProductMatchKey(custom.name);
    if (customByKey.has(key) && !productByKey.has(key)) {
      if (inputKeys.has(key)) duplicateKeys.add(key);
    } else if (!customByKey.has(key)) {
      customByKey.set(key, custom.id);
    }
  }

  if (duplicateKeys.size > 0) {
    return {
      ok: false,
      duplicates: Array.from(duplicateKeys).map((key) => displayDuplicateKey(key, inputNames)),
      unknown: [],
    };
  }

  const refs = new Map<string, InventoryRef>();
  const unknown: string[] = [];

  for (const name of inputNames) {
    const key = normalizeProductMatchKey(name);
    const pid = productByKey.get(key);
    if (pid) {
      refs.set(name, { kind: 'product', id: pid });
      continue;
    }
    const cid = customByKey.get(key);
    if (cid) {
      refs.set(name, { kind: 'custom', id: cid });
      continue;
    }
    unknown.push(name);
  }

  if (unknown.length > 0) {
    return { ok: false, duplicates: [], unknown };
  }
  return { ok: true, refs };
}

// ─────────────────────────────────────────────────────────────────────────────
// 배송대행 업로드 후보 산정 · 매칭 실패 메시지 (순수 로직 — Supabase 비의존)
// ─────────────────────────────────────────────────────────────────────────────

/** 표시 규칙: 앞 3개 이름 + 초과 시 ' …'(선행 공백 포함). */
function formatNameList(names: string[]): string {
  const shown = names.slice(0, 3).join(', ');
  const more = names.length > 3 ? ' …' : '';
  return `${shown}${more}`;
}

type PendingStockOrderRow = { status: string; items: unknown };

/**
 * 진행 중인 구매요청(status='pending')의 items[].product_id만 수집한다.
 * rejected/cancelled(및 approved)는 후보가 아니므로 제외한다(불변식). 중복 id는 1회.
 */
export function collectPendingOrderProductIds(rows: PendingStockOrderRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.status !== 'pending') continue;
    const items = Array.isArray(row.items) ? row.items : [];
    for (const item of items) {
      const productId = (item as { product_id?: unknown } | null)?.product_id;
      if (typeof productId === 'string' && productId.length > 0) ids.add(productId);
    }
  }
  return Array.from(ids);
}

/**
 * 후보 상품(=보유재고 + 진행 중 구매요청)을 product id 기준으로 합집합·중복 제거한다.
 * 보유재고를 먼저 넣어 동일 id 충돌 시 보유재고 쪽 이름을 유지한다(둘 다 현재 상품명이라 동일).
 */
export function mergeProductCandidates(sources: {
  ownedInventoryProducts: ProductLite[];
  pendingOrderProducts: ProductLite[];
}): ProductLite[] {
  const byId = new Map<string, ProductLite>();
  for (const product of sources.ownedInventoryProducts) {
    if (!byId.has(product.id)) byId.set(product.id, product);
  }
  for (const product of sources.pendingOrderProducts) {
    if (!byId.has(product.id)) byId.set(product.id, product);
  }
  return Array.from(byId.values());
}

/**
 * 후보에 없는 이름을 활성 카탈로그 존재 여부로 분류한다(진단 용도).
 * 매칭과 동일한 정규화(normalizeProductMatchKey)를 사용해 공백/문자 변형 오분류를 방지한다.
 */
export function classifyUnknownNames(
  unknownNames: string[],
  catalogNames: string[],
): { needsPurchaseRequest: string[]; notInCatalog: string[] } {
  const catalogKeys = new Set(catalogNames.map((name) => normalizeProductMatchKey(name)));
  const needsPurchaseRequest: string[] = [];
  const notInCatalog: string[] = [];
  for (const name of unknownNames) {
    if (catalogKeys.has(normalizeProductMatchKey(name))) {
      needsPurchaseRequest.push(name);
    } else {
      notInCatalog.push(name);
    }
  }
  return { needsPurchaseRequest, notInCatalog };
}

/**
 * matchInventoryRefs 실패 결과를 사용자 안내 메시지로 변환한다.
 *  - 중복: 기존 메시지 유지
 *  - 카탈로그에 있음(판매 중이나 구매요청/보유재고 없음): 상품 구매요청 유도
 *  - 카탈로그에 없음: 기존 "존재하지 않는 상품명" 메시지
 *  - 혼재: 그룹별로 각각 안내
 */
export function buildInventoryMatchError(
  result: Extract<MatchResult, { ok: false }>,
  catalogNames: string[],
): string {
  if (result.duplicates.length > 0) {
    return `같은 상품명의 상품이 여러 개입니다(상품 관리에서 중복 정리 필요): ${formatNameList(result.duplicates)}`;
  }
  const { needsPurchaseRequest, notInCatalog } = classifyUnknownNames(result.unknown, catalogNames);
  const parts: string[] = [];
  if (needsPurchaseRequest.length > 0) {
    parts.push(
      `판매 중이지만 구매요청/보유재고가 없는 상품이 있습니다. 먼저 상품 구매요청을 해주세요: ${formatNameList(needsPurchaseRequest)}`,
    );
  }
  if (notInCatalog.length > 0) {
    parts.push(`존재하지 않는 상품명이 있습니다: ${formatNameList(notInCatalog)}`);
  }
  return parts.join('\n');
}
