/**
 * Currency formatting utilities
 */

export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function parseCurrencyString(currencyString: string): number {
  const cleaned = currencyString.replace(/[$,]/g, '');
  const value = parseFloat(cleaned);

  if (isNaN(value)) {
    throw new Error(`Invalid currency string: ${currencyString}`);
  }

  return value;
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function calculatePercentageChange(
  current: number,
  baseline: number
): number {
  if (baseline === 0) {
    return current > 0 ? 100 : 0;
  }

  return ((current - baseline) / baseline) * 100;
}
