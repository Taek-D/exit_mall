export type InventoryRow = {
  product_id: string;
  product_name: string;
  quantity: number;
};

export type PendingShippingRow = {
  product_id: string;
  quantity: number;
};

export type AvailableInventoryRow = {
  product_id: string;
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

export function computeAvailableInventory(
  inventory: InventoryRow[],
  pendingShipments: PendingShippingRow[],
): AvailableInventoryRow[] {
  const reservedByProduct = new Map<string, number>();
  for (const r of pendingShipments) {
    reservedByProduct.set(
      r.product_id,
      (reservedByProduct.get(r.product_id) ?? 0) + r.quantity,
    );
  }

  const seen = new Set<string>();
  const result: AvailableInventoryRow[] = [];
  for (const inv of inventory) {
    seen.add(inv.product_id);
    const reserved = reservedByProduct.get(inv.product_id) ?? 0;
    result.push({
      product_id: inv.product_id,
      product_name: inv.product_name,
      quantity: inv.quantity,
      reserved,
      available: inv.quantity - reserved,
    });
  }
  // pending 만 있고 보유 0인 상품도 노출 (음수 가용 → 검토대기를 다 처리할 수 없음을 시각화)
  for (const [pid, reserved] of reservedByProduct) {
    if (seen.has(pid)) continue;
    result.push({
      product_id: pid,
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
