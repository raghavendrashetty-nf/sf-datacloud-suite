import type { SystemId } from "./readinessTypes";
const KEY = "sfdc.connections.v1";
export interface Connection { id: string; systemId: SystemId; name: string; savedAt: string; credentials: Record<string, string>; }
function uuid() { return (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 8); }
export function listConnections(): Connection[] { if (typeof window === "undefined") return []; try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } }
export function listConnectionsBySystem(id: SystemId): Connection[] { return listConnections().filter(c => c.systemId === id); }
export function addConnection(systemId: SystemId, name: string, credentials: Record<string, string>): Connection { const all = listConnections(); const c: Connection = { id: uuid(), systemId, name, savedAt: new Date().toISOString(), credentials }; all.unshift(c); localStorage.setItem(KEY, JSON.stringify(all)); return c; }
export function deleteConnection(id: string) { const all = listConnections().filter(c => c.id !== id); localStorage.setItem(KEY, JSON.stringify(all)); }
export function mask(v: string) { if (!v) return ""; if (v.length <= 4) return "****"; return v.slice(0, 2) + "***" + v.slice(-2); }
