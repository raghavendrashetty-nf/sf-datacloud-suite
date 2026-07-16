export function fmtUSD(n: number): string {
  if (!isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
}
export function fmtCredits(n: number): string {
  if (!isFinite(n)) return '0';
  if (n === 0) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
}
export function fmtNumber(n: number): string {
  if (!isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}
// A bare number reads ambiguously (rows? dollars? credits?) - spell out the unit so it
// stands on its own without relying on a separate caption/label elsewhere on the page.
export function fmtCreditsLabel(n: number): string {
  const formatted = fmtCredits(n);
  return `${formatted} ${formatted === '1' ? 'Credit' : 'Credits'}`;
}
