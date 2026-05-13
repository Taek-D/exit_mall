export type InventoryKey =
  | { kind: 'product'; product_id: string }
  | { kind: 'custom'; custom_inventory_id: string };

export type InventoryRow = {
  key: InventoryKey;
  product_name: string;
  quantity: number;
};

export type PendingShippingRow = {
  key: InventoryKey;
  quantity: number;
};

export type AvailableInventoryRow = {
  key: InventoryKey;
  product_name: string;
  quantity: number;
  reserved: number;
  available: number;
};

export type PendingStockOrderRow = {
  id: string;
  total_amount: number;
};

export type PendingShippingFeeRow = {
  id: string;
  shipping_fee_total: number;
};

export type AvailableDeposit = {
  balance: number;
  stockReserved: number;
  shippingReserved: number;
  available: number;
};

function keyToString(k: InventoryKey): string {
  return k.kind === 'product' ? `p:${k.product_id}` : `c:${k.custom_inventory_id}`;
}

export function computeAvailableInventory(
  inventory: InventoryRow[],
  pendingShipments: PendingShippingRow[],
): AvailableInventoryRow[] {
  const reservedByKey = new Map<string, number>();
  for (const r of pendingShipments) {
    const k = keyToString(r.key);
    reservedByKey.set(k, (reservedByKey.get(k) ?? 0) + r.quantity);
  }

  const seen = new Set<string>();
  const keyByString = new Map<string, InventoryKey>();
  for (const r of pendingShipments) keyByString.set(keyToString(r.key), r.key);

  const result: AvailableInventoryRow[] = [];
  for (const inv of inventory) {
    const k = keyToString(inv.key);
    seen.add(k);
    const reserved = reservedByKey.get(k) ?? 0;
    result.push({
      key: inv.key,
      product_name: inv.product_name,
      quantity: inv.quantity,
      reserved,
      available: inv.quantity - reserved,
    });
  }
  // pending 만 있고 보유 0인 상품도 노출 (음수 가용 → 검토대기를 다 처리할 수 없음을 시각화)
  for (const [k, reserved] of reservedByKey) {
    if (seen.has(k)) continue;
    result.push({
      key: keyByString.get(k)!,
      product_name: '(알 수 없는 상품)',
      quantity: 0,
      reserved,
      available: -reserved,
    });
  }
  return result;
}

export function computeAvailableDeposit(
  balance: number,
  pendingStockOrders: PendingStockOrderRow[],
  pendingShippingFees: PendingShippingFeeRow[],
): AvailableDeposit {
  const stockReserved = pendingStockOrders.reduce((s, r) => s + r.total_amount, 0);
  const shippingReserved = pendingShippingFees.reduce((s, r) => s + r.shipping_fee_total, 0);
  return {
    balance,
    stockReserved,
    shippingReserved,
    available: balance - stockReserved - shippingReserved,
  };
}
