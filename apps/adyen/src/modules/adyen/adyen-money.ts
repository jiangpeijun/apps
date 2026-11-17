export function resolveAdyenAmount({ amount, currency }: { amount: number, currency: string }) {
  const noDecimalCurrencies = ['JPY', 'KRW', 'VND'];
  if (noDecimalCurrencies.includes(currency)) {
    return { value: Math.round(amount), currency };
  }
  return { value: Math.round(amount * 100), currency };
}