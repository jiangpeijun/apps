export function resolveAdyenAmount(
  saleorAmount: { amount: number; currency: string }
): { value: number; currency: string } {
  return {
    value: Math.round(saleorAmount.amount * 100),
    currency: saleorAmount.currency,
  };
}