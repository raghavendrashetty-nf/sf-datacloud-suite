export function fmtUSD(n: number): string {
  if (!isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    maximumFractionDigits: n >= 100 ? 0 : 2
  }).format(n);
}

export function fmtCredits(n: number): string {
  if (!isFinite(n)) return '0';
  if (n === 0) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: n >= 100 ? 0 : 2
  }).format(n);
}

export function fmtNumber(n: number): string {
  if (!isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}
