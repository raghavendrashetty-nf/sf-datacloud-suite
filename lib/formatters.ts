export const fmtUSD = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0);
export const fmtNum = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v || 0);
export const fmtCredits = (v: number) => { const n = v || 0; if (n >= 1e9) return (n/1e9).toFixed(2) + "B"; if (n >= 1e6) return (n/1e6).toFixed(2) + "M"; if (n >= 1e3) return (n/1e3).toFixed(1) + "K"; return n.toFixed(0); };
