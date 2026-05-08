export type CartLine = { productId: string; name: string; price: number; quantity: number };

export function cartToStockOrderPayload(items: CartLine[]) {
  return {
    items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  };
}
