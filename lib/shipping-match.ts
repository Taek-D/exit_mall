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
