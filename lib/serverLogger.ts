import type { LogEntry } from "./readinessTypes";
export function createLogger() {
  const logs: LogEntry[] = [];
  const t0 = Date.now();
  const log = (level: LogEntry["level"], message: string, data?: any) => {
    logs.push({ ts: new Date().toISOString(), level, message, data: data ? sanitize(data) : undefined });
  };
  return {
    logs,
    info: (m: string, d?: any) => log("info", m, { elapsedMs: Date.now() - t0, ...(d || {}) }),
    warn: (m: string, d?: any) => log("warn", m, d),
    error: (m: string, d?: any) => log("error", m, d),
    http: (m: string, d?: any) => log("http", m, d),
    soql: (m: string, d?: any) => log("soql", m, d)
  };
}
function sanitize(obj: any): any {
  const SECRETS = ["password", "apitoken", "clientsecret", "securitytoken", "authorization", "sessionid"];
  if (obj == null) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRETS.some(s => k.toLowerCase().includes(s))) { out[k] = "***REDACTED***"; }
    else { out[k] = sanitize(v); }
  }
  return out;
}
