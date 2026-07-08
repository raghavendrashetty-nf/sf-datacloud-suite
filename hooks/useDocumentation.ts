"use client";
import { useCallback, useEffect, useState } from "react";
import defaultDocs from "@/config/documentationDefault.json";
const KEY = "sfdc.documentation.override.v1";
export function useDocumentation() {
  const [docs, setDocs] = useState<any>(defaultDocs);
  useEffect(() => { if (typeof window === "undefined") return; try { const raw = localStorage.getItem(KEY); if (raw) setDocs(JSON.parse(raw)); } catch {} }, []);
  const save = useCallback((next: any) => { setDocs(next); localStorage.setItem(KEY, JSON.stringify(next)); }, []);
  const reset = useCallback(() => { setDocs(defaultDocs); localStorage.removeItem(KEY); }, []);
  return { docs, save, reset };
}
