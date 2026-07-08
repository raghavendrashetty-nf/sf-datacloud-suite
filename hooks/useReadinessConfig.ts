"use client";
import { useCallback, useEffect, useState } from "react";
import defaultCfg from "@/config/readinessSystemsDefault.json";
const KEY = "sfdc.readinessCfg.override.v1";
export function useReadinessConfig() {
  const [config, setConfig] = useState<any>(defaultCfg);
  useEffect(() => { if (typeof window === "undefined") return; try { const raw = localStorage.getItem(KEY); if (raw) setConfig(JSON.parse(raw)); } catch {} }, []);
  const save = useCallback((next: any) => { setConfig(next); localStorage.setItem(KEY, JSON.stringify(next)); }, []);
  const reset = useCallback(() => { setConfig(defaultCfg); localStorage.removeItem(KEY); }, []);
  return { config, save, reset };
}
