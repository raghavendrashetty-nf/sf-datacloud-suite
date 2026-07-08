import type { CalculatorInputs } from "./types";
const KEY = "sfdc.scenarios.v1";
export interface Scenario { id: string; name: string; savedAt: string; inputs: CalculatorInputs; }
function uuid() { return (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 8); }
export function listScenarios(): Scenario[] { if (typeof window === "undefined") return []; try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } }
export function saveScenario(name: string, inputs: CalculatorInputs): Scenario { const all = listScenarios(); const s: Scenario = { id: uuid(), name, savedAt: new Date().toISOString(), inputs }; all.unshift(s); localStorage.setItem(KEY, JSON.stringify(all)); return s; }
export function deleteScenario(id: string) { const all = listScenarios().filter(s => s.id !== id); localStorage.setItem(KEY, JSON.stringify(all)); }
export function exportScenariosJSON(): string { return JSON.stringify(listScenarios(), null, 2); }
export function importScenariosJSON(json: string): number { const parsed = JSON.parse(json); if (!Array.isArray(parsed)) throw new Error("Invalid file"); const existing = listScenarios(); const merged = [...parsed, ...existing.filter(e => !parsed.find((p: Scenario) => p.id === e.id))]; localStorage.setItem(KEY, JSON.stringify(merged)); return parsed.length; }
