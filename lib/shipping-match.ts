export type InventoryRef =
  | { kind: 'product'; id: string }
  | { kind: 'custom'; id: string };

export type ProductLite = { id: string; name: string };
export type CustomInventoryLite = { id: string; name: string };

export type MatchResult =
  | { ok: true; refs: Map<string, InventoryRef> }
  | { ok: false; duplicates: string[]; unknown: string[] };

export function matchInventoryRefs(
  names: string[],
  products: ProductLite[],
  customs: CustomInventoryLite[],
): MatchResult {
  const productByName = new Map<string, string>();
  const duplicates: string[] = [];
  for (const p of products) {
    if (productByName.has(p.name)) {
      if (!duplicates.includes(p.name)) duplicates.push(p.name);
    } else {
      productByName.set(p.name, p.id);
    }
  }
  if (duplicates.length > 0) {
    return { ok: false, duplicates, unknown: [] };
  }

  const customByName = new Map<string, string>();
  for (const c of customs) {
    if (!customByName.has(c.name)) customByName.set(c.name, c.id);
  }

  const refs = new Map<string, InventoryRef>();
  const unknown: string[] = [];
  const uniqueNames = Array.from(new Set(names));
  for (const name of uniqueNames) {
    const pid = productByName.get(name);
    if (pid) {
      refs.set(name, { kind: 'product', id: pid });
      continue;
    }
    const cid = customByName.get(name);
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
